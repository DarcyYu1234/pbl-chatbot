# PBL Chatbot · 学生/教师双端 + DeepSeek

> PBL 教学 AI 探究搭子 · 多用户 · 云端部署 · 数据完整留痕可研究

---

## 0. 架构总览

```
┌──────────────┐         ┌──────────────────────────────────┐
│  学生端      │  HTTPS  │   Vercel（前端 + Serverless API）│
│  (浏览器)    │ ──────► │                                  │
└──────────────┘         │  ┌──────────────────────────┐    │
                         │  │ api/chat.js              │ ──────► DeepSeek API
┌──────────────┐         │  │ api/admin/{toggle,       │    │     (deepseek-chat)
│  教师端      │  HTTPS  │  │         stage,students,  │    │
│  (浏览器)    │ ──────► │  │         logs}.js         │    │
└──────────────┘         │  └──────────────────────────┘    │
                         │            │                     │
                         └────────────┼─────────────────────┘
                                      │  service_role
                                      ▼
                         ┌─────────────────────────────┐
                         │   Supabase                  │
                         │   • Postgres（conversations│
                         │     api_logs / settings /   │
                         │     profiles）              │
                         │   • Auth（学生/教师账号）    │
                         │   • Row Level Security      │
                         └─────────────────────────────┘
```

**为什么这样选**：
- **Vercel** 免费档够支撑博士论文的几十名学生并发；自动 HTTPS；git push 即部署；无服务器维护。
- **Supabase** 免费档 = 500MB Postgres + 50k MAU + 内置 Auth + Row Level Security；省去自建后端，且 RLS 是"防止学生互看聊天记录"的关键。
- **DeepSeek** 即给定的 API；OpenAI 兼容协议，直接复用官方 openai SDK。
- **前端零框架**：纯 HTML + 原生 ES Module + Supabase JS SDK（CDN 加载），降低你的维护负担。

---

## 1. 文件结构

```
pbl-chatbot/
├── api/                          ← Vercel Serverless Functions
│   ├── _lib/                     ← 共享库（被 Vercel 忽略，不会成为路由）
│   │   ├── auth.js               ← JWT 验证 + 角色判断
│   │   ├── deepseek.js           ← DeepSeek 客户端
│   │   ├── logger.js             ← 写 api_logs
│   │   ├── prompts.js            ← PBL 四阶段 system prompt
│   │   └── supabase.js           ← Supabase 服务端客户端
│   ├── chat.js                   ← 学生：POST /api/chat
│   └── admin/
│       ├── toggle.js             ← 教师：开关 chatbot
│       ├── stage.js              ← 教师：切换 PBL 阶段
│       ├── students.js           ← 教师：CRUD 学生账号
│       └── logs.js               ← 教师：查看 API 日志
│
├── public/                       ← 静态前端
│   ├── index.html                ←  登录页  →  /
│   ├── student.html              ←  学生聊天 →  /student
│   ├── teacher.html              ←  教师仪表盘 →  /teacher
│   └── assets/
│       ├── style.css
│       ├── auth.js               ← 登录逻辑
│       ├── student.js            ← 学生聊天逻辑
│       └── teacher.js            ← 教师仪表盘逻辑
│
├── supabase/
│   └── schema.sql                ← 数据库 + RLS（一次性脚本）
│
├── vercel.json                   ← 路由重写
├── package.json
├── .env.example                  ← 环境变量模板（**复制为 .env 后填值**）
└── README.md
```

---

## 2. 部署步骤（约 30 分钟）

### 第 1 步：创建 Supabase 项目

1. 打开 https://supabase.com/dashboard → New Project
2. 选 region（建议 Tokyo / Singapore，离国内近），设置数据库密码（**记下来**）
3. 等项目 ready（约 1 分钟）

### 第 2 步：跑 schema 建表

1. 左侧菜单 → **SQL Editor** → **New Query**
2. 打开本地 `supabase/schema.sql`，全选复制粘贴进编辑器
3. 点 **Run**（应看到 "Success. No rows returned"）
4. 左侧 **Table Editor** 应该能看到 4 张表：`profiles`、`conversations`、`api_logs`、`settings`

