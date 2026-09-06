// DeepSeek 客户端（OpenAI 兼容协议）
const OpenAI = require('openai');

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com/v1'
});

async function chat(messages, opts = {}) {
  const start = Date.now();
  const resp = await client.chat.completions.create({
    model: opts.model || 'deepseek-chat',
    messages,
    temperature: opts.temperature ?? 0.6,
    max_tokens: opts.max_tokens ?? 1500
  });
  const latency = Date.now() - start;
  return {
    content: resp.choices[0].message.content,
    usage: resp.usage,
    latency
  };
}

module.exports = { chat };
