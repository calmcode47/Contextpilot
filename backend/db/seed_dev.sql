begin;

-- Replace the UUID below if your test user differs
-- Using: 21e7e228-e585-4224-884b-799da1d3f476

with ins_user as (
  insert into public.messages (session_id, user_id, role, content, tool_used)
  values ('sess-demo-seed-1', '21e7e228-e585-4224-884b-799da1d3f476', 'user', 'Hello ContextPilot!', null)
  returning id
),
ins_assistant as (
  insert into public.messages (session_id, user_id, role, content, tool_used)
  values ('sess-demo-seed-1', '21e7e228-e585-4224-884b-799da1d3f476', 'assistant', 'Hi! How can I help you today?', null)
  returning id
),
ins_feedback as (
  insert into public.feedback (message_id, user_id, rating, correction)
  select id, '21e7e228-e585-4224-884b-799da1d3f476', 0, null from ins_assistant
  returning id
)
select
  (select count(*) from public.messages where session_id = 'sess-demo-seed-1' and user_id = '21e7e228-e585-4224-884b-799da1d3f476') as messages_count,
  (select count(*) from public.feedback where user_id = '21e7e228-e585-4224-884b-799da1d3f476') as feedback_count;

commit;
