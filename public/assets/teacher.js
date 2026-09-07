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
const STAGE_ORDER = ['problem_formulation','investigation','analysis','reflection'];

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

  // 归一化白名单兜底（与 auth.js 一致）
  const TEACHER_EMAILS = ['yxyyxxdaisy@163.com'];
  const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
  const isTeacherAllowed = (p && p.role === 'teacher') ||
                           TEACHER_EMAILS.some(t => norm(t) === norm(session.user.email));

  if (pErr || !p || !isTeacherAllowed) {
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

  // 第一次加载（按顺序：控制 → 学生 → 日志 → 对话）
  await loadCtrl();
  await loadStudents();
  await loadLogs();
  await loadConversations();

  // 事件绑定 —— 按钮一次刷新两个面板（API 日志 + 对话记录）
  document.getElementById('toggleBot').onchange       = onToggle;
  document.getElementById('applyStageBtn').onclick     = onStage;
  document.getElementById('createBtn').onclick         = onCreate;
  document.getElementById('refreshLogs').onclick       = refreshAll;
  document.getElementById('refreshConvs').onclick      = refreshAll;
  document.getElementById('exportLogsBtn').onclick     = () => downloadApiLogs();
  document.getElementById('exportConvsBtn').onclick    = () => downloadConversations();
  const b1 = document.getElementById('exportConvJsonBtn');
  const b2 = document.getElementById('exportLogJsonBtn');
  if (b1) b1.onclick = () => downloadConvJson();
  if (b2) b2.onclick = () => downloadLogJson();

  // 自动刷新：每 15 秒一次，UI 上有明显视觉反馈
  setInterval(refreshAll, 15000);
}

async function refreshAll() {
  flashRefreshBtn();
  await Promise.all([
    loadCtrl(),
    loadLogs(),
    loadConversations(),
    loadStudents()
  ]);
}

function flashRefreshBtn() {
  ['refreshLogs','refreshConvs'].forEach(id => {
    const b = document.getElementById(id);
    if (!b) return;
    const orig = b.dataset.orig || b.textContent;
    b.dataset.orig = orig;
    b.textContent = '⏳ 刷新中…';
    setTimeout(() => { b.textContent = orig; }, 800);
  });
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
    tr.dataset.id = s.id;
    const when = new Date(s.created_at).toLocaleDateString();
    tr.innerHTML = `
      <td>${escape(s.email)}</td>
      <td class="editable" data-field="display_name">${escape(s.display_name)}<span class="edit-hint"> ✎</span></td>
      <td class="editable" data-field="student_code">${escape(s.student_code || '')}<span class="edit-hint">${s.student_code ? ' ✎' : ' 点击填学号'}</span></td>
      <td class="editable" data-field="class_label">${escape(s.class_label || '')}<span class="edit-hint">${s.class_label ? ' ✎' : ' 点击填班级'}</span></td>
      <td>${when}</td>
      <td>
        <button data-id="${s.id}" data-name="${escape(s.display_name)}" class="reset">🔑 重置密码</button>
        <button data-id="${s.id}" class="del">删除</button>
      </td>
    `;
    tbody.appendChild(tr);
  }
  // 行内编辑：点击单元格 → 输入框 → 回车保存 / Esc 取消 / blur 失焦保存
  tbody.querySelectorAll('td.editable').forEach(td => {
    td.addEventListener('click', () => startEdit(td));
  });
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

