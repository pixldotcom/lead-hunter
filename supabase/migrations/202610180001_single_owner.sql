-- Apply AFTER 202610170001. No owner is seeded: access fails closed until an
-- administrator configures the singleton through the reviewed setup steps.
begin;
create schema lead_hunter_private;
revoke all on schema lead_hunter_private from public, anon, authenticated;
create table lead_hunter_private.owner (
 singleton boolean primary key default true check (singleton),
 user_id uuid not null unique references auth.users(id) on delete cascade
);
alter table lead_hunter_private.owner enable row level security;
revoke all on lead_hunter_private.owner from public, anon, authenticated;

create function public.lh_is_owner() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from lead_hunter_private.owner where user_id=(select auth.uid()));
$$;
revoke all on function public.lh_is_owner() from public, anon;
grant execute on function public.lh_is_owner() to authenticated;

do $$ declare t text; begin
 foreach t in array array['lh_workspaces','lh_leads','lh_activities','lh_batches','lh_prospects','lh_drafts','lh_preferences','lh_operations','lh_imports','lh_backups'] loop
  execute format('drop policy owner_select on public.%I',t);
  execute format('drop policy owner_insert on public.%I',t);
  execute format('drop policy owner_update on public.%I',t);
  execute format('drop policy owner_delete on public.%I',t);
  execute format('create policy owner_select on public.%I for select to authenticated using ((select public.lh_is_owner()) and (select auth.uid()) = user_id)',t);
 end loop;
end $$;

-- Original transaction bodies stay unchanged and inaccessible to API roles.
-- Wrappers authorize before invoking SECURITY DEFINER transaction code.
alter function public.lh_load_workspace() set schema lead_hunter_private;
alter function lead_hunter_private.lh_load_workspace() rename to load_workspace;
revoke all on function lead_hunter_private.load_workspace() from public, anon, authenticated;
alter function public.lh_save_workspace(bigint,uuid,jsonb,text,text) set schema lead_hunter_private;
alter function lead_hunter_private.lh_save_workspace(bigint,uuid,jsonb,text,text) rename to save_workspace;
revoke all on function lead_hunter_private.save_workspace(bigint,uuid,jsonb,text,text) from public, anon, authenticated;

create function public.lh_load_workspace() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.lh_is_owner() then raise exception 'Owner authorization required' using errcode='42501'; end if;
 return lead_hunter_private.load_workspace();
end $$;
create function public.lh_save_workspace(p_expected_revision bigint,p_operation_id uuid,p_payload jsonb,p_import_hash text default null,p_payload_hash text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.lh_is_owner() then raise exception 'Owner authorization required' using errcode='42501'; end if;
 return lead_hunter_private.save_workspace(p_expected_revision,p_operation_id,p_payload,p_import_hash,p_payload_hash);
end $$;
revoke all on function public.lh_load_workspace() from public, anon;
revoke all on function public.lh_save_workspace(bigint,uuid,jsonb,text,text) from public, anon;
grant execute on function public.lh_load_workspace() to authenticated;
grant execute on function public.lh_save_workspace(bigint,uuid,jsonb,text,text) to authenticated;
commit;
