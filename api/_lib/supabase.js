// 服务端 Supabase 客户端（service_role，可绕过 RLS，**绝不能暴露给前端**）
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON || !SERVICE) {
  console.warn('[supabase] 缺少环境变量，请检查 Vercel 项目设置');
}

const supabaseAdmin = createClient(URL || '', SERVICE || '', {
  auth: { autoRefreshToken: false, persistSession: false }
});

module.exports = { supabaseAdmin, URL, ANON };