### 第 3 步：创建第一个教师账号

有两条路，**推荐路 A**：

#### 路 A：在 Supabase 控制台创建（最稳）
1. 左菜单 → **Authentication** → **Users** → **Add user** → **Create new user**
2. 输入你的教师邮箱 + 至少 6 位的密码 → Create
3. 再去 **SQL Editor**，执行（把邮箱换成你自己的）：
   ```sql
   update public.profiles
   set role = 'teacher', display_name = '你的姓名'
   where id = (select id from auth.users where email = '你的邮箱@xx.com');
   ```

#### 路 B：你本人先以学生身份注册、再 SQL 改角色（仅本地调试用，**不推荐**）
> ⚠️ 说明：这条路径**不是给"真的学生"用的**——它适合你自己不想进 Supabase Auth UI 创建账号时，自己通过登录页注册一个，然后 SQL 把它升级成教师。本质上那个"他"其实是你自己。

1. 用**你本人的邮箱**打开你的网站 / 注册一个普通账号（默认 role='student'）
2. Supabase → **Authentication** → **Users**，找到**你自己的那一行**（按邮箱找），点开看 user id
3. 在 **SQL Editor** 跑：
   ```sql
   update public.profiles
   set role = 'teacher'
   where id = '粘贴user-id';
   ```
4. 你下次刷新页面，就会进 /teacher

### 第 4 步：取 API 凭据

**客户端可公开的（会写进前端 HTML）：**
1. Supabase → **Settings** → **API**
2. 复制 **Project URL** → `SUPABASE_URL`
3. 复制 **anon public** key → `SUPABASE_ANON_KEY`

**仅服务端用的（绝不能进前端！）：**
4. 同页 → 复制 **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ 拥有绕过 RLS 的全部权限
5. 同页 → **JWT Settings** → **Secret**（或 **Legacy JWT Secret**）→ `SUPABASE_JWT_SECRET`

**DeepSeek：**
6. https://platform.deepseek.com → API Keys → 创建 → `DEEPSEEK_API_KEY`

### 第 5 步：部署到 Vercel

```bash
cd pbl-chatbot

# 方法 A：本地推 GitHub + Vercel 关联（推荐）
git init
git add .
git commit -m "init pbl-chatbot"
# 在 GitHub 创建空仓库后
git remote add origin https://github.com/你的用户名/pbl-chatbot.git
git push -u origin main
# 然后到 https://vercel.com/new 导入这个仓库
# ⚠️ 部署时**取消**勾 "Override build command" 和 "Install command"，保持默认
# ⚠️ 部署完后再去 Settings > Environment Variables 填下面这 5 个

# 方法 B：直接用 Vercel CLI
npm i -g vercel
vercel login
vercel   # 第一次部署会问一堆问题，一路回车接受默认即可
# 部署完后再：
vercel env add DEEPSEEK_API_KEY production
vercel env add SUPABASE_URL production
vercel env add SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add SUPABASE_JWT_SECRET production
vercel --prod
```

### 第 6 步：在前端 HTML 里填 Supabase 凭据

打开 `public/assets/auth.js`、`public/assets/student.js`、`public/assets/teacher.js`，把头部这两行替换：
```js
const SUPABASE_URL     = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';
```
填入第 4 步中**客户端可公开**的那两个值。提交新版本：
```bash
git add . && git commit -m "fill env" && git push
# Vercel 会自动 redeploy
```

### 第 7 步：测试

1. 打开你的 Vercel 域名（Vercel 会自动分配，格式 `https://pbl-chatbot-xxx.vercel.app`）
2. 用教师账号登录 → 应该进入教师仪表盘
3. 教师仪表盘 → 创建 1 个学生账号（邮箱 + 初始密码）
4. 另开隐身窗口用学生账号登录 → 应该看到聊天界面
5. 教师端切换 PBL 阶段 → 学生端 8 秒内会看到徽章变化 + 历史切换

---

## 3. 教师仪表盘的功能映射

