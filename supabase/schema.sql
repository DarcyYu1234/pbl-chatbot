-- ============================================================
-- PBL Chatbot — Supabase Database Schema
-- 用法：Supabase > SQL Editor > New Query > 粘贴 > Run
-- ============================================================

-- 1. profiles: 扩展 auth.users，存角色、姓名、学号、班级
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         text not null default 'student' check (role in ('student','teacher')),
  display_name text not null,
  student_code text unique,
  class_label  text,
  created_at   timestamptz default now()
);

-- 2. conversations: 每个学生 × 每个阶段 一份独立对话历史
create table if not exists public.conversations (
  id          bigserial primary key,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  stage       text not null check (stage in ('problem_formulation','investigation','analysis','reflection')),
  role        text not null check (role in ('user','assistant','system')),
  content     text not null,
  created_at  timestamptz default now()
);

create index if not exists idx_conv_student_stage
  on public.conversations(student_id, stage, created_at);

-- 3. api_logs: 每次 DeepSeek 调用的完整记录（教师可见）——教学分析级
create table if not exists public.api_logs (
  id                bigserial primary key,
  student_id        uuid references public.profiles(id) on delete set null,
  student_code      text,
  stage             text,
  -- 教学分析字段：学生原话 / AI 回答 / 规则版本 / 生成配置
  student_message   text,
  ai_reply          text,
  system_prompt_version text,
  model             text,
  temperature       real,
  max_tokens        int,
  prompt_tokens     int,
  completion_tokens int,
  total_tokens      int,
  latency_ms        int,
  status_code       int,
  error             text,
  created_at        timestamptz default now()
);

create index if not exists idx_logs_created
  on public.api_logs(created_at desc);

-- 4a. system_prompt_versions: 每版规则全文快照（回看"当时 AI 按什么规则回答"）
create table if not exists public.system_prompt_versions (
  id         bigserial primary key,
  stage      text not null,
  version    text not null,
  content    text not null,
  created_at timestamptz default now(),
  unique (stage, version)
);

-- 4. settings: 教师控制的全局开关（chatbot 启停、当前阶段）
create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz default now(),
  updated_by uuid references public.profiles(id)
);

insert into public.settings(key, value) values
  ('chatbot_enabled', 'true'::jsonb),
  ('current_stage',   '"problem_formulation"'::jsonb)
on conflict (key) do nothing;

-- ============================================================
-- Row Level Security（关键：未成年人数据保护）
-- ============================================================

alter table public.profiles      enable row level security;
alter table public.conversations enable row level security;
alter table public.api_logs      enable row level security;
alter table public.settings      enable row level security;

-- ============================================================
-- 关键修复：把"当前用户是否为教师"抽成 security definer 函数。
-- security definer 以函数所有者权限运行，会绕过 RLS，
-- 从而避免 policy 里子查询 profiles 造成的无限递归死循环。
-- ============================================================
drop function if exists public.is_teacher();
create or replace function public.is_teacher()
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'teacher'
  );
$$;
grant execute on function public.is_teacher() to anon, authenticated;

-- profiles
drop policy if exists "self read profile"      on public.profiles;
drop policy if exists "teacher read all profiles" on public.profiles;
drop policy if exists "teacher update profiles" on public.profiles;
create policy "self read profile" on public.profiles
  for select using (auth.uid() = id);

create policy "teacher read all profiles" on public.profiles
  for select using (public.is_teacher());

create policy "teacher update profiles" on public.profiles
  for update using (public.is_teacher());

-- conversations
drop policy if exists "student read own"   on public.conversations;
drop policy if exists "student insert own" on public.conversations;
drop policy if exists "teacher read all conv" on public.conversations;
create policy "student read own" on public.conversations
  for select using (student_id = auth.uid());

create policy "student insert own" on public.conversations
  for insert with check (student_id = auth.uid());

create policy "teacher read all conv" on public.conversations
  for select using (public.is_teacher());

-- api_logs（仅教师可见）
drop policy if exists "teacher read logs" on public.api_logs;
create policy "teacher read logs" on public.api_logs
  for select using (public.is_teacher());

-- settings（公开读，教师写）
drop policy if exists "anyone read settings"      on public.settings;
drop policy if exists "teacher update settings"   on public.settings;
create policy "anyone read settings" on public.settings
  for select using (true);

create policy "teacher update settings" on public.settings
  for update using (public.is_teacher());

-- ============================================================
-- Trigger: 学生注册时自动创建 profile（默认 role='student'）
-- 教师账号请用 SQL 手动创建，见 README.md 步骤 4
-- ============================================================

drop function if exists public.handle_new_user() cascade;
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    'student',
    coalesce(new.raw_user_meta_data->>'display_name',
             split_part(new.email,'@',1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
