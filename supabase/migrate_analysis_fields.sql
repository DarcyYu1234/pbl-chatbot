-- ============================================================
-- PBL Chatbot — 教学分析字段迁移（在已部署库上执行，幂等）
-- 用途：把 api_logs 升级为"教学分析级"，加学生原话/AI回答/规则版本/生成配置字段，
--       并新增 system_prompt_versions 快照表（四阶段规则 v1.0 种子）。
-- 用法：Supabase > SQL Editor > New Query > 粘贴 > Run
-- 提示：种子快照全文请用 node 跑 scripts/sync_prompt_versions.js 从代码生成，
--       以免与 api/_lib/prompts.js 的规则不一致。此处只建表与加列。
-- ============================================================

-- 1) api_logs 加列（已存在则跳过）
alter table public.api_logs
  add column if not exists student_message        text,
  add column if not exists ai_reply               text,
  add column if not exists system_prompt_version  text,
  add column if not exists model                  text,
  add column if not exists temperature            real,
  add column if not exists max_tokens             int;

-- 2) 建规则快照表
create table if not exists public.system_prompt_versions (
  id         bigserial primary key,
  stage      text not null,
  version    text not null,
  content    text not null,
  created_at timestamptz default now(),
  unique (stage, version)
);

alter table public.system_prompt_versions enable row level security;
drop policy if exists "anyone read prompt versions" on public.system_prompt_versions;
drop policy if exists "teacher insert prompt versions" on public.system_prompt_versions;
create policy "anyone read prompt versions" on public.system_prompt_versions
  for select using (true);
create policy "teacher insert prompt versions" on public.system_prompt_versions
  for insert with check (public.is_teacher());

-- 3) 返回受影响情况
select
  (select count(*) from information_schema.columns where table_schema='public' and table_name='api_logs') as api_logs_cols,
  (select count(*) from public.system_prompt_versions) as snapshot_rows;