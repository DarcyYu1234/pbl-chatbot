// 用法: node scripts/seed_prompt_versions_to_supabase.js
// 从 api/_lib/prompts.js 读取四阶段规则,生成 SQL INSERT 种子,直接在
// Supabase SQL Editor 粘贴运行(或 psql -f) 即可填满 system_prompt_versions。
//
// 为什么单独搞这个: schema.sql 里的建表是空快照,migrate_analysis_fields.sql
// 也是空快照。这里把当前代码里的 v1.0 规则一次锁进快照表。

const { STAGE_PROMPTS, PROMPT_VERSION } = require('../api/_lib/prompts');

const STAGE_NAMES_CN = {
  problem_formulation: '问题建构',
  investigation:       '调查与数据收集',
  analysis:            '分析与建模',
  reflection:          '反思与结论'
};

// 把单引号 + 反斜杠 + 换行都按 SQL 文本规则转义
function sqlEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "''");
}

const rows = Object.entries(STAGE_PROMPTS).map(([stage, text]) => ({
  stage,
  stage_name: STAGE_NAMES_CN[stage],
  version:    PROMPT_VERSION[stage] || '1.0',
  text
}));

const lines = [];
lines.push('-- 自动生成: 把当前 prompts.js 的四阶段规则锁进 system_prompt_versions 快照表');
lines.push('-- 用法: Supabase SQL Editor 粘贴运行, 或 psql -f <filename>');
lines.push('-- 重复运行安全(用 ON CONFLICT DO UPDATE)');
lines.push('');
lines.push("insert into public.system_prompt_versions (stage, stage_name, version, content)");
lines.push('values');

const valueRows = rows.map((r, i) => {
  const sep = (i === rows.length - 1) ? '' : ',';
  return `  ('${r.stage}', '${sqlEscape(r.stage_name)}', '${r.version}', '${sqlEscape(r.text)}')${sep}`;
});
lines.push(valueRows.join('\n'));

// 重复运行安全: 同一 (stage, version) 已存在则覆盖 content 与 stage_name
lines.push("on conflict (stage, version) do update set");
lines.push("  content    = excluded.content,");
lines.push("  stage_name = excluded.stage_name;");
lines.push('');

lines.push('');
lines.push('-- 验证');
lines.push('select stage, stage_name, version, length(content) as len from public.system_prompt_versions order by stage;');

console.log(lines.join('\n'));