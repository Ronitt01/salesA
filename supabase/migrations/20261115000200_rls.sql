-- Row Level Security: tenant isolation plus role-based writes.
--
-- Roles:  owner / admin  manage configuration and can delete
--         member         works leads, opportunities, campaigns, conversations
--         viewer         read-only
--
-- The service_role key bypasses RLS and is used only in server-only modules
-- (seed, webhook ingestion, workflow runner). The browser never receives it.

-- ---------------------------------------------------------------------------
-- Helper functions (private schema is not exposed through the API)
-- ---------------------------------------------------------------------------
create function private.is_member(target_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = target_tenant and m.user_id = (select auth.uid())
  );
$$;

create function private.has_role(target_tenant uuid, allowed public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = target_tenant
      and m.user_id = (select auth.uid())
      and m.role = any (allowed)
  );
$$;

create function private.shares_workspace_with(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.tenant_id = mine.tenant_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = other_user
  );
$$;

grant usage on schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;
grant execute on function private.is_member(uuid) to authenticated, service_role;
grant execute on function private.has_role(uuid, public.member_role[]) to authenticated, service_role;
grant execute on function private.shares_workspace_with(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('revoke all on public.%I from anon', t.tablename);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Identity tables
-- ---------------------------------------------------------------------------
create policy workspaces_select on public.workspaces
  for select to authenticated using (private.is_member(id));
create policy workspaces_update on public.workspaces
  for update to authenticated
  using (private.has_role(id, array['owner', 'admin']::public.member_role[]))
  with check (private.has_role(id, array['owner', 'admin']::public.member_role[]));
-- Workspaces are created and deleted by the service role only.

create policy users_select on public.users
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_workspace_with(id));
create policy users_update_self on public.users
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy memberships_select on public.memberships
  for select to authenticated using (private.is_member(tenant_id));
create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (private.has_role(tenant_id, array['owner', 'admin']::public.member_role[]));
create policy memberships_update on public.memberships
  for update to authenticated
  using (private.has_role(tenant_id, array['owner', 'admin']::public.member_role[]))
  with check (private.has_role(tenant_id, array['owner', 'admin']::public.member_role[]));
create policy memberships_delete on public.memberships
  for delete to authenticated
  using (private.has_role(tenant_id, array['owner', 'admin']::public.member_role[]));

-- ---------------------------------------------------------------------------
-- Working data: members read and write, admins delete
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'sources', 'companies', 'contacts', 'contact_verifications', 'research_records',
    'buying_signals', 'opportunities', 'lead_score_snapshots', 'campaigns',
    'campaign_contacts', 'conversations', 'messages', 'consent_records', 'suppressions',
    'meetings', 'activities', 'workflow_executions', 'industry_experiments'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.is_member(tenant_id))',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.has_role(tenant_id, array[''owner'', ''admin'', ''member'']::public.member_role[]))',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.has_role(tenant_id, array[''owner'', ''admin'', ''member'']::public.member_role[])) with check (private.has_role(tenant_id, array[''owner'', ''admin'', ''member'']::public.member_role[]))',
      t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (private.has_role(tenant_id, array[''owner'', ''admin'']::public.member_role[]))',
      t || '_delete', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Configuration: members read, only owners and admins write
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'industries', 'service_catalogue', 'channel_policies', 'workflow_jobs', 'provider_settings'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.is_member(tenant_id))',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.has_role(tenant_id, array[''owner'', ''admin'']::public.member_role[]))',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.has_role(tenant_id, array[''owner'', ''admin'']::public.member_role[])) with check (private.has_role(tenant_id, array[''owner'', ''admin'']::public.member_role[]))',
      t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (private.has_role(tenant_id, array[''owner'', ''admin'']::public.member_role[]))',
      t || '_delete', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Saved filters: private to the user who created them
-- ---------------------------------------------------------------------------
create policy saved_filters_all on public.saved_filters
  for all to authenticated
  using (user_id = (select auth.uid()) and private.is_member(tenant_id))
  with check (user_id = (select auth.uid()) and private.is_member(tenant_id));

-- ---------------------------------------------------------------------------
-- Audit log: append-only. Members can read and insert; nobody can change history.
-- ---------------------------------------------------------------------------
create policy audit_logs_select on public.audit_logs
  for select to authenticated using (private.is_member(tenant_id));
create policy audit_logs_insert on public.audit_logs
  for insert to authenticated
  with check (
    private.is_member(tenant_id)
    and (actor_user_id is null or actor_user_id = (select auth.uid()))
  );
revoke update, delete, truncate on public.audit_logs from authenticated;

-- ---------------------------------------------------------------------------
-- Suppression is immediate: adding a suppression stops every matching enrolment
-- and cancels any message that has not been sent yet.
-- ---------------------------------------------------------------------------
create function private.apply_suppression()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  with matched as (
    select c.id
    from public.contacts c
    where c.tenant_id = new.tenant_id
      and (
        (new.contact_id is not null and c.id = new.contact_id)
        or (new.address_type = 'email' and c.email_normalised = new.address)
        or (new.address_type = 'phone' and lower(trim(c.phone)) = new.address)
        or (new.address_type = 'domain' and c.email_normalised like '%@' || new.address)
      )
  ),
  stopped as (
    update public.campaign_contacts cc
    set status = 'stopped',
        stop_reason = case new.reason
          when 'unsubscribe' then 'unsubscribed'
          when 'opt_out' then 'opted_out'
          when 'hard_bounce' then 'hard_bounce'
          when 'complaint' then 'complaint'
          else 'suppressed'
        end::public.stop_reason,
        stopped_at = now(),
        next_send_at = null
    from public.campaigns ca
    where cc.tenant_id = new.tenant_id
      and ca.id = cc.campaign_id
      and cc.contact_id in (select id from matched)
      and cc.status in ('pending', 'active')
      and (new.channel is null or ca.channel = new.channel)
    returning cc.id
  )
  update public.messages m
  set status = 'cancelled'
  where m.tenant_id = new.tenant_id
    and m.direction = 'outbound'
    and m.status in ('draft', 'pending_approval', 'approved', 'scheduled')
    and m.contact_id in (select id from matched)
    and (new.channel is null or m.channel = new.channel);

  return new;
end;
$$;

create trigger apply_suppression
  after insert on public.suppressions
  for each row execute function private.apply_suppression();
