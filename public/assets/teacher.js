// 教师仪表盘
// =========================================================
//  ⚠️ 必须和 auth.js / student.js 里完全一致 —— 部署后替换：
// =========================================================
const SUPABASE_URL     = 'https://nlbsaevhqowzonhkkejj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sYnNhZXZocW93em9uaGtrZWpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2NzYzMTgsImV4cCI6MjEwNDI1MjMxOH0.YnGByKNooge2dLkS8RBW30YzGqbnyqBZ8ufWgvs7CXM';
// =========================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STAGE_DISPLAY = {
  problem_formulation: '① 问题建构',
  investigation:       '② 调查与数据收集',
  analysis:            '③ 分析与建模',
  reflection:          '④ 反思与结论'
};

let session;

async function init() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) { location.href = '/'; return; }
  session = data.session;

  const { data: p, error: pErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();
  if (pErr || !p || p.role !== 'teacher') {
    document.body.innerHTML = `
      <div style="padding:30px;font-family:monospace;background:#fef2f2;color:#7f1d1d;min-height:100vh">
        <h2>教师身份校验失败</h2>
        <p><b>session.user.id：</b><br><code style="word-break:break-all">${session.user.id}</code></p>
        <p><b>profile 查询结果：</b></p>
        <pre>${JSON.stringify({ profile: p, error: pErr }, null, 2)}</pre>
        <p style="margin-top:20px">请把以上信息截图发给开发者排查。</p>
      </div>`;
    return;
  }
  document.getElementById('userLabel').textContent = '教师：' + p.display_name;
  document.getElementById('logoutBtn').onclick = async () => {
    await supabase.auth.signOut();
    location.href = '/';
  };

  await loadCtrl();
  await loadStudents();
  await loadLogs();

  document.getElementById('toggleBot').onchange     = onToggle;
  document.getElementById('applyStageBtn').onclick   = onStage;
  document.getElementById('createBtn').onclick       = onCreate;
  document.getElementById('refreshLogs').onclick     = loadLogs;

  // 每 15 秒自动刷新控制状态 + 日志
  setInterval(async () => { await loadCtrl(); await loadLogs(); }, 15000);
}

async function authedFetch(path, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: `Bearer ${session.access_token}`
    }
  });
}

async function loadCtrl() {
  const { data } = await supabase
    .from('settings')
    .select('key,value')
    .in('key', ['chatbot_enabled', 'current_stage']);
  const cfg = Object.fromEntries((data || []).map(r => [r.key, r.value]));
  document.getElementById('toggleBot').checked = cfg.chatbot_enabled !== false;
  document.getElementById('stageSelect').value = cfg.current_stage || 'problem_formulation';
}

async function onToggle(e) {
  const enabled = e.target.checked;
  const r = await authedFetch('/api/admin/toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled })
  });
  document.getElementById('ctrlMsg').textContent =
    r.ok ? `已${enabled ? '开启' : '关闭'} chatbot` : '更新失败';
}

async function onStage() {
  const stage = document.getElementById('stageSelect').value;
  const r = await authedFetch('/api/admin/stage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage })
  });
  document.getElementById('ctrlMsg').textContent =
    r.ok ? `当前阶段已切换到 ${STAGE_DISPLAY[stage]}` : '更新失败';
}

async function loadStudents() {
  const r  = await authedFetch('/api/admin/students');
  const j  = await r.json();
  const tbody = document.querySelector('#studentsTbl tbody');
  tbody.innerHTML = '';
  for (const s of (j.students || [])) {
    const tr = document.createElement('tr');
    const when = new Date(s.created_at).toLocaleDateString();
    tr.innerHTML = `
      <td>${escape(s.email)}</td>
      <td>${escape(s.display_name)}</td>
      <td>${escape(s.student_code || '')}</td>
      <td>${escape(s.class_label || '')}</td>
      <td>${when}</td>
      <td>
        <button data-id="${s.id}" data-name="${escape(s.display_name)}" class="reset">🔑 重置密码</button>
        <button data-id="${s.id}" class="del">删除</button>
      </td>
    `;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll('.reset').forEach(btn => {
    btn.onclick = () => onResetPassword(btn.dataset.id, btn.dataset.name);
  });
  tbody.querySelectorAll('.del').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('确认删除这个学生账号？此操作不可逆。')) return;
      const r = await authedFetch('/api/admin/students?id=' + btn.dataset.id, {
        method: 'DELETE'
      });
      if (r.ok) { loadStudents(); }
      else alert('删除失败');
    };
  });
}

// 重置某个学生的密码为新的 6 位数字，弹出新密码给教师抄给学生
async function onResetPassword(id, name) {
  const newPwd = String(Math.floor(100000 + Math.random() * 900000));
  if (!confirm(`将把「${name}」的密码重置为：\n\n${newPwd}\n\n（请抄给学生后再点确定）`)) return;
  const r = await authedFetch('/api/admin/students', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, password: newPwd })
  });
  if (r.ok) {
    alert(`✅ 密码已重置为 ${newPwd}，请把新密码告知 ${name}`);
  } else {
    alert('重置失败');
  }
}

async function onCreate() {
  const email        = document.getElementById('newEmail').value.trim();
  const display_name = document.getElementById('newName').value.trim();
  const student_code = document.getElementById('newCode').value.trim();
  const class_label  = document.getElementById('newClass').value.trim();
  const password     = document.getElementById('newPwd').value;
  if (!email || !password) { alert('邮箱和密码必填'); return; }

  const r = await authedFetch('/api/admin/students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, display_name, student_code, class_label })
  });
  const j = await r.json();
  const msg = document.getElementById('studentMsg');
  if (!r.ok) {
    msg.textContent = '失败：' + (j.error || '未知错误');
    return;
  }
  msg.innerHTML = `✅ 已创建 <code>${escape(email)}</code>，初始密码：<code>${escape(password)}</code>（请把这两条信息告知学生）`;
  // 清空表单
  ['newEmail','newName','newCode','newClass','newPwd'].forEach(id => {
    document.getElementById(id).value = '';
  });
  loadStudents();
}

async function loadLogs() {
  const r = await authedFetch('/api/admin/logs?limit=200');
  const j = await r.json();
  const tbody = document.getElementById('logsTbody');
  tbody.innerHTML = '';
  for (const l of (j.logs || [])) {
    const tr = document.createElement('tr');
    const when = new Date(l.created_at).toLocaleString();
    tr.innerHTML = `
      <td>${when}</td>
      <td>${escape(l.student_code || (l.student_id ? l.student_id.slice(0,8) : '—') || '—')}</td>
      <td>${STAGE_DISPLAY[l.stage] || l.stage || '—'}</td>
      <td>${l.prompt_tokens ?? '—'}</td>
      <td>${l.completion_tokens ?? '—'}</td>
      <td>${l.latency_ms ?? '—'}</td>
      <td style="color:${l.status_code === 200 ? '#15803d' : '#dc2626'}">
        ${l.status_code}${l.error ? ` · ${escape((l.error || '').slice(0, 40))}` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  }
}

function escape(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

init();
