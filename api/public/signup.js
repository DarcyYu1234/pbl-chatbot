// 公开：POST /api/public/signup
// 学生自助注册。任何人可调用；Supabase trigger 会把 role 强制写成 'student'，
// 即使有人试图伪造 role='teacher' 也无效——RLS 策略与 is_teacher() 函数均不可绕过。
//
// 入参：{ email, password, display_name, class_label? }
// 出参：200 { ok: true, id, email }
//       4xx { error: 'invalid_email' | 'password_too_short' | 'missing_fields' | 'email_already_registered' | ... }
const { supabaseAdmin } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).end();

  try {
    const { email, password, display_name, class_label } = req.body || {};

    if (!email || !password || !display_name) {
      return res.status(400).json({ error: 'missing_fields' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return res.status(400).json({ error: 'invalid_email' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'password_too_short' });
    }

    // 用 service_role 建账号，绕过邮箱验证（学生自己的邮箱，无需确认）
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: String(email).trim().toLowerCase(),
      password: String(password),
      email_confirm: true,
      user_metadata: {
        display_name: String(display_name).trim(),
        class_label:  class_label ? String(class_label).trim() : null
      }
    });

    if (createErr) {
      // Supabase 在邮箱重复时会返回 "User already registered"
      if (/already.*registered/i.test(createErr.message)) {
        return res.status(409).json({ error: 'email_already_registered' });
      }
      return res.status(400).json({ error: createErr.message });
    }

    // 触发器已经建了默认 profile（role='student'，display_name 用 email 前缀兜底）。
    // 这里补全 display_name / class_label（保险起见再强制写一次 role='student'）。
    const { error: updErr } = await supabaseAdmin.from('profiles').update({
      display_name: String(display_name).trim(),
      class_label:  class_label ? String(class_label).trim() : null,
      role: 'student'
    }).eq('id', created.user.id);

    if (updErr) {
      // profile 写入失败，回滚账号，避免脏数据
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      return res.status(500).json({ error: 'profile_update_failed:' + updErr.message });
    }

    return res.status(200).json({ ok: true, id: created.user.id, email });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ error: 'internal', message: e.message });
  }
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}