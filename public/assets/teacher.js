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
  document.getElementById('bulkCreateBtn').onclick   = onBulkCreate;
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
        <button data-id="${s.id}" class="del">删除</button>
      </td>
    `;
    tbody.appendChild(tr);
  }
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

// ============ 批量创建学生账号 ============
async function onBulkCreate() {
  const raw = document.getElementById('bulkInput').value;
  const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (lines.length === 0) { alert('请至少粘贴一行：姓名,班级'); return; }
  if (lines.length > 50)  { alert(`最多 50 行，当前 ${lines.length} 行，请删减后再提交`); return; }

  const entries = lines.map(parseBulkLine).filter(e => e.display_name);

  const btn = document.getElementById('bulkCreateBtn');
  btn.disabled = true; btn.textContent = '生成中…';

  try {
    const r = await authedFetch('/api/admin/students_bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries })
    });
    const j = await r.json();
    if (!r.ok) {
      alert('批量创建失败：' + (j.error || '未知错误'));
      return;
    }
    renderBulkResult(j);
    if (j.ok_count > 0) loadStudents();
  } catch (e) {
    alert('网络异常：' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '批量生成账号';
  }
}

function parseBulkLine(line) {
  // 支持中英文逗号 / 多个空格 / 制表符分隔
  const parts = line.split(/[,，\t]|\s{2,}/).map(s => s.trim()).filter(Boolean);
  return { display_name: parts[0] || '', class_label: parts[1] || '' };
}

function renderBulkResult(resp) {
  const div = document.getElementById('bulkResult');
  if (!resp || !Array.isArray(resp.results)) {
    div.innerHTML = '<p style="color:var(--err)">响应异常，请稍后重试。</p>';
    return;
  }
  const ok   = resp.results.filter(r =>  r.ok);
  const fail = resp.results.filter(r => !r.ok);

  let html = `<p style="margin-top:12px">
    ✅ 成功 <b>${resp.ok_count}</b> 个${fail.length ? `，失败 <b style="color:var(--err)">${resp.fail_count}</b> 个` : ''}
  </p>`;

  if (ok.length > 0) {
    html += `
      <div class="row" style="margin:6px 0">
        <button id="bulkCopyTsv">📋 复制全部（TSV，贴 Excel）</button>
        <button id="bulkCopyCsv">📋 复制全部（CSV）</button>
      </div>
      <table class="tbl">
        <thead><tr><th>姓名</th><th>班级</th><th>学号</th><th>邮箱</th><th>密码</th></tr></thead>
        <tbody>
          ${ok.map(r => `
            <tr>
              <td>${escape(r.display_name)}</td>
              <td>${escape(r.class_label || '')}</td>
              <td><code>${r.student_code}</code></td>
              <td><code>${r.email}</code></td>
              <td><code>${r.password}</code></td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  }
  if (fail.length > 0) {
    html += `
      <p style="color:var(--err);margin-top:14px">失败明细（修正后重新粘贴这几行再提交即可）：</p>
      <table class="tbl">
        <thead><tr><th>姓名</th><th>班级</th><th>原因</th></tr></thead>
        <tbody>
          ${fail.map(r => `
            <tr>
              <td>${escape(r.display_name)}</td>
              <td>${escape(r.class_label || '')}</td>
              <td style="color:var(--err)">${escape(r.error || '')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  }
  div.innerHTML = html;

  if (ok.length > 0) {
    const header = ['姓名', '班级', '学号', '邮箱', '密码'];
    const tsv = [header.join('\t')]
      .concat(ok.map(r => [r.display_name, r.class_label || '', r.student_code, r.email, r.password].join('\t')))
      .join('\n');
    const csv = [header.join(',')]
      .concat(ok.map(r => [csvCell(r.display_name), csvCell(r.class_label || ''), r.student_code, r.email, r.password].join(',')))
      .join('\n');
    document.getElementById('bulkCopyTsv').onclick = () => copyBulk(tsv, 'TSV');
    document.getElementById('bulkCopyCsv').onclick = () => copyBulk(csv, 'CSV');
  }
}

function csvCell(s) {
  const str = String(s == null ? '' : s);
  return /[,"\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

async function copyBulk(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    const btn = document.activeElement;
    const orig = btn ? btn.textContent : '';
    if (btn) { btn.textContent = '✅ 已复制 ' + label; setTimeout(() => btn.textContent = orig, 1500); }
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); alert('已复制 ' + label); } catch { prompt('请手动复制：', text); }
    document.body.removeChild(ta);
  }
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
