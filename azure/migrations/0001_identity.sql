-- Independent Azure history. Supabase migrations remain unchanged.
-- Runtime credentials must be non-owner, non-superuser and non-BYPASSRLS.
do $$ begin
  if not exists(select 1 from pg_roles where rolname = 'soyl_auth') then
    create role soyl_auth nologin nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
end $$;
create schema identity;
revoke all on schema identity from public;
grant usage on schema identity to soyl_auth;

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text,
  email_verified boolean not null default false,
  display_name text,
  status text not null default 'active' check(status in ('active','disabled','deleted')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.app_users enable row level security;
revoke all on public.app_users from public;

create table identity.provider_identities (
  issuer text not null check(length(issuer) between 1 and 512),
  subject text not null check(length(subject) between 1 and 255),
  user_id uuid not null references public.app_users(id),
  primary key (issuer,subject)
);
create table identity.sessions (
  token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references public.app_users(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp()
);
create index identity_sessions_user on identity.sessions(user_id);
create index identity_sessions_expiry on identity.sessions(expires_at);
create table identity.oauth_transactions (
  state_hash text primary key check(state_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null default clock_timestamp() + interval '10 minutes'
);
create index identity_transactions_expiry on identity.oauth_transactions(expires_at);
create table identity.native_handoffs (
  ticket_hash text primary key check(ticket_hash ~ '^[0-9a-f]{64}$'),
  challenge text not null check(challenge ~ '^[A-Za-z0-9_-]{43}$'),
  user_id uuid not null references public.app_users(id),
  next_path text not null,
  expires_at timestamptz not null default clock_timestamp() + interval '2 minutes'
);
create index identity_handoffs_expiry on identity.native_handoffs(expires_at);
revoke all on all tables in schema identity from public;

create function identity.begin_oauth(p_state_hash text)
returns void language sql security definer set search_path = pg_catalog, identity as $$
  insert into identity.oauth_transactions(state_hash) values(p_state_hash);
$$;
create function identity.consume_oauth(p_state_hash text)
returns boolean language sql security definer set search_path = pg_catalog, identity as $$
  with consumed as (
    delete from identity.oauth_transactions where state_hash=p_state_hash and expires_at > clock_timestamp() returning 1
  ) select exists(select 1 from consumed);
$$;

-- Linking is exclusively by verified issuer/subject; emails are never identity keys.
create function identity.resolve_user(p_issuer text, p_subject text, p_email text, p_verified boolean, p_name text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, identity as $$
declare v_id uuid; v_status text;
begin
  if length(p_issuer) not between 1 and 512 or length(p_subject) not between 1 and 255
     or p_issuer is null or p_subject is null then raise exception 'Invalid provider identity'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_issuer || chr(31) || p_subject, 0));
  select user_id into v_id from identity.provider_identities where issuer=p_issuer and subject=p_subject;
  if v_id is null then
    insert into public.app_users(email,email_verified,display_name)
      values(left(p_email,320),coalesce(p_verified,false),left(p_name,255)) returning id into v_id;
    insert into identity.provider_identities(issuer,subject,user_id) values(p_issuer,p_subject,v_id);
  else
    select status into v_status from public.app_users where id=v_id for update;
    if v_status <> 'active' then raise exception 'Account unavailable'; end if;
    update public.app_users set email=left(p_email,320),email_verified=coalesce(p_verified,false),
      display_name=coalesce(left(p_name,255),display_name),updated_at=clock_timestamp() where id=v_id;
  end if;
  return v_id;
end;
$$;

create function identity.create_session(p_user_id uuid, p_token_hash text)
returns void language plpgsql security definer set search_path = pg_catalog, public, identity as $$
begin
  perform 1 from public.app_users where id=p_user_id and status='active' for update;
  if not found then raise exception 'Account unavailable'; end if;
  insert into identity.sessions(token_hash,user_id,expires_at)
    values(p_token_hash,p_user_id,clock_timestamp()+interval '30 days');
end;
$$;
create function identity.read_session(p_token_hash text)
returns table(id uuid,email text,email_verified boolean,display_name text)
language sql stable security definer set search_path = pg_catalog, public, identity as $$
  select u.id,u.email,u.email_verified,u.display_name from identity.sessions s
    join public.app_users u on u.id=s.user_id
    where s.token_hash=p_token_hash and s.expires_at>statement_timestamp() and u.status='active';
$$;
create function identity.revoke_session(p_token_hash text)
returns void language sql security definer set search_path = pg_catalog, identity as $$
  delete from identity.sessions where token_hash=p_token_hash;
$$;

create function identity.create_handoff(p_user_id uuid,p_ticket_hash text,p_challenge text,p_next text)
returns void language plpgsql security definer set search_path = pg_catalog, public, identity as $$
begin
  perform 1 from public.app_users where id=p_user_id and status='active' for update;
  if not found then raise exception 'Account unavailable'; end if;
  if p_next is null or length(p_next)>2048 or left(p_next,1)<>'/' or left(p_next,2)='//' or position(chr(92) in p_next)>0 then
    raise exception 'Invalid next path';
  end if;
  insert into identity.native_handoffs(ticket_hash,challenge,user_id,next_path)
    values(p_ticket_hash,p_challenge,p_user_id,p_next);
end;
$$;
create function identity.redeem_handoff(p_ticket_hash text,p_challenge text,p_token_hash text)
returns text language plpgsql security definer set search_path = pg_catalog, public, identity as $$
declare v_handoff identity.native_handoffs%rowtype;
begin
  -- DELETE obtains the row lock and returns exactly once, including across replicas.
  delete from identity.native_handoffs where ticket_hash=p_ticket_hash and challenge=p_challenge
    and expires_at>clock_timestamp() returning * into v_handoff;
  if not found then return null; end if;
  perform identity.create_session(v_handoff.user_id,p_token_hash);
  return v_handoff.next_path;
end;
$$;

create function identity.cleanup_expired()
returns void language plpgsql security definer set search_path = pg_catalog, identity as $$
begin
  delete from identity.sessions where expires_at<=clock_timestamp();
  delete from identity.oauth_transactions where expires_at<=clock_timestamp();
  delete from identity.native_handoffs where expires_at<=clock_timestamp();
end;
$$;
revoke all on all functions in schema identity from public;
grant execute on function identity.begin_oauth(text),identity.consume_oauth(text),
  identity.resolve_user(text,text,text,boolean,text),identity.create_session(uuid,text),
  identity.read_session(text),identity.revoke_session(text),
  identity.create_handoff(uuid,text,text,text),identity.redeem_handoff(text,text,text) to soyl_auth;
-- Cleanup is deliberately reserved for the migration/worker identity.
