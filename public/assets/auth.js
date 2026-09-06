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

  if (profile.role === 'teacher') location.href = '/teacher';
  else                              location.href = '/student';
};

// 已登录则直接跳
supabase.auth.getSession().then(({ data }) => {
  if (data.session) {
    supabase.from('profiles').select('role').eq('id', data.session.user.id).single()
      .then(({ data: profile, error: pErr }) => {
        if (pErr || !profile) {
          // profile 读不到，留着让用户手动重登，不强行跳转
          console.warn('[auth.js] profile fetch failed:', pErr);
          return;
        }
        if (profile.role === 'teacher') location.href = '/teacher';
        else                              location.href = '/student';
      });
  }
});
