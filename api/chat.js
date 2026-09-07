// 学生发送一条消息 → 加载该阶段历史 → 调 DeepSeek → 持久化 → 写日志
const { authenticate, requireStudent } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { chat } = require('./_lib/deepseek');
const { getPrompt, getPromptMeta, STAGE_DISPLAY } = require('./_lib/prompts');
const { logApiCall } = require('./_lib/logger');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const auth = await authenticate(req);
    if (!auth) return res.status(401).json({ error: 'unauthenticated' });
    requireStudent(auth);

    // 1) 取全局设置
    const { data: settings } = await supabaseAdmin
      .from('settings')
      .select('key,value')
      .in('key', ['chatbot_enabled', 'current_stage']);
    const cfg = Object.fromEntries((settings || []).map(r => [r.key, r.value]));
    if (cfg.chatbot_enabled === false) {
      return res.status(503).json({
        error: 'chatbot_disabled',
        message: 'chatbot 当前被教师关闭，请稍后再试。'
      });
    }
    const stage = cfg.current_stage || 'problem_formulation';

    // 2) 读取学生消息
    const { message } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'empty_message' });
    }
    const userText = message.trim();

    // 3) 加载此学生 × 此阶段的对话历史
    const { data: history } = await supabaseAdmin
      .from('conversations')
      .select('role,content,created_at')
      .eq('student_id', auth.user.id)
      .eq('stage', stage)
      .order('created_at', { ascending: true })
      .limit(40);

    const systemPrompt = getPrompt(stage);
    const promptMeta = getPromptMeta(stage); // { stage, text, version } 供日志记录规则版本
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(history || []).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: userText }
    ];

    // 4) 先持久化学生消息
    await supabaseAdmin.from('conversations').insert({
      student_id: auth.user.id,
      stage,
      role: 'user',
      content: userText
    });

    // 5) 调 DeepSeek
    let resp, errMsg;
    try {
      resp = await chat(messages);
    } catch (e) {
      errMsg = e.message;
      await logApiCall({
        studentId:          auth.user.id,
        studentCode:        auth.profile.student_code,
        stage,
        studentMessage:     userText,
        aiReply:            null,
        systemPromptVersion: promptMeta.version,
        model:              null,
        temperature:        null,
        maxTokens:          null,
        usage: null,
        latency: 0,
        statusCode: 502,
        error: errMsg
      });
      return res.status(502).json({ error: 'upstream_error', message: errMsg });
    }

    // 6) 持久化助手回复
    await supabaseAdmin.from('conversations').insert({
      student_id: auth.user.id,
      stage,
      role: 'assistant',
      content: resp.content
    });

    // 7) 写日志（研究级：完整输入输出 + 生成配置 + 规则版本）
    await logApiCall({
      studentId:          auth.user.id,
      studentCode:        auth.profile.student_code,
      stage,
      studentMessage:     userText,
      aiReply:            resp.content,
      systemPromptVersion: promptMeta.version,
      model:              resp.model,
      temperature:        resp.temperature,
      maxTokens:          resp.max_tokens,
      usage:        resp.usage,
      latency:      resp.latency,
      statusCode:   200,
      error: null
    });

    // 8) 返回
    return res.status(200).json({
      reply: resp.content,
      stage,
      stage_display: STAGE_DISPLAY[stage],
      usage: resp.usage
    });
  } catch (e) {
    console.error(e);
    return res.status(e.statusCode || 500).json({ error: 'internal', message: e.message });
  }
};
