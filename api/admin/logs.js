// 教师：GET /api/admin/logs?limit=200
// 返回每条 DeepSeek 调用记录 + 该学生的姓名/学号/班级
const { authenticate, requireTeacher } = require('../_lib/auth');
const { supabaseAdmin } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const auth = await authenticate(req);
    if (!auth) return res.status(401).json({ error: 'unauthenticated' });
    requireTeacher(auth);

    const limit = Math.min(parseInt(req.query.limit || '200', 10), 1000);

    // 1) 拉 logs
    const { data: logs, error } = await supabaseAdmin
      .from('api_logs')
      .select('id, student_id, student_code, stage, prompt_tokens, completion_tokens, total_tokens, latency_ms, status_code, error, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;

    // 2) 收集所有出现过的 student_id，批量查 profile 拿姓名/学号/班级
    const studentIds = Array.from(new Set((logs || []).map(l => l.student_id).filter(Boolean)));
    let profileMap = {};
    if (studentIds.length > 0) {
      const { data: profiles, error: pErr } = await supabaseAdmin
        .from('profiles')
        .select('id, display_name, student_code, class_label')
        .in('id', studentIds);
      if (pErr) throw pErr;
      for (const p of (profiles || [])) profileMap[p.id] = p;
    }

    // 3) 把 profile 信息合并到每条日志
    const enriched = (logs || []).map(l => {
      const p = profileMap[l.student_id] || {};
      return {
        ...l,
        display_name:  p.display_name  || '',
        class_label:   p.class_label   || '',
        // 如果 log 里没写 student_code，从 profile 补一个
        student_code:  l.student_code  || p.student_code || ''
      };
    });

    return res.status(200).json({ logs: enriched });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ error: 'internal', message: e.message });
  }
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
}