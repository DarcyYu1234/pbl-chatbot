// 教师：POST /api/admin/stage { stage: 'problem_formulation'|'investigation'|'analysis'|'reflection' }
const { authenticate, requireTeacher } = require('../_lib/auth');
const { supabaseAdmin } = require('../_lib/supabase');
const { STAGE_DISPLAY } = require('../_lib/prompts');

const ALLOWED = ['problem_formulation','investigation','analysis','reflection'];

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const auth = await authenticate(req);
    if (!auth) return res.status(401).json({ error: 'unauthenticated' });
    requireTeacher(auth);

    const { stage } = req.body || {};
    if (!ALLOWED.includes(stage)) {
      return res.status(400).json({ error: 'invalid_stage', allowed: ALLOWED });
    }
    await supabaseAdmin.from('settings').upsert({
      key: 'current_stage',
      value: stage,
      updated_at: new Date().toISOString(),
      updated_by: auth.user.id
    });
    return res.status(200).json({ ok: true, stage, stage_display: STAGE_DISPLAY[stage] });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ error: 'internal', message: e.message });
  }
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}
