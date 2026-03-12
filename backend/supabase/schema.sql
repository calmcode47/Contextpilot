-- ContextPilot Supabase schema
-- Run this file in the Supabase SQL editor once to initialize the database.

begin;

-- Ensure pgcrypto for gen_random_uuid()
create extension if not exists pgcrypto;

--------------------------------------------------------------------------------
-- Table: profiles
-- Purpose: Per-user preferences and metadata (extends auth.users)
--------------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  tone text not null default 'professional',
  output_length text not null default 'concise',
  focus_areas text not null default 'general',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Per-user preferences extended from auth.users';

-- Updated-at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_set_updated_at on public.profiles;
create trigger trg_profiles_set_updated_at
before update on public.profiles
for each row
execute procedure public.set_updated_at();

-- Auto-create a profile on user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
on public.profiles for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own
on public.profiles for delete
to authenticated
using (auth.uid() = user_id);

--------------------------------------------------------------------------------
-- Table: sessions
-- Purpose: One row per browser tab session
--------------------------------------------------------------------------------
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users (id) on delete set null,
  page_url text,
  page_title text,
  page_type text,
  created_at timestamptz not null default now()
);
comment on table public.sessions is 'Per-tab session tracking with page metadata';

-- RLS
alter table public.sessions enable row level security;

-- Authenticated users can access and manage their own sessions
drop policy if exists sessions_select_own on public.sessions;
create policy sessions_select_own
on public.sessions for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists sessions_insert_own on public.sessions;
create policy sessions_insert_own
on public.sessions for insert
to authenticated
with check (user_id is null or auth.uid() = user_id);

drop policy if exists sessions_update_own on public.sessions;
create policy sessions_update_own
on public.sessions for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists sessions_delete_own on public.sessions;
create policy sessions_delete_own
on public.sessions for delete
to authenticated
using (auth.uid() = user_id);

-- Anonymous reads for public/unauthenticated sessions (user_id is null)
drop policy if exists sessions_select_anonymous on public.sessions;
create policy sessions_select_anonymous
on public.sessions for select
to anon
using (user_id is null);

--------------------------------------------------------------------------------
-- Table: messages
-- Purpose: Conversation history per session (user or assistant messages)
--------------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid null references auth.users (id) on delete set null,
  role text not null check (role in ('user','assistant')),
  content text not null,
  tool_used text null,
  created_at timestamptz not null default now()
);
comment on table public.messages is 'Chat messages within a session (user and assistant)';

-- Indexes for performance
create index if not exists idx_messages_session_id on public.messages (session_id);
create index if not exists idx_messages_user_id on public.messages (user_id);

-- RLS
alter table public.messages enable row level security;

-- Authenticated users can access and manage their own messages
drop policy if exists messages_select_own on public.messages;
create policy messages_select_own
on public.messages for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists messages_insert_own on public.messages;
create policy messages_insert_own
on public.messages for insert
to authenticated
with check (user_id is null or auth.uid() = user_id);

drop policy if exists messages_update_own on public.messages;
create policy messages_update_own
on public.messages for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists messages_delete_own on public.messages;
create policy messages_delete_own
on public.messages for delete
to authenticated
using (auth.uid() = user_id);

-- Anonymous reads for messages where user_id is null
drop policy if exists messages_select_anonymous on public.messages;
create policy messages_select_anonymous
on public.messages for select
to anon
using (user_id is null);

--------------------------------------------------------------------------------
-- Table: feedback
-- Purpose: Thumbs up/down with optional correction text
--------------------------------------------------------------------------------
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rating int not null check (rating in (-1, 0, 1)), -- -1=negative, 0=neutral, 1=positive
  correction text null,
  applied boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.feedback is 'User feedback for messages (thumbs up/down with optional corrections)';

-- RLS
alter table public.feedback enable row level security;

drop policy if exists feedback_select_own on public.feedback;
create policy feedback_select_own
on public.feedback for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists feedback_insert_own on public.feedback;
create policy feedback_insert_own
on public.feedback for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists feedback_update_own on public.feedback;
create policy feedback_update_own
on public.feedback for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists feedback_delete_own on public.feedback;
create policy feedback_delete_own
on public.feedback for delete
to authenticated
using (auth.uid() = user_id);

commit;
