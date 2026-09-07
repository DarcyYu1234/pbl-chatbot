// DeepSeek 客户端（OpenAI 兼容协议）
const OpenAI = require('openai');

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com/v1'
});

async function chat(messages, opts = {}) {
  const start = Date.now();
  const model       = opts.model || 'deepseek-chat';
  const temperature = opts.temperature ?? 0.6;
  const maxTokens   = opts.max_tokens ?? 1500;
  const resp = await client.chat.completions.create({
    model,
    messages,
    temperature,
    max_tokens: maxTokens
  });
  const latency = Date.now() - start;
  return {
    content: resp.choices[0].message.content,
    usage: resp.usage,
    latency,
    // 回传实际生效的生成配置，供 api_logs 记录、研究时回看"这个回答是怎么配出来的"
    model,
    temperature,
    max_tokens: maxTokens
  };
}

module.exports = { chat };
