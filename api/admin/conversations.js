// 教师：GET /api/admin/conversations?limit=500
// 返回每个学生 × 每个阶段的完整对话记录（学生原话 + AI 回复 + 时间）
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

    const limit = Math.min(parseInt(req.query.limit || '500', 10), 2000);

    // 1) 拉所有学生 profile（service_role，已绕过 RLS；再过滤掉教师自己）
    //    注意：profiles 表没有 email 列（email 在 auth.users），这里不选 email
    const { data: profiles, error: pErr } = await supabaseAdmin
      .from('profiles')
      .select('id, role, display_name, student_code, class_label')
      .eq('role', 'student')
      .order('created_at', { ascending: true });
    if (pErr) throw pErr;

    const studentIds = (profiles || []).map(p => p.id);

    // 2) 拉所有 conversations，按时间正序（教师从头读学生和 AI 的对话）
    const { data: convs, error: cErr } = await supabaseAdmin
      .from('conversations')
      .select('student_id, stage, role, content, created_at')
      .in('student_id', studentIds.length ? studentIds : ['00000000-0000-0000-0000-000000000000'])
      .order('created_at', { ascending: true })
      .limit(limit);
    if (cErr) throw cErr;

    // 3) 拼装：按学生 × 阶段 分组
    const grouped = {};
    for (const p of (profiles || [])) {
      grouped[p.id] = {
        student_id:    p.id,
        student_code:  p.student_code || '',
        display_name:  p.display_name || '',
        email:         p.email || '',
        class_label:   p.class_label || '',
        stages:        {}
      };
    }
    for (const c of (convs || [])) {
      const g = grouped[c.student_id];
      if (!g) continue;
      if (!g.stages[c.stage]) g.stages[c.stage] = [];
      g.stages[c.stage].push({
        role:      c.role,
        content:   c.content,
        created_at: c.created_at
      });
    }

    // 4) 转成数组 + 统计每个学生的总消息数
    const list = Object.values(grouped).map(g => {
      let total = 0;
      for (const k of Object.keys(g.stages)) total += g.stages[k].length;
      g.total_messages = total;
      return g;
    }).sort((a, b) => b.total_messages - a.total_messages); // 活跃学生排前

    return res.status(200).json({
      conversations: list,
      count: list.length
    });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ error: 'internal', message: e.message });
  }
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
}