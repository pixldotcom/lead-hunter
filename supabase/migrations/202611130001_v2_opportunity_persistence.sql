-- Lead Hunter V2 persistence upgrade. Apply AFTER the owner-only 202610180001 migration.
-- No existing rows are deleted. V2 arrays live in the existing owner-scoped
-- lh_preferences JSONB payload until a dedicated normalized storage phase.
-- Preserve the public owner-authorization wrappers from 202610180001.
-- Roll out before accepting V2 Quick Import cloud saves.
begin;
create or replace function lead_hunter_private.load_workspace() returns jsonb language plpgsql security definer set search_path='' as $$
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
   'batches',coalesce((select jsonb_agg(payload order by id) from public.lh_batches where user_id=u),'[]'::jsonb),
   'businesses',coalesce(prefs#>'{discoveryV2,businesses}','[]'::jsonb),
   'opportunityAnalyses',coalesce(prefs#>'{discoveryV2,opportunityAnalyses}','[]'::jsonb),
   'outreachActivities',coalesce(prefs#>'{discoveryV2,outreachActivities}','[]'::jsonb)),
  'drafts',jsonb_build_object('version',1,'drafts',coalesce((select jsonb_agg(payload order by lead_id) from public.lh_drafts where user_id=u),'[]'::jsonb)),
  'preferences',jsonb_build_object('textScale',coalesce(prefs->'textScale','175'::jsonb))
 )) into result;
 return result;
end $$;

create or replace function lead_hunter_private.save_workspace(p_expected_revision bigint,p_operation_id uuid,p_payload jsonb,p_import_hash text default null,p_payload_hash text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); rev bigint; old_hash text; item jsonb; activity jsonb; position integer; previous jsonb;
begin
 if u is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_expected_revision<0 or p_operation_id is null or p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$' or (p_import_hash is not null and p_import_hash !~ '^[a-f0-9]{64}$') then raise exception 'Invalid operation' using errcode='22023'; end if;
 if p_payload is null or pg_column_size(p_payload)>4000000 or p_payload->>'version' is distinct from '1'
 or jsonb_typeof(p_payload#>'{leads,leads}') is distinct from 'array' or jsonb_typeof(p_payload#>'{discovery,candidates}') is distinct from 'array'
 or jsonb_typeof(p_payload#>'{discovery,batches}') is distinct from 'array' or jsonb_typeof(p_payload#>'{drafts,drafts}') is distinct from 'array'
 or coalesce(p_payload#>>'{preferences,textScale}','') not in ('100','125','150','175')
 or (p_payload#>'{discovery,businesses}' is not null and jsonb_typeof(p_payload#>'{discovery,businesses}')<>'array')
 or (p_payload#>'{discovery,opportunityAnalyses}' is not null and jsonb_typeof(p_payload#>'{discovery,opportunityAnalyses}')<>'array')
 or (p_payload#>'{discovery,outreachActivities}' is not null and jsonb_typeof(p_payload#>'{discovery,outreachActivities}')<>'array')
 then raise exception 'Invalid payload' using errcode='22023'; end if;
 if jsonb_array_length(p_payload#>'{leads,leads}')>5000 or jsonb_array_length(p_payload#>'{drafts,drafts}')>5000 or jsonb_array_length(p_payload#>'{discovery,candidates}')>1000 or jsonb_array_length(p_payload#>'{discovery,batches}')>1000 or jsonb_array_length(coalesce(p_payload#>'{discovery,businesses}','[]'::jsonb))>10000
 or jsonb_array_length(coalesce(p_payload#>'{discovery,opportunityAnalyses}','[]'::jsonb))>10000
 or jsonb_array_length(coalesce(p_payload#>'{discovery,outreachActivities}','[]'::jsonb))>10000
 then raise exception 'Record limit exceeded' using errcode='22023'; end if;
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
 insert into public.lh_preferences(user_id,payload) values(u,jsonb_build_object('discovery',p_payload#>'{discovery,preferences}','textScale',p_payload#>'{preferences,textScale}',
  'discoveryV2',jsonb_build_object(
    'businesses',coalesce(p_payload#>'{discovery,businesses}','[]'::jsonb),
    'opportunityAnalyses',coalesce(p_payload#>'{discovery,opportunityAnalyses}','[]'::jsonb),
    'outreachActivities',coalesce(p_payload#>'{discovery,outreachActivities}','[]'::jsonb)))) on conflict(user_id) do update set payload=excluded.payload;
 update public.lh_workspaces set revision=rev+1,updated_at=now() where user_id=u;
 insert into public.lh_operations(user_id,operation_id,payload_hash,revision) values(u,p_operation_id,p_payload_hash,rev+1);
 if p_import_hash is not null then insert into public.lh_imports(user_id,source_hash) values(u,p_import_hash);end if;
 delete from public.lh_backups where user_id=u and revision not in(select revision from public.lh_backups where user_id=u order by revision desc limit 10);
 return public.lh_load_workspace();
end $$;

commit;
