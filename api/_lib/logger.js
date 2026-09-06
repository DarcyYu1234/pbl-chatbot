// 把每次 DeepSeek 调用写入 api_logs（教师仪表盘可见）
const { supabaseAdmin } = require('./supabase');

async function logApiCall({ studentId, studentCode, stage, usage, latency, statusCode, error }) {
  try {
    await supabaseAdmin.from('api_logs').insert({
      student_id:        studentId,
      student_code:      studentCode,
      stage:             stage,
      prompt_tokens:     usage?.prompt_tokens ?? null,
      completion_tokens: usage?.completion_tokens ?? null,
      total_tokens:      usage?.total_tokens ?? null,
      latency_ms:        latency ?? null,
      status_code:       statusCode ?? null,
      error:             error ? String(error).slice(0, 500) : null
    });
  } catch (e) {
    console.error('[logger] 写入 api_logs 失败:', e.message);
  }
}

module.exports = { logApiCall };