| 你的要求 | 实现位置 |
|---|---|
| ① 看到所有 API 调用数据 | `/api/admin/logs`，前端"③ API 调用日志"表 |
| ② 控制 chatbot 开关 | `/api/admin/toggle`，前端"① 全局控制"复选框 |
| ③ 分配学生账号 + 记录姓名 | `/api/admin/students`，前端"② 学生账号管理"表 + 创建表单 |
| ④ 控制 PBL 阶段 | `/api/admin/stage`，前端下拉框（4 选 1） |

学生端 "固定对话对象 = 固定阶段历史"，通过 `conversations.stage` 字段隔离；
切换阶段时，学生历史视图重新加载该阶段的消息。

---

## 4. 数据库表速查

| 表 | 谁可读 | 谁可写 | 关键字段 |
|---|---|---|---|
| `profiles`      | 所有人看自己 / 教师看全部 | 自己能 update / 教师能 update | role, display_name, student_code, class_label |
| `conversations` | 学生看自己写的 / 教师看全部 | 学生只能 insert 自己 (DB 触发约束) | student_id, stage, role, content |
| `api_logs`      | 仅教师 | 仅服务端（service_role） | tokens, latency, status_code, error |
| `settings`      | 所有人读 | 仅教师 | key: `chatbot_enabled`, `current_stage` |

**关键约束**：学生绝对看不到其他学生的聊天 / 日志 —— 这是 Postgres Row Level Security 强制保证的。  
要让别的学生能看到，需要他们登你的 Supabase 账号 + 你主动赋 role='student' → 已经在流程里挡住。

---

## 5. 数据隐私 / 未成年人注意事项 ⚠️

你在做博士论文研究，学生是初中生（**未成年人**），请务必注意：

1. **学术伦理审批**：研究开始前，必须拿到学校 IRB / 学术伦理委员会的批准。
2. **知情同意**：每位学生（+ 监护人）需要签署知情同意书，明确说明：
   - 与 chatbot 的对话会被记录
   - 教师可以看到这些记录
   - 数据用途、保留期限、销毁方式
3. **数据最小化**：
   - 学生登录账号建议用**学号**而非真实邮箱
   - `display_name` 可以只是"学生A/B/..."，避免真人姓名上网
   - 教师后续可改成"小明妈妈"那种本地化名映射
4. **国内合规**：DeepSeek 部署在境内，符合《个人信息保护法》要求；但仍应在隐私政策里注明"对话数据由 DeepSeek 处理"。
5. **数据导出/销毁**：研究结束后，可执行 `delete from conversations where student_id in (...)` 或通过 Supabase 控制台一键销毁。

---

## 6. 二次开发提示

- **想改 prompt**：编辑 `api/_lib/prompts.js`，修改后 `git push` 即生效。
- **想换 LLM**（如豆包、通义、Kimi）：替换 `api/_lib/deepseek.js` 即可，对外协议与 OpenAI 兼容。
- **想加阶段日志**：表已经在用，分析时直接 join `api_logs` 和 `profiles`。
- **想加导出功能**：在 `api/admin/` 加个 `export.js`，把 conversations 导出 CSV 即可。

---

## 7. 常见问题

**Q1：学生登录后看到"unauthenticated"？**
A：Supabase Auth 配置里要确认开启 Email/Password 登录。  
   Supabase → Authentication → Providers → Email → Enable ON、Confirm Email **OFF**（科研场景）。

**Q2：教师仪表盘打不开（被踢回登录页）？**
A：99% 是忘了在 SQL 里把 role 改成 'teacher'。去 Supabase profiles 表查 role 字段。

**Q3：聊天没反应？**
A：浏览器 F12 → Network → 看 /api/chat 的 status code 和返回内容。  
   502 一般是 DEEPSEEK_API_KEY 错或余额不足；401 是 token 失效。

**Q4：免费档够用吗？**
A：50 个学生 × 8 节课 × 每节 30 条对话 ≈ 12k 条记录 / 学期，远低于 Supabase 免费档 500MB 上限。  
   Vercel 免费档每月 100GB 出站流量，足够。DeepSeek 按 token 计费，研究阶段一般 ¥10-50 / 期。

**Q5：学生之间能互相看到聊天吗？**
A：绝不可能 —— 由 RLS `student_id = auth.uid()` 强制保证。
