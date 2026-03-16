-- ============================================================
-- feedback: User ratings and corrections for agent responses
-- ============================================================
create table if not exists feedback (
  id          uuid        default gen_random_uuid() primary key,
  message_id  uuid        not null,
  user_id     text        not null,
  rating      text        not null check (rating in ('positive', 'negative', '1', '-1')),
  correction  text,
  applied     boolean     default false,
  created_at  timestamptz default now()
);

create index if not exists idx_feedback_user_id
  on feedback(user_id);

create index if not exists idx_feedback_message_id
  on feedback(message_id);

create unique index if not exists idx_feedback_unique_vote
  on feedback(message_id, user_id);

alter table feedback enable row level security;

drop policy if exists users_read_own_feedback on feedback;

create policy users_read_own_feedback
  on feedback
  for select
  to authenticated
  using (user_id::text = auth.uid()::text);
