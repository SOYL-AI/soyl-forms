create function platform.payment_provider(p_workspace uuid,p_form uuid default null) returns jsonb
language sql stable security definer set search_path=pg_catalog,public,platform as $$
  select jsonb_build_object('key_id',p.key_id,'secret_encrypted',p.secret_encrypted,'mode',p.mode,'status',p.status)
    from workspace_payment_providers p join workspaces w on w.id=p.workspace_id
    where p.workspace_id=p_workspace and w.status='active' and p.status='active' and (
      platform.can_access(p_workspace,'admin') or exists(select 1 from forms where id=p_form and workspace_id=p_workspace and status in ('published','closed')));
$$;
create function platform.provider_status(p_workspace uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,platform as $$
begin
  if not platform.can_access(p_workspace,'admin') then raise exception 'Not authorized' using errcode='42501'; end if;
  return (select jsonb_build_object('key_id',key_id,'mode',mode,'updated_at',updated_at) from workspace_payment_providers where workspace_id=p_workspace and status='active');
end $$;
create function platform.save_provider(p_workspace uuid,p_key text,p_secret text,p_mode text) returns void
language plpgsql security definer set search_path=pg_catalog,public,platform as $$
begin
  perform 1 from workspaces where id=p_workspace for update;
  if not platform.can_access(p_workspace,'admin') then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_key is null then delete from workspace_payment_providers where workspace_id=p_workspace;
  else
    if p_mode not in ('test','live') or p_secret is null then raise exception 'Invalid provider'; end if;
    insert into workspace_payment_providers(workspace_id,key_id,secret_encrypted,mode,connected_by)
      values(p_workspace,p_key,p_secret,p_mode,platform.actor_id()) on conflict(workspace_id) do update
      set key_id=excluded.key_id,secret_encrypted=excluded.secret_encrypted,mode=excluded.mode,status='active',connected_by=excluded.connected_by,updated_at=now();
  end if;
  insert into audit_logs(actor_user_id,actor_type,workspace_id,action,target_type,target_id,metadata)
    values(platform.actor_id(),'user',p_workspace,case when p_key is null then 'payments.provider.disconnected' else 'payments.provider.connected' end,'workspace',p_workspace::text,jsonb_build_object('mode',p_mode));
end $$;

create function platform.record_payment(p_file jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_workspace uuid:=(p_file->>'workspace_id')::uuid; v_form uuid:=(p_file->>'form_id')::uuid;
begin
  perform 1 from workspaces where id=v_workspace and status='active' for update;
  if not found or not exists(select 1 from forms f join form_versions v on v.form_id=f.id
    where f.id=v_form and f.workspace_id=v_workspace and f.status='published' and v.id=(p_file->>'form_version_id')::uuid
    and exists(select 1 from jsonb_array_elements(v.schema->'blocks') b where b->>'id'=p_file->>'block_id' and b->>'type'='payment')) then raise exception 'Form unavailable'; end if;
  if (p_file->>'amount_paise')::integer<=0 then raise exception 'Invalid amount'; end if;
  insert into form_payments(workspace_id,form_id,form_version_id,block_id,order_id,amount_paise,currency,status,respondent_email)
    values(v_workspace,v_form,(p_file->>'form_version_id')::uuid,p_file->>'block_id',p_file->>'order_id',(p_file->>'amount_paise')::integer,'INR','created',p_file->>'respondent_email');
end $$;
create function platform.read_payment(p_form uuid,p_order text) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('id',p.id,'status',p.status,'amount_paise',p.amount_paise,'payment_id',p.payment_id)
    from form_payments p join workspaces w on w.id=p.workspace_id where p.form_id=p_form and p.order_id=p_order and w.status='active';
$$;
create function platform.confirm_payment(p_form uuid,p_order text,p_payment text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_row form_payments%rowtype;
begin
  select * into v_row from form_payments where form_id=p_form and order_id=p_order for update;
  if not found then return false; end if;
  if v_row.status='paid' then return v_row.payment_id=p_payment; end if;
  if v_row.status<>'created' or p_payment !~ '^pay_[A-Za-z0-9]+$' then return false; end if;
  update form_payments set status='paid',payment_id=p_payment,paid_at=now() where id=v_row.id;
  return true;
end $$;
create unique index form_payment_identity on form_payments(payment_id) where payment_id is not null;
revoke all on function platform.payment_provider(uuid,uuid),platform.provider_status(uuid),platform.save_provider(uuid,text,text,text),platform.record_payment(jsonb),platform.read_payment(uuid,text),platform.confirm_payment(uuid,text,text) from public;
grant execute on function platform.payment_provider(uuid,uuid),platform.provider_status(uuid),platform.save_provider(uuid,text,text,text),platform.record_payment(jsonb),platform.read_payment(uuid,text),platform.confirm_payment(uuid,text,text) to soyl_app;
