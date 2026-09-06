-- ============================================================
-- 修复：infinite recursion detected in policy for relation "profiles"
-- 用法：Supabase > SQL Editor > New Query > 粘贴 > Run
-- 只需跑这一段，不要重跑整份 schema.sql
-- ============================================================

-- 1. 抽一个 security definer 函数，绕过 RLS，避免递归
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

-- 2. 重建所有引用 profiles 表的 policy，改用 is_teacher()
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
drop policy if exists "teacher read all conv" on public.conversations;
create policy "teacher read all conv" on public.conversations
  for select using (public.is_teacher());

-- api_logs
drop policy if exists "teacher read logs" on public.api_logs;
create policy "teacher read logs" on public.api_logs
  for select using (public.is_teacher());

-- settings
drop policy if exists "teacher update settings" on public.settings;
create policy "teacher update settings" on public.settings
  for update using (public.is_teacher());
