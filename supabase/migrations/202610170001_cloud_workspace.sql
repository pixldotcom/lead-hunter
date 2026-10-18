begin;
revoke create on schema public from public, anon, authenticated;
grant usage on schema public to authenticated;
create table public.lh_workspaces (
 user_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null default 0 check (revision>=0), updated_at timestamptz not null default now()
);
create table public.lh_leads (
 user_id uuid not null references auth.users(id) on delete cascade,id text not null check(length(id) between 1 and 200),
 domain text not null check(length(domain) between 1 and 253),payload jsonb not null check(jsonb_typeof(payload)='object'),
 primary key(user_id,id),unique(user_id,domain)
);
create table public.lh_activities (
 user_id uuid not null,lead_id text not null,id text not null,ordinal integer not null check(ordinal>=0),payload jsonb not null check(jsonb_typeof(payload)='object'),
 primary key(user_id,lead_id,ordinal),foreign key(user_id,lead_id) references public.lh_leads(user_id,id) on delete cascade
);
create table public.lh_batches (
 user_id uuid not null references auth.users(id) on delete cascade,id text not null,payload jsonb not null check(jsonb_typeof(payload)='object'),primary key(user_id,id)
);
create table public.lh_prospects (
 user_id uuid not null,id text not null,domain text not null,batch_id text not null,payload jsonb not null check(jsonb_typeof(payload)='object'),
 primary key(user_id,id),unique(user_id,domain),foreign key(user_id,batch_id) references public.lh_batches(user_id,id) on delete cascade
);
create table public.lh_drafts (
 user_id uuid not null references auth.users(id) on delete cascade,lead_id text not null,payload jsonb not null check(jsonb_typeof(payload)='object'),primary key(user_id,lead_id)
);
create table public.lh_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,payload jsonb not null check(jsonb_typeof(payload)='object')
);
create table public.lh_operations (
 user_id uuid not null references auth.users(id) on delete cascade,operation_id uuid not null,payload_hash text not null check(length(payload_hash)=64),revision bigint not null,created_at timestamptz not null default now(),primary key(user_id,operation_id)
);
create table public.lh_imports (
 user_id uuid not null references auth.users(id) on delete cascade,source_hash text not null check(length(source_hash)=64),created_at timestamptz not null default now(),primary key(user_id,source_hash)
);
create table public.lh_backups (
 user_id uuid not null references auth.users(id) on delete cascade,revision bigint not null,payload jsonb not null,created_at timestamptz not null default now(),primary key(user_id,revision)
);

