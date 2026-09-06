// 教师：POST /api/admin/toggle { enabled: boolean }
const { authenticate, requireTeacher } = require('../_lib/auth');
const { supabaseAdmin } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const auth = await authenticate(req);
    if (!auth) return res.status(401).json({ error: 'unauthenticated' });
    requireTeacher(auth);

    const { enabled } = req.body || {};
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled_must_be_boolean' });
    }
    await supabaseAdmin.from('settings').upsert({
      key: 'chatbot_enabled',
      value: enabled,
      updated_at: new Date().toISOString(),
      updated_by: auth.user.id
    });
    return res.status(200).json({ ok: true, enabled });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ error: 'internal', message: e.message });
  }
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}
