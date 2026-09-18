-- 0002_fix_forms_rls: inserts were rejected.
--
-- Root cause: "editors_write_forms" was `FOR ALL ... USING (...)` with no
-- WITH CHECK clause. PostgreSQL does not apply USING to INSERTs, so every
-- insert was denied. Split into per-command policies with explicit checks.
--
-- Second issue fixed here: RLS is enabled on workspace_members with no
-- select policy, which also made every membership EXISTS() subquery in other
-- policies evaluate to false. Members can now read their own membership rows
-- (required for the tenant checks on forms/versions/submissions to pass).

-- 1. Replace the broken FOR ALL policy on forms ------------------------------
drop policy if exists "editors_write_forms" on forms;

create policy "editors_insert_forms" on forms
  for insert with check (
    exists (
      select 1 from workspace_members m
      where m.workspace_id = forms.workspace_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'editor')
    )
  );

create policy "editors_update_forms" on forms
  for update using (
    exists (
      select 1 from workspace_members m
      where m.workspace_id = forms.workspace_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'editor')
    )
  )
  with check (
    exists (
      select 1 from workspace_members m
      where m.workspace_id = forms.workspace_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'editor')
    )
  );

-- No delete policy: forms are soft-archived via status, never hard-deleted.

-- 2. Let members read their own membership rows --------------------------------
-- (Without this, every tenant EXISTS() check above and in other policies
-- silently fails because the inner query on workspace_members returns nothing.)
drop policy if exists "users_read_own_memberships" on workspace_members;
create policy "users_read_own_memberships" on workspace_members
  for select using (auth.uid() = user_id);

-- 3. Let users create their own profile row -------------------------------------
-- (Signup has no trigger; provisioning happens lazily via service role, but
-- the client path should also work for profile creation.)
drop policy if exists "users_insert_own_profile" on profiles;
create policy "users_insert_own_profile" on profiles
  for insert with check (auth.uid() = id);