// 行内编辑：把 td 变成 input，保存/回车/Esc 都有反馈
function startEdit(td) {
  if (td.classList.contains('editing')) return;
  const tr = td.parentElement;
  const id = tr.dataset.id;
  const field = td.dataset.field;
  const oldVal = td.firstChild ? td.firstChild.textContent : '';
  td.classList.add('editing');
  td.innerHTML = `<input type="text" class="cell-input" value="${escape(oldVal)}" placeholder="${placeholderOf(field)}">`;
  const input = td.querySelector('input');
  input.focus(); input.select();
  let done = false;
  const finish = async (save) => {
    if (done) return; done = true;
    const newVal = input.value.trim();
    td.classList.remove('editing');
    if (save && newVal !== oldVal) {
      // 保存
      const r = await authedFetch('/api/admin/students', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, [field]: newVal || null })
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert('保存失败：' + (j.message || j.error || r.status));
        td.innerHTML = `${escape(oldVal)}<span class="edit-hint"> ✎</span>`;
        return;
      }
      // 成功：保留纯文本 + 编辑提示
      td.innerHTML = `${escape(newVal)}<span class="edit-hint">${newVal ? ' ✎' : ' ' + placeholderOf(field)}</span>`;
    } else {
      td.innerHTML = `${escape(oldVal)}<span class="edit-hint">${oldVal ? ' ✎' : ' ' + placeholderOf(field)}</span>`;
    }
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

function placeholderOf(field) {
  return field === 'student_code' ? '点击填学号' : field === 'class_label' ? '点击填班级' : '';
}

