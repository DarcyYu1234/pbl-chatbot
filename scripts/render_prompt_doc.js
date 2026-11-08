// 从 api/_lib/prompts.js 直接渲染 prompt 全文文档，保证文档与线上代码逐字一致。
// 用法: node scripts/render_prompt_doc.js > docs/system_prompt_vX.Y.md
const { STAGE_PROMPTS, STAGE_DISPLAY, PROMPT_VERSION } = require('../api/_lib/prompts');

const version = PROMPT_VERSION.problem_formulation;
const stages = Object.keys(STAGE_PROMPTS);

const out = [];
out.push(`# System Prompt v${version} — 线上生效全文`);
out.push('');
out.push('> 本文件由 `scripts/render_prompt_doc.js` 从 `api/_lib/prompts.js` 自动生成，');
out.push('> 与 Vercel 上运行的代码逐字一致，可直接用于论文附录。');
out.push('');
out.push('## 一、结构说明');
out.push('');
out.push('每轮实际发给 DeepSeek 的消息序列：');
out.push('');
out.push('```');
out.push('[system]  共同人设（PERSONA）+ 当前阶段规则（STAGE_PROMPTS[stage]）');
out.push('[history] 该生此前若干轮对话（最多 20 轮）');
out.push('[user]    学生本轮原话');
out.push('[system?] 由 api/chat.js 注入的运行时语言指令（贴在最后一条 user 之后）');
out.push('```');
out.push('');
out.push('## 二、生成参数');
out.push('');
out.push('| 参数 | 取值 |');
out.push('|---|---|');
out.push('| model | `deepseek-chat` |');
out.push('| temperature | `0.6` |');
out.push('| max_tokens | `1500` |');
out.push(`| prompt version | \`${version}\`（四阶段一致） |`);
out.push('');
out.push('## 三、运行时语言指令（不在 prompts.js 内）');
out.push('');
out.push('`api/chat.js` 按学生最新一条消息的字符构成判定语言，并在消息序列末尾注入：');
out.push('');
out.push('```');
out.push("Language directive: the student's latest message is in English (or Chinese).");
out.push('Reply ENTIRELY in that language this turn, even if the earlier');
out.push('conversation was in the other language.');
out.push('```');
out.push('');
out.push('判定规则：CJK 字符占比 > 30% → 中文；否则英文；混合句按句框语言。');
out.push('');
out.push('## 四、四阶段 prompt 全文');
out.push('');

for (const s of stages) {
  out.push(`### ${STAGE_DISPLAY[s]} \`${s}\` — version ${PROMPT_VERSION[s]}`);
  out.push('');
  out.push(`字符数：${STAGE_PROMPTS[s].length}`);
  out.push('');
  out.push('```text');
  out.push(STAGE_PROMPTS[s]);
  out.push('```');
  out.push('');
}

out.push('## 五、版本变更记录');
out.push('');
out.push('| 版本 | 变更 |');
out.push('|---|---|');
out.push('| 1.0 | 初版（中文），四阶段 + 共同人设 |');
out.push('| 2.0 | 全量英文重写；年龄扩到 G7–G12 并加分级校准；新增回答边界、抗妥协、卡死降级、情感支持、句式多样化、冷启动、每阶段 Final reminder |');
out.push('| 2.1 | 语言规则改为跟随学生最新一条消息；`chat.js` 每轮末尾注入运行时语言指令，修中文历史惯性 |');
out.push(`| ${version} | 研究一致性加固：共同人设加入固定主题锚定（食堂气泡饮 / 泡腾片溶解速率，四阶段全程生效）；年级冻结为 G8–G9（13–15 岁），取消 G7–G8 / G11–G12 分级校准，改为单一固定语域 |`);
out.push('');

process.stdout.write(out.join('\n'));
