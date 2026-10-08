-- Serialize expiry with submission/file attachment, using the same workspace lock.
create or replace function public.expire_pending_upload(p_id uuid, p_cutoff timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_file uploaded_files%rowtype;
begin
  select * into v_file from uploaded_files where id = p_id;
  if not found then return null; end if;
  perform 1 from workspaces where id = v_file.workspace_id for update;
  select * into v_file from uploaded_files where id = p_id for update;
  if not found or v_file.status <> 'pending' or v_file.submission_id is not null
     or v_file.created_at >= p_cutoff then return null; end if;
  update uploaded_files set status = 'deleted' where id = p_id;
  return jsonb_build_object('id', v_file.id, 'r2_key', v_file.r2_key);
end;
$$;
revoke all on function public.expire_pending_upload(uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.expire_pending_upload(uuid,timestamptz) to service_role;
