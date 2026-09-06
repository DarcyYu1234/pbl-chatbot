// 学生聊天页
// =========================================================
//  ⚠️ 这两行必须和 auth.js 里完全一致 —— 在 Vercel/Supabase 建好项目后替换：
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

const chatEl    = document.getElementById('chat');
const input     = document.getElementById('input');
const sendBtn   = document.getElementById('sendBtn');
const banner    = document.getElementById('banner');
const stageBadge= document.getElementById('stageBadge');
const userLabel = document.getElementById('userLabel');
const logoutBtn = document.getElementById('logoutBtn');

let session, profile;
let currentStage = null;
let messages = [];

async function init() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) { location.href = '/'; return; }
  session = data.session;

  const { data: p, error: pErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();
  if (pErr || !p || p.role !== 'student') {
    document.body.innerHTML = `
      <div style="padding:30px;font-family:monospace;background:#fef2f2;color:#7f1d1d;min-height:100vh">
        <h2>学生身份校验失败</h2>
        <p><b>session.user.id：</b><br><code style="word-break:break-all">${session.user.id}</code></p>
        <p><b>profile 查询结果：</b></p>
        <pre>${JSON.stringify({ profile: p, error: pErr }, null, 2)}</pre>
        <p style="margin-top:20px">请把以上信息截图发给开发者排查。</p>
      </div>`;
    return;
  }
  profile = p;
  userLabel.textContent = p.display_name;

  logoutBtn.onclick = async () => {
    await supabase.auth.signOut();
    location.href = '/';
  };

  input.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };
  sendBtn.onclick = send;

  await reload();
  // 每 8 秒轮询一次，看教师是否切换阶段 / 关闭 bot
  setInterval(refreshSettings, 8000);
}

async function reload() {
  const { data: settings } = await supabase
    .from('settings')
    .select('key,value')
    .in('key', ['chatbot_enabled', 'current_stage']);
  const cfg = Object.fromEntries((settings || []).map(r => [r.key, r.value]));

  currentStage = cfg.current_stage || 'problem_formulation';
  banner.classList.toggle('hidden', cfg.chatbot_enabled !== false);
  stageBadge.textContent = STAGE_DISPLAY[currentStage] || currentStage;

  // 拉该阶段的完整历史
  const { data: rows } = await supabase
    .from('conversations')
    .select('role,content,created_at')
    .eq('student_id', session.user.id)
    .eq('stage', currentStage)
    .order('created_at', { ascending: true });
  messages = rows || [];
  render();
}

async function refreshSettings() {
  const { data } = await supabase
    .from('settings')
    .select('key,value')
    .in('key', ['chatbot_enabled', 'current_stage']);
  const cfg = Object.fromEntries((data || []).map(r => [r.key, r.value]));
  banner.classList.toggle('hidden', cfg.chatbot_enabled !== false);
  if (cfg.current_stage && cfg.current_stage !== currentStage) {
    await reload();
  }
}

function render() {
  chatEl.innerHTML = '';
  for (const m of messages) {
    const d = document.createElement('div');
    d.className = 'msg ' + (m.role === 'user' ? 'user' : 'bot');
    d.textContent = m.content;
    chatEl.appendChild(d);
  }
  chatEl.scrollTop = chatEl.scrollHeight;
}

async function send() {
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  sendBtn.disabled = true;

  // 乐观追加到 UI
  messages.push({ role: 'user', content: text });
  render();

  const stageAtSend = currentStage;

  const resp = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ message: text })
  });
  const j = await resp.json();
  sendBtn.disabled = false;

  if (!resp.ok) {
    messages.push({ role: 'assistant', content: '⚠️ ' + (j.message || j.error || '请求失败') });
    render();
    return;
  }

  // 服务端已经持久化了 user 和 assistant 两条消息。
  // 如果服务返回的 stage 跟当前不同（教师切了阶段），整批重拉历史；
  // 否则直接用服务端返回的 reply，减少一次 DB 往返。
  if (j.stage !== stageAtSend) {
    await reload();
  } else {
    messages.push({ role: 'assistant', content: j.reply });
    render();
  }
}

init();
