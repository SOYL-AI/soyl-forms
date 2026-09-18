-- 0004_publish_fix: `publish_form` failed with
--   `column reference "version_number" is ambiguous`.
--
-- Cause: the function RETURNS TABLE (version_id, version_number), which puts
-- both names in scope as variables. The unqualified `max(version_number)`
-- could therefore mean the OUT parameter or the table column.
-- Fix: qualify every column reference (logic unchanged).

create or replace function publish_form(
  p_form_id uuid,
  p_schema jsonb,
  p_theme jsonb,
  p_settings jsonb,
  p_published_by uuid
)
returns table (version_id uuid, version_number integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_num integer;
  v_id uuid;
begin
  perform 1 from forms f where f.id = p_form_id for update;
  if not found then
    raise exception 'FORM_NOT_FOUND';
  end if;

  select coalesce(max(fv.version_number), 0) + 1 into v_num
  from form_versions fv
  where fv.form_id = p_form_id;

  insert into form_versions (form_id, version_number, schema, theme, settings, published_by)
  values (p_form_id, v_num, p_schema, p_theme, p_settings, p_published_by)
  returning form_versions.id into v_id;

  update forms f
  set published_version_id = v_id,
      status = 'published',
      published_at = now(),
      updated_at = now()
  where f.id = p_form_id;

  return query select v_id, v_num;
end;
$$;

-- Preserve the Phase 3 lockdown (CREATE OR REPLACE keeps privileges in
-- practice, but re-assert so the intent is versioned and re-runnable).
revoke all on function publish_form(uuid, jsonb, jsonb, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function publish_form(uuid, jsonb, jsonb, jsonb, uuid)
  to service_role;
