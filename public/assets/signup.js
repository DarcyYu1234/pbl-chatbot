// 学生自助注册页
// 直接调用后端的公开注册接口 /api/public/signup
// 不需要 Supabase 客户端（前端不直接拿 service_role，所有鉴权由后端处理）

const msg = document.getElementById('msg');
const btn = document.getElementById('signupBtn');

btn.onclick = async () => {
  msg.textContent = '';
  msg.classList.remove('err-ok');

  const email           = document.getElementById('email').value.trim();
  const password        = document.getElementById('password').value;
  const passwordConfirm = document.getElementById('passwordConfirm').value;
  const display_name    = document.getElementById('displayName').value.trim();
  const class_label     = document.getElementById('classLabel').value.trim();

  if (!email || !password || !display_name) {
    msg.textContent = '请填写邮箱、密码和姓名';
    return;
  }
  if (password.length < 6) {
    msg.textContent = '密码至少 6 位';
    return;
  }
  if (password !== passwordConfirm) {
    msg.textContent = '两次输入的密码不一致';
    return;
  }

  btn.disabled = true; btn.textContent = '注册中…';
  try {
    const r = await fetch('/api/public/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, display_name, class_label })
    });
    const j = await r.json();
    if (!r.ok) {
      const map = {
        email_already_registered: '该邮箱已被注册，请直接登录或换一个邮箱',
        invalid_email:            '邮箱格式不正确',
        password_too_short:       '密码至少 6 位',
        missing_fields:           '请填写所有必填项'
      };
      msg.textContent = '❌ ' + (map[j.error] || j.error || '注册失败');
      return;
    }
    msg.classList.add('err-ok');
    msg.innerHTML = `✅ 注册成功！请<a href="/" style="color:var(--primary);text-decoration:underline">点此登录</a>`;
    ['email','password','passwordConfirm','displayName','classLabel'].forEach(id => {
      document.getElementById(id).value = '';
    });
  } catch (e) {
    msg.textContent = '网络异常：' + e.message;
  } finally {
    btn.disabled = false; btn.textContent = '注册账号';
  }
};