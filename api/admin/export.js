// 教师：研究数据导出（论文编码分析用）
//   GET /api/admin/export?kind=conversations&format=csv   → 学生×AI 全部对话明细（CSV）
//   GET /api/admin/export?kind=conversations&format=json  → 同上，JSON
//   GET /api/admin/export?kind=apilogs&format=csv         → 每次 AI 调用（含完整输入输出+生成配置）CSV
//   GET /api/admin/export?kind=apilogs&format=json        → 同上，JSON
const { authenticate, requireTeacher } = require('../_lib/auth');
const { supabaseAdmin } = require('../_lib/supabase');
const { STAGE_DISPLAY } = require('../_lib/prompts');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const auth = await authenticate(req);
    if (!auth) return res.status(401).json({ error: 'unauthenticated' });
    requireTeacher(auth);

    const kind   = req.query.kind;            // 'conversations' | 'apilogs'
    const format = req.query.format || 'json'; // 'json' | 'csv'

    // 1) 学生列表（含 email —— email 在 auth.users，需逐 id 查）
    const { data: students, error: pErr } = await supabaseAdmin
      .from('profiles')
      .select('id, display_name, student_code, class_label, role, created_at')
      .eq('role', 'student')
      .order('created_at', { ascending: true });
    if (pErr) throw pErr;

    const enriched = [];
    for (const s of (students || [])) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(s.id);
      enriched.push({ ...s, email: u?.user?.email || '' });
    }
    const emailOf = Object.fromEntries(enriched.map(s => [s.id, s.email]));

    if (kind === 'conversations') {
      // 拉全部对话（不分阶段限制）
      const { data: convs, error: cErr } = await supabaseAdmin
        .from('conversations')
        .select('student_id, stage, role, content, created_at')
        .order('created_at', { ascending: true });
      if (cErr) throw cErr;

      const rows = (convs || []).map(c => {
        const p = (students || []).find(x => x.id === c.student_id);
        return {
          student_id:    c.student_id,
          email:         emailOf[c.student_id] || '',
          display_name:  p?.display_name || '',
          student_code:  p?.student_code || '',
          class_label:   p?.class_label || '',
          stage:         c.stage,
          stage_label:   STAGE_DISPLAY[c.stage] || c.stage,
          role:          c.role === 'user' ? 'student' : c.role, // 归一：user→student, assistant
          content:       c.content,
          created_at:    c.created_at
        };
      });

      if (format === 'csv') return sendCsv(res, 'PBL_研究_对话明细.csv', {
        '学生姓名':'display_name','邮箱':'email','学号':'student_code','班级':'class_label',
        '阶段':'stage_label','阶段代码':'stage','发送方':'role','内容':'content','时间':'created_at'
      }, rows);

      return res.status(200).json({ kind:'conversations', count: rows.length, data: rows });
    }

    if (kind === 'apilogs') {
      const { data: logs, error: lErr } = await supabaseAdmin
        .from('api_logs')
        .select('student_id, student_code, stage, student_message, ai_reply, system_prompt_version, model, temperature, max_tokens, prompt_tokens, completion_tokens, total_tokens, latency_ms, status_code, error, created_at')
        .order('created_at', { ascending: true });
      if (lErr) throw lErr;

      const rows = (logs || []).map(l => {
        const p = (students || []).find(x => x.id === l.student_id);
        return {
          ...l,
          email:         emailOf[l.student_id] || '',
          display_name:  p?.display_name || '',
          class_label:   p?.class_label || '',
          stage_label:   STAGE_DISPLAY[l.stage] || l.stage
        };
      });

      if (format === 'csv') return sendCsv(res, 'PBL_研究_API调用明细.csv', {
        '学生姓名':'display_name','邮箱':'email','班级':'class_label','阶段':'stage_label','阶段代码':'stage',
        '学生原话':'student_message','AI回答':'ai_reply',
        '规则版本':'system_prompt_version','模型':'model','temperature':'temperature','max_tokens':'max_tokens',
        '输入tokens':'prompt_tokens','输出tokens':'completion_tokens','总tokens':'total_tokens','延迟ms':'latency_ms',
        '状态码':'status_code','错误':'error','时间':'created_at'
      }, rows);

      return res.status(200).json({ kind:'apilogs', count: rows.length, data: rows });
    }

    return res.status(400).json({ error:'bad_kind', message:"kind 必须为 'conversations' 或 'apilogs'" });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ error: 'internal', message: e.message });
  }
};

// 把一组对象序列化成 UTF-8 BOM CSV 直接返回（列顺序 = headers 的插入顺序）
function sendCsv(res, filename, headers, rows) {
  const cols = Object.keys(headers); // {表头: 字段名}
  const BOM = '\uFEFF';
  const csv = [cols.map(csvCell).join(',')]
    .concat(rows.map(r => cols.map(c => csvCell(r[headers[c]])).join(',')))
    .join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.status(200).send(BOM + csv);
}

function csvCell(v) {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
}