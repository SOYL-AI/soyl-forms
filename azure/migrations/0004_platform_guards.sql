-- Cover SET ROLE to an inherited runtime role as well as the login role.
create or replace function platform.guard_form_update() returns trigger
language plpgsql set search_path=pg_catalog,public,platform as $$
begin
  if new.status='published' and (tg_op='INSERT' or old.status<>'published')
     and current_user<>(select pg_get_userbyid(relowner) from pg_class where oid='public.forms'::regclass) then
    raise exception 'Use the authorized publish operation' using errcode='42501';
  end if;
  if new.brand_kit_id is not null and not exists(select 1 from public.brand_kits b where b.id=new.brand_kit_id and b.workspace_id=new.workspace_id) then
    raise exception 'Brand kit is outside the form workspace' using errcode='42501';
  end if;
  return new;
end $$;

grant update(name,updated_at) on workspaces to soyl_app;
create policy workspace_rename on workspaces for update to soyl_app using(platform.can_access(id,'admin')) with check(platform.can_access(id,'admin'));

create function platform.public_form_plan(p_form_id uuid) returns text
language sql stable security definer set search_path=pg_catalog,public as $$
  select case
    when s.override_reason is not null and s.override_reason<>'' and (s.override_expires_at is null or s.override_expires_at>statement_timestamp()) then s.plan_code
    when s.status in ('authenticated','active') then s.plan_code else 'free' end
  from forms f join workspaces w on w.id=f.workspace_id left join subscriptions s on s.workspace_id=w.id
  where f.id=p_form_id and f.published_version_id is not null and f.status in ('published','closed') and w.status='active';
$$;
create function platform.public_submission_receipt(p_form_id uuid,p_key text) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('id',s.id,'form_version_id',s.form_version_id,'answers',s.answers)
  from submissions s join forms f on f.id=s.form_id join workspaces w on w.id=f.workspace_id
  where s.form_id=p_form_id and s.idempotency_key=p_key and length(p_key) between 16 and 100
    and f.published_version_id is not null and f.status in ('published','closed') and w.status='active';
$$;
create function platform.public_response_count(p_form_id uuid) returns bigint
language sql stable security definer set search_path=pg_catalog,public as $$
  select count(*) from submissions s join forms f on f.id=s.form_id join workspaces w on w.id=f.workspace_id
  where s.form_id=p_form_id and s.deleted_at is null and f.published_version_id is not null
    and f.status in ('published','closed') and w.status='active';
$$;
revoke all on function platform.public_form_plan(uuid),platform.public_submission_receipt(uuid,text),platform.public_response_count(uuid) from public;
grant execute on function platform.public_form_plan(uuid),platform.public_submission_receipt(uuid,text),platform.public_response_count(uuid) to soyl_app;
