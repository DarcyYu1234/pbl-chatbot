// 教师：/api/admin/students
//   GET    → 列出所有学生
//   POST   → 创建一个学生账号
//   PATCH  → 更新姓名/学号/班级/密码
//   DELETE → 删除一个学生账号
const { authenticate, requireTeacher } = require('../_lib/auth');
const { supabaseAdmin } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const auth = await authenticate(req);
    if (!auth) return res.status(401).json({ error: 'unauthenticated' });
    requireTeacher(auth);

    if (req.method === 'GET') {
      // 1) profiles 列表（只返回学生，排除教师）
      const { data: profiles, error } = await supabaseAdmin
        .from('profiles')
        .select('id, role, display_name, student_code, class_label, created_at')
        .eq('role', 'student')
        .order('created_at', { ascending: true });
      if (error) throw error;
      // 2) 用 service_role 拿每个 id 对应的 email
      const enriched = [];
      for (const p of (profiles || [])) {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(p.id);
        enriched.push({ ...p, email: u?.user?.email || null });
      }
      return res.status(200).json({ students: enriched });
    }

    if (req.method === 'POST') {
      const { email, password, display_name, student_code, class_label } = req.body || {};
      if (!email || !password) return res.status(400).json({ error: 'email_and_password_required' });
      if (password.length < 6)    return res.status(400).json({ error: 'password_too_short' });

      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: display_name || email.split('@')[0] }
      });
      if (createErr) return res.status(400).json({ error: createErr.message });

      // 覆盖 profile（触发器会先创建一个默认 student，这里只更新额外字段）
      if (student_code || class_label) {
        await supabaseAdmin.from('profiles').update({
          student_code: student_code || null,
          class_label:  class_label  || null,
          role: 'student'
        }).eq('id', created.user.id);
      }
      return res.status(200).json({
        ok: true,
        id: created.user.id,
        email,
        initial_password: password
      });
    }

    if (req.method === 'PATCH') {
      const { id, display_name, student_code, class_label, password } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id_required' });

      if (display_name !== undefined || student_code !== undefined || class_label !== undefined) {
        const upd = {};
        if (display_name !== undefined) upd.display_name = display_name;
        if (student_code !== undefined) upd.student_code = student_code;
        if (class_label  !== undefined) upd.class_label  = class_label;
        await supabaseAdmin.from('profiles').update(upd).eq('id', id);
      }
      if (password) {
        await supabaseAdmin.auth.admin.updateUserById(id, { password });
      }
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'id_required' });
      await supabaseAdmin.auth.admin.deleteUser(id);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).end();
  } catch (e) {
    return res.status(e.statusCode || 500).json({ error: 'internal', message: e.message });
  }
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
}
