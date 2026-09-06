// 验证请求中的 JWT 并返回用户身份
const { supabaseAdmin } = require('./supabase');

async function authenticate(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;

  const { data: userData, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !userData?.user) return null;

  const user = userData.user;
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return { user, profile };
}

// 教师邮箱白名单（与前端 auth.js / teacher.js 一致）
// 兜底原因：教师账号手动建在 auth.users，trigger 会自动给 profile 写 role='student'，
// 若后续没 UPDATE 成 teacher，role 一直是 student，会导致 requireTeacher 拒绝教师。
// 用邮箱白名单兜底，即使数据库 role 错，教师也能正常使用教师端 API。
// 生产建议改从环境变量 TEACHER_EMAILS 读取。
const TEACHER_EMAILS = ['yxyyxxdaisy@163.com'];
const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

function requireTeacher(auth) {
  const roleOk = auth?.profile?.role === 'teacher' ||
                 TEACHER_EMAILS.some(t => norm(t) === norm(auth?.user?.email));
  if (!roleOk) {
    const err = new Error('Forbidden: 需要教师角色');
    err.statusCode = 403;
    throw err;
  }
}

function requireStudent(auth) {
  if (!auth?.profile || auth.profile.role !== 'student') {
    const err = new Error('Forbidden: 需要学生角色');
    err.statusCode = 403;
    throw err;
  }
}

module.exports = { authenticate, requireTeacher, requireStudent };
