// 教师：GET /api/admin/logs?limit=200
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
    const { data, error } = await supabaseAdmin
      .from('api_logs')
      .select('id, student_id, student_code, stage, prompt_tokens, completion_tokens, total_tokens, latency_ms, status_code, error, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;

    return res.status(200).json({ logs: data });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ error: 'internal', message: e.message });
  }
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
}
