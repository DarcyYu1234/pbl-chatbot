// 教师：POST /api/admin/students_bulk
// 一次批量创建最多 50 个学生账号，自动生成 6 位数字学号 = 6 位数字密码，邮箱 {学号}@pbl.local
// 入参：{ entries: [{ display_name, class_label }, ...] }
// 出参：{ results: [{ display_name, class_label, student_code, email, password, ok, error? }, ...], ok_count, fail_count }
const { authenticate, requireTeacher } = require('../_lib/auth');
const { supabaseAdmin } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).end();

  try {
    const auth = await authenticate(req);
    if (!auth) return res.status(401).json({ error: 'unauthenticated' });
    requireTeacher(auth);

    const { entries, email_domain } = req.body || {};
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'entries_required' });
    }
    if (entries.length > 50) {
      return res.status(400).json({ error: 'too_many', limit: 50, received: entries.length });
    }

    const domain = String(email_domain || 'pbl.local').toLowerCase().trim();
    if (!/^[a-z0-9.-]+$/.test(domain)) {
      return res.status(400).json({ error: 'invalid_email_domain' });
    }

    // 生成一个未被占用的 6 位数字学号
    async function freshCode() {
      for (let i = 0; i < 20; i++) {
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const { data } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('student_code', code)
          .maybeSingle();
        if (!data) return code;
      }
      return null;
    }

    const results = await Promise.all(entries.map(async (raw) => {
      const display_name = String(raw.display_name || '').trim();
      const class_label  = String(raw.class_label  || '').trim() || null;
      if (!display_name) {
        return { display_name: raw.display_name, class_label, ok: false, error: 'name_required' };
      }

      const student_code = await freshCode();
      if (!student_code) {
        return { display_name, class_label, ok: false, error: 'code_generation_failed' };
      }
      const email    = `${student_code}@${domain}`;
      const password = student_code; // 学号 = 密码，便于学生记忆

      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,                  // 跳过邮箱验证（pbl.local 根本不发邮件）
        user_metadata: { display_name }
      });
      if (createErr) {
        return { display_name, class_label, ok: false, error: createErr.message };
      }

      // 触发器已经建了一个默认 profile（role=student），这里只补全学号/班级
      const { error: updErr } = await supabaseAdmin.from('profiles').update({
        student_code,
        class_label,
        display_name,
        role: 'student'
      }).eq('id', created.user.id);

      if (updErr) {
        // profile 写入失败，回滚账号，避免脏数据
        await supabaseAdmin.auth.admin.deleteUser(created.user.id);
        return { display_name, class_label, ok: false, error: 'profile_update_failed:' + updErr.message };
      }

      return { display_name, class_label, student_code, email, password, ok: true };
    }));

    const ok_count   = results.filter(r =>  r.ok).length;
    const fail_count = results.length - ok_count;
    return res.status(200).json({ results, ok_count, fail_count });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ error: 'internal', message: e.message });
  }
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}