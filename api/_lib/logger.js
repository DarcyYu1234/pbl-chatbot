// 把每次 DeepSeek 调用写入 api_logs（教师仪表盘可见）
const { supabaseAdmin } = require('./supabase');

// opts:
//   studentId, studentCode, stage
//   studentMessage         学生本次说的话
//   aiReply                AI 的完整回答
//   systemPromptVersion    当时生效的规则版本号（如 '1.0'）
//   model, temperature, maxTokens  生成配置
//   usage, latency, statusCode, error
async function logApiCall(opts) {
  const {
    studentId, studentCode, stage,
    studentMessage, aiReply,
    systemPromptVersion, model, temperature, maxTokens,
    usage, latency, statusCode, error
  } = opts;
  try {
    await supabaseAdmin.from('api_logs').insert({
      student_id:            studentId,
      student_code:          studentCode,
      stage:                 stage,
      student_message:       studentMessage ? String(studentMessage).slice(0, 2000) : null,
      ai_reply:              aiReply        ? String(aiReply).slice(0, 2000)        : null,
      system_prompt_version: systemPromptVersion || null,
      model:                 model || null,
      temperature:           temperature ?? null,
      max_tokens:            maxTokens ?? null,
      prompt_tokens:         usage?.prompt_tokens ?? null,
      completion_tokens:     usage?.completion_tokens ?? null,
      total_tokens:          usage?.total_tokens ?? null,
      latency_ms:            latency ?? null,
      status_code:           statusCode ?? null,
      error:                 error ? String(error).slice(0, 500) : null
    });
  } catch (e) {
    console.error('[logger] 写入 api_logs 失败:', e.message);
  }
}

module.exports = { logApiCall };