// 重置某个学生的密码为新的 6 位数字
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
  if (!r.ok) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:#dc2626">加载失败：${escape(j.error || j.message || r.status)}</td></tr>`;
    return;
  }
  const logs = j.logs || [];
  window.__logsCache = logs; // 缓存原始日志，供"下载 API 记录"使用
  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted" style="text-align:center;padding:20px">暂无 API 调用记录（学生还没有发过消息）</td></tr>`;
    return;
  }
  for (const l of logs) {
    const tr = document.createElement('tr');
    const when = new Date(l.created_at).toLocaleString();
    // 学生列优先显示「姓名」，次选 student_code / student_id 前 8 位
    const who = l.display_name || l.student_code || (l.student_id ? l.student_id.slice(0,8) : '—');
    tr.innerHTML = `
      <td>${when}</td>
      <td>${escape(who)}</td>
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

// ============== 新增：加载学生对话记录 ==============
async function loadConversations() {
  const r = await authedFetch('/api/admin/conversations?limit=500');
  const j = await r.json();
  const container = document.getElementById('convList');
  if (!r.ok) {
    // 优先展示真实错误消息（后端 error 字段是固定 'internal'，真实原因在 message）
    container.innerHTML = `<p style="color:#dc2626">加载对话失败：${escape(j.message || j.error || r.status)}</p>`;
    return;
  }
  const list = j.conversations || [];
  window.__convsCache = list; // 缓存原始对话数据，供"下载对话记录"使用
  if (list.length === 0) {
    container.innerHTML = `<p class="muted" style="text-align:center;padding:30px">暂无学生记录。等学生注册并开始对话后这里会显示内容。</p>`;
    return;
  }
  container.innerHTML = '';
  for (const g of list) {
    container.appendChild(renderStudentCard(g));
  }
}

function renderStudentCard(g) {
  const card = document.createElement('div');
  card.style.cssText = 'border:1px solid var(--border);border-radius:8px;margin-bottom:12px;overflow:hidden;background:#fff';

  const header = document.createElement('div');
  header.style.cssText = 'padding:12px 16px;background:#f8fafc;cursor:pointer;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)';
  const hasMsg = g.total_messages > 0;
  header.innerHTML = `
    <div>
      <b style="font-size:14px">${escape(g.display_name || '(未命名)')}</b>
      <span class="muted small" style="margin-left:8px">${escape(g.email || '')}</span>
      <span class="muted small" style="margin-left:8px">${escape(g.student_code || '')}</span>
      <span class="muted small" style="margin-left:8px">${escape(g.class_label || '')}</span>
    </div>
    <div>
      <span class="muted small">${g.total_messages} 条消息</span>
      <span style="margin-left:12px">${hasMsg ? '▼ 展开' : '（无消息）'}</span>
    </div>
  `;

  const body = document.createElement('div');
  body.style.cssText = 'display:none;padding:12px 16px;background:#fff;max-height:600px;overflow-y:auto';

  if (!hasMsg) {
    body.innerHTML = `<p class="muted small" style="text-align:center;padding:20px">该学生还没和 chatbot 对话过</p>`;
  } else {
    let html = '';
    for (const stage of STAGE_ORDER) {
      const msgs = g.stages[stage];
      if (!msgs || msgs.length === 0) continue;
      html += `<h4 style="margin:16px 0 8px;color:var(--primary)">${STAGE_DISPLAY[stage]} <span class="muted small">(${msgs.length} 条)</span></h4>`;
      html += '<div style="display:flex;flex-direction:column;gap:8px">';
      for (const m of msgs) {
        const isUser = m.role === 'user';
        html += `
          <div style="display:flex;${isUser ? 'justify-content:flex-end' : 'justify-content:flex-start'}">
            <div style="max-width:75%;padding:8px 12px;border-radius:8px;
              background:${isUser ? '#dbeafe' : '#f1f5f9'};
              color:#0f172a;
              font-size:13px;line-height:1.5;
              white-space:pre-wrap;word-break:break-word">
              <div class="muted" style="font-size:10px;margin-bottom:4px">
                ${isUser ? '🎒 学生' : '🤖 助手'} · ${new Date(m.created_at).toLocaleString()}
              </div>
              ${escape(m.content)}
            </div>
          </div>`;
      }
      html += '</div>';
    }
    body.innerHTML = html;
  }

  header.onclick = () => {
    if (!hasMsg) return;
    const shown = body.style.display !== 'none';
    body.style.display = shown ? 'none' : 'block';
    header.lastElementChild.firstElementChild.nextSibling.textContent = shown ? '▼ 展开' : '▲ 收起';
  };

  card.appendChild(header);
  card.appendChild(body);
  return card;
}

function escape(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ============================================================
// 一键导出（CSV，UTF-8 BOM，Excel 打开不乱码）
// ============================================================

// CSV 单元格转义：含逗号/引号/换行时用引号包裹
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// 生成并触发浏览器下载一个 CSV 文件
function downloadCsv(filename, headers, rows) {
  const BOM = '\uFEFF'; // UTF-8 BOM，保证 Excel 正确识别中文
  const content = BOM + [headers.map(csvCell).join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\r\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

// ============================================================
// 研究数据下载（走后端 /api/admin/export，拿到完整数据：
// 对话明细含 email；API 调用明细含学生原话+AI回答+生成配置+规则版本）
// ============================================================

// 带鉴权地请求后端导出接口，把返回的文件保存到本地
async function downloadFromExport(kind, format, button) {
  if (button) { const t = button.textContent; button.textContent = '⏳ 生成中…'; button.disabled = true; }
  try {
    const r = await authedFetch(`/api/admin/export?kind=${kind}&format=${format}`);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert('导出失败：' + (j.message || j.error || r.status));
      return;
    }
    // 从 Content-Disposition 拿文件名，失败则用默认名
    const cd = r.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename="?([^";]+)/);
    const filename = m ? decodeURIComponent(m[1]) : (format === 'csv' ? 'PBL_研究导出.csv' : 'PBL_研究导出.json');
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) {
    alert('导出出错：' + e.message);
  } finally {
    if (button) { button.textContent = button.dataset.txt || '下载'; button.disabled = false; }
  }
}

// 导出 1：API 调用日志（研究级：学生原话 + AI 回答 + 生成配置）
async function downloadApiLogs() {
  downloadFromExport('apilogs', 'csv', document.getElementById('exportLogsBtn'));
}

// 导出 2：学生对话记录（完整、含 email、全量不限条数）
async function downloadConversations() {
  downloadFromExport('conversations', 'csv', document.getElementById('exportConvsBtn'));
}

// 导出 3/4：JSON 研究数据（对话 / API 调用），供写脚本 / 质性分析
async function downloadConvJson() {
  downloadFromExport('conversations', 'json', document.getElementById('exportConvJsonBtn'));
}
async function downloadLogJson() {
  downloadFromExport('apilogs', 'json', document.getElementById('exportLogJsonBtn'));
}

init();