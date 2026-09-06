// 登录页
// =========================================================
//  在 Vercel/Supabase 建好项目后，把下面两行替换成你自己的：
// =========================================================
const SUPABASE_URL     = 'https://nlbsaevhqowzonhkkejj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sYnNhZXZocW93em9uaGtrZWpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2NzYzMTgsImV4cCI6MjEwNDI1MjMxOH0.YnGByKNooge2dLkS8RBW30YzGqbnyqBZ8ufWgvs7CXM';
// =========================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const errBox = document.getElementById('err');

// ==========================================================
// 用户要求：每次访问登录页都必须手动输入账号密码。
// 所以这里主动 signOut 清掉本 tab 的残留 session，
// 即使浏览器 localStorage 里还有 supabase 的会话，也强制显示登录表单。
// scope: 'local' 只清当前 tab，不会踢掉用户在 /teacher 或 /student 的会话。
// ==========================================================
supabase.auth.signOut({ scope: 'local' }).catch(() => { /* ignore */ });

document.getElementById('loginBtn').onclick = async () => {
  errBox.textContent = '';
  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  if (!email || !password) { errBox.textContent = '请输入邮箱和密码'; return; }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { errBox.textContent = error.message; return; }

  // 看角色，决定跳到哪里
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single();

  if (pErr || !profile) {
    errBox.textContent = '登录成功但读取 profile 失败：' + (pErr?.message || '无数据');
    return;
  }

  // ==========================================================
  // 教师身份双判断：
  //   1) profile.role === 'teacher'  （正常路径，由 trigger + signup 写入）
  //   2) email 在 TEACHER_EMAILS 白名单里  （兜底，profile.role 错时仍能正确跳转）
  // 两者满足任一即视为教师 → 跳 /teacher。
  // 之所以需要这个兜底：因为教师账号是手动建在 auth.users 里，trigger 会自动
  // 给 profile 写 role='student'，如果没有再 UPDATE 一次就一直是 student。
  // ==========================================================
  const TEACHER_EMAILS = ['yxyyxxdaisy@163.com']; // 改成你的教师邮箱
  const userEmail = String(data.user.email || '').toLowerCase().trim();
  const isTeacher = profile.role === 'teacher' || TEACHER_EMAILS.includes(userEmail);

  if (isTeacher) location.href = '/teacher';
  else              location.href = '/student';
};
