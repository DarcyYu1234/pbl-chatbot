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

function requireTeacher(auth) {
  if (!auth?.profile || auth.profile.role !== 'teacher') {
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
