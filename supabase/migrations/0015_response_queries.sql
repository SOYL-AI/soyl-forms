-- Deduplicate existing refresh-generated visits before adding the unique key.
delete from form_visits a using form_visits b where a.form_id = b.form_id and a.session_id = b.session_id
  and (a.started_at, a.id) > (b.started_at, b.id);
create unique index if not exists idx_visits_session on form_visits(form_id, session_id);
update partial_responses set idempotency_key = gen_random_uuid()::text where idempotency_key is null;

create or replace function record_form_progress(p_form_id uuid, p_session_id text, p_block_id text)
returns void language sql security definer set search_path = public as $$
  update form_visits set last_block_id = p_block_id, progress_at = now(),
    reached_blocks = case when p_block_id = any(reached_blocks) then reached_blocks else array_append(reached_blocks, p_block_id) end
    where form_id = p_form_id and session_id = p_session_id and completed_at is null;
$$;
revoke all on function record_form_progress(uuid, text, text) from public, anon, authenticated;
grant execute on function record_form_progress(uuid, text, text) to service_role;

create or replace function form_analytics(p_form_id uuid, p_question_ids text[])
returns jsonb language sql stable security definer set search_path = public as $$
  with responses as (
    select * from submissions where form_id = p_form_id and deleted_at is null and status = 'completed'
  ), days as (
    select (submitted_at at time zone 'UTC')::date as day, count(*) as count from responses
    where submitted_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' - interval '13 days'
    group by 1
  ), answer_counts as (
    select e.key, jsonb_build_object('type', e.value->'type', 'value', e.value->'value') as answer, count(*) as count
    from responses s cross join lateral jsonb_each(s.answers) e
    where e.key = any(p_question_ids) group by 1, 2
  ), grouped_answers as (
    select key, jsonb_agg(jsonb_build_object('answer', answer, 'count', count)) as groups from answer_counts group by key
  ), reached as (
    select block_id, count(distinct v.id) as count from form_visits v
    cross join lateral unnest(case when cardinality(v.reached_blocks) > 0 then v.reached_blocks
      when v.last_block_id is not null then array[v.last_block_id] else '{}'::text[] end) block_id
    where v.form_id = p_form_id group by block_id
  ) select jsonb_build_object(
    'views', (select count(*) from form_visits where form_id = p_form_id),
    'completions', (select count(*) from responses),
    'completedVisits', (select count(*) from form_visits where form_id = p_form_id and completed_at is not null),
    'avgSecs', (select round(avg(duration_ms)/1000) from responses where duration_ms > 0),
    'fromQr', (select count(*) from responses where source = 'qr'),
    'days', coalesce((select jsonb_object_agg(day::text, count) from days), '{}'),
    'answers', coalesce((select jsonb_object_agg(key, groups) from grouped_answers), '{}'),
    'reached', coalesce((select jsonb_object_agg(block_id, count) from reached), '{}'),
    'abandoned', (select count(*) from form_visits where form_id = p_form_id and completed_at is null and coalesce(progress_at, started_at) <= now() - interval '30 minutes'),
    'inProgress', (select count(*) from form_visits where form_id = p_form_id and completed_at is null and coalesce(progress_at, started_at) > now() - interval '30 minutes')
  );
$$;
revoke all on function form_analytics(uuid, text[]) from public, anon, authenticated;
grant execute on function form_analytics(uuid, text[]) to service_role;

create or replace function search_form_responses(p_form_id uuid, p_query text default '', p_tag text default '',
  p_from timestamptz default null, p_to timestamptz default null, p_offset integer default 0, p_limit integer default 100)
returns jsonb language sql stable security definer set search_path = public as $$
  with matching as (
    select id, submitted_at, source, answers, tags from submissions
    where form_id = p_form_id and deleted_at is null
      and (p_from is null or submitted_at >= p_from) and (p_to is null or submitted_at < p_to)
      and (coalesce(p_query, '') = '' or strpos(lower(answers::text), lower(p_query)) > 0)
      and (coalesce(p_tag, '') = '' or p_tag = any(tags))
  ), paged as (
    select * from matching order by submitted_at desc, id desc
    offset greatest(0, least(p_offset, 1000000)) limit greatest(1, least(p_limit, 100))
  ), all_tags as (
    select distinct unnest(tags) as tag from submissions where form_id = p_form_id and deleted_at is null
  ) select jsonb_build_object('total', (select count(*) from matching),
    'rows', coalesce((select jsonb_agg(to_jsonb(paged) order by submitted_at desc, id desc) from paged), '[]'),
    'tags', coalesce((select jsonb_agg(tag order by tag) from all_tags), '[]'));
$$;
revoke all on function search_form_responses(uuid, text, text, timestamptz, timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function search_form_responses(uuid, text, text, timestamptz, timestamptz, integer, integer) to service_role;
