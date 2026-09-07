// 把 api/_lib/prompts.js 里当前各阶段规则全文同步进 Supabase system_prompt_versions 表。
// 保证快照与代码里的规则一致（单一事实来源 = prompts.js）。
//
// 用法：需要 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 环境变量。
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/sync_prompt_versions.js
//
// 也可仅生成 SQL 而不直接执行：node scripts/sync_prompt_versions.js --sql-only
const { STAGE_PROMPTS, PROMPT_VERSION } = require('../api/_lib/prompts');

const STAGES = Object.keys(STAGE_PROMPTS);

function upsertSQL() {
  const lines = [];
  for (const stage of STAGES) {
    const v = PROMPT_VERSION[stage] || '1.0';
    const content = STAGE_PROMPTS[stage];
    // 把内容里的单引号转义成 SQL 单引号两倍
    const esc = content.replace(/'/g, "''");
    lines.push(`insert into public.system_prompt_versions(stage, version, content) values
  ('${stage}', '${v}', '${esc}')
on conflict (stage, version) do update set content = excluded.content;`);
  }
  return lines.join('\n\n');
}

async function run() {
  const sqlOnly = process.argv.includes('--sql-only');
  const sql = upsertSQL();
  if (sqlOnly) {
    console.log(sql);
    return;
  }
  const { createClient } = require('@supabase/supabase-js');
  const URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !KEY) {
    console.error('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 环境变量');
    console.error('或使用 --sql-only 仅打印 SQL 去 Supabase 手动跑');
    process.exit(1);
  }
  const supabase = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  for (const stage of STAGES) {
    const v = PROMPT_VERSION[stage] || '1.0';
    const { error } = await supabase.from('system_prompt_versions').upsert(
      { stage, version: v, content: STAGE_PROMPTS[stage] },
      { onConflict: 'stage,version' }
    );
    if (error) {
      console.error(`同步 ${stage} 失败:`, error.message);
      process.exitCode = 1;
    } else {
      console.log(`✅ ${stage} v${v} 已同步`);
    }
  }
}

run();