-- Every exposed base table has RLS. API users can read only their own rows;
-- writes are performed exclusively by the narrow, owner-checked transaction below.
do $$ declare t text; begin
 foreach t in array array['lh_workspaces','lh_leads','lh_activities','lh_batches','lh_prospects','lh_drafts','lh_preferences','lh_operations','lh_imports','lh_backups'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy owner_select on public.%I for select to authenticated using ((select auth.uid()) = user_id)',t);
  execute format('create policy owner_insert on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',t);
  execute format('create policy owner_update on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',t);
  execute format('create policy owner_delete on public.%I for delete to authenticated using ((select auth.uid()) = user_id)',t);
  execute format('revoke all on public.%I from public, anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;

create function public.lh_load_workspace() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); prefs jsonb; rev bigint; result jsonb;
begin
 if u is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select revision into rev from public.lh_workspaces where user_id=u;
 select payload into prefs from public.lh_preferences where user_id=u;
 select jsonb_build_object('revision',coalesce(rev,0),'data',jsonb_build_object(
  'version',1,
  'leads',jsonb_build_object('version',1,'leads',coalesce((select jsonb_agg(l.payload || jsonb_build_object('activities',coalesce((select jsonb_agg(a.payload order by a.ordinal) from public.lh_activities a where a.user_id=u and a.lead_id=l.id),'[]'::jsonb)) order by l.id) from public.lh_leads l where l.user_id=u),'[]'::jsonb)),
  'discovery',jsonb_build_object('version',1,'preferences',coalesce(prefs->'discovery','{"type":"Agency","industry":"Web design","geography":"India","keywords":"","batchSize":5}'::jsonb),
   'candidates',coalesce((select jsonb_agg(payload order by id) from public.lh_prospects where user_id=u),'[]'::jsonb),
   'batches',coalesce((select jsonb_agg(payload order by id) from public.lh_batches where user_id=u),'[]'::jsonb)),
  'drafts',jsonb_build_object('version',1,'drafts',coalesce((select jsonb_agg(payload order by lead_id) from public.lh_drafts where user_id=u),'[]'::jsonb)),
  'preferences',jsonb_build_object('textScale',coalesce(prefs->'textScale','175'::jsonb))
 )) into result;
 return result;
end $$;

create function public.lh_save_workspace(p_expected_revision bigint,p_operation_id uuid,p_payload jsonb,p_import_hash text default null,p_payload_hash text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); rev bigint; old_hash text; item jsonb; activity jsonb; position integer; previous jsonb;
begin
 if u is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_expected_revision<0 or p_operation_id is null or p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$' or (p_import_hash is not null and p_import_hash !~ '^[a-f0-9]{64}$') then raise exception 'Invalid operation' using errcode='22023'; end if;
 if p_payload is null or pg_column_size(p_payload)>4000000 or p_payload->>'version' is distinct from '1'
 or jsonb_typeof(p_payload#>'{leads,leads}') is distinct from 'array' or jsonb_typeof(p_payload#>'{discovery,candidates}') is distinct from 'array'
 or jsonb_typeof(p_payload#>'{discovery,batches}') is distinct from 'array' or jsonb_typeof(p_payload#>'{drafts,drafts}') is distinct from 'array'
 or coalesce(p_payload#>>'{preferences,textScale}','') not in ('100','125','150','175') then raise exception 'Invalid payload' using errcode='22023'; end if;
 if jsonb_array_length(p_payload#>'{leads,leads}')>5000 or jsonb_array_length(p_payload#>'{drafts,drafts}')>5000 or jsonb_array_length(p_payload#>'{discovery,candidates}')>1000 or jsonb_array_length(p_payload#>'{discovery,batches}')>1000 then raise exception 'Record limit exceeded' using errcode='22023'; end if;
 insert into public.lh_workspaces(user_id) values(u) on conflict do nothing;
 select revision into rev from public.lh_workspaces where user_id=u for update;
 select payload_hash into old_hash from public.lh_operations where user_id=u and operation_id=p_operation_id;
 if found then if old_hash<>p_payload_hash then raise exception 'Operation reused' using errcode='22023'; end if;return public.lh_load_workspace();end if;
 if p_import_hash is not null and exists(select 1 from public.lh_imports where user_id=u and source_hash=p_import_hash) then return public.lh_load_workspace();end if;
 if rev<>p_expected_revision then raise exception 'Revision conflict' using errcode='40001';end if;
 previous:=public.lh_load_workspace();
 insert into public.lh_backups(user_id,revision,payload) values(u,rev,previous->'data') on conflict do nothing;
 delete from public.lh_prospects where user_id=u;delete from public.lh_batches where user_id=u;
 delete from public.lh_leads where user_id=u;delete from public.lh_drafts where user_id=u;
 for item in select value from jsonb_array_elements(p_payload#>'{leads,leads}') loop
  if jsonb_typeof(item->'activities') is distinct from 'array' or coalesce(item->>'name','')='' or coalesce(item->>'website','')='' then raise exception 'Invalid lead' using errcode='22023';end if;
  insert into public.lh_leads(user_id,id,domain,payload) values(u,item->>'id',lower(regexp_replace(regexp_replace(split_part(split_part(split_part(regexp_replace(item->>'website','^https?://','','i'),'/',1),'?',1),'#',1),':[0-9]+$',''),'(^www\.)|(\.$)','','gi')),item-'activities');
  position:=0;for activity in select value from jsonb_array_elements(item->'activities') loop
   insert into public.lh_activities(user_id,lead_id,id,ordinal,payload) values(u,item->>'id',activity->>'id',position,activity);position:=position+1;
  end loop;
 end loop;
 for item in select value from jsonb_array_elements(p_payload#>'{discovery,batches}') loop insert into public.lh_batches values(u,item->>'id',item);end loop;
 for item in select value from jsonb_array_elements(p_payload#>'{discovery,candidates}') loop insert into public.lh_prospects values(u,item->>'id',item->>'domain',item->>'batchId',item);end loop;
 for item in select value from jsonb_array_elements(p_payload#>'{drafts,drafts}') loop insert into public.lh_drafts values(u,item->>'leadId',item);end loop;
 insert into public.lh_preferences(user_id,payload) values(u,jsonb_build_object('discovery',p_payload#>'{discovery,preferences}','textScale',p_payload#>'{preferences,textScale}')) on conflict(user_id) do update set payload=excluded.payload;
 update public.lh_workspaces set revision=rev+1,updated_at=now() where user_id=u;
 insert into public.lh_operations(user_id,operation_id,payload_hash,revision) values(u,p_operation_id,p_payload_hash,rev+1);
 if p_import_hash is not null then insert into public.lh_imports(user_id,source_hash) values(u,p_import_hash);end if;
 delete from public.lh_backups where user_id=u and revision not in(select revision from public.lh_backups where user_id=u order by revision desc limit 10);
 return public.lh_load_workspace();
end $$;
revoke all on function public.lh_load_workspace() from public,anon;
revoke all on function public.lh_save_workspace(bigint,uuid,jsonb,text,text) from public,anon;
grant execute on function public.lh_load_workspace() to authenticated;
grant execute on function public.lh_save_workspace(bigint,uuid,jsonb,text,text) to authenticated;
commit;
