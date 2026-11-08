# RP 方法章待插入文本（对应 prompt v2.2）

> 用途：把 AI 的语言行为、主题锚定、年级定位写成**预注册的固定设计参数**，
> 供 §4.1 / §4.2 / §4.3 直接粘贴。英文措辞与 prompt v2.2 逐条对应，
> 评审对照附录 prompt 全文时可一一对上。

---

## 一、插入 §4.2 "Technical configuration and safeguards" 段末（核心，建议必加）

在现有句子 "Safety filters prevent harmful outputs; the researcher monitors logs
weekly and documents anomalies." **之后**追加：

> **Fixed configuration and pre-registration.** The AI partner's behaviour is
> treated as a fixed design parameter rather than a manipulated variable. Three
> elements were frozen before data collection and held identical for every
> student in the experimental condition. First, the system prompt specifying the
> facilitator persona, the four phase-specific rule sets, and the response
> boundaries is version-controlled and archived in full (version 2.2); the
> version identifier in force for each dialogue turn is written to the interaction
> log, so any prompt revision would be visible rather than silent. Second,
> generation parameters are held constant (DeepSeek-chat; temperature 0.6;
> maximum output 1500 tokens). Third, the AI partner's language behaviour is a
> fixed design parameter: it replies in the language of the student's most recent
> message, English or Chinese, re-evaluated each turn, and this rule is
> pre-registered and identical across all experimental-group students. Language
> of response therefore does not constitute a between-condition variable, nor an
> uncontrolled source of variation in the outcome measures. The unit scenario is
> likewise fixed: all students work on the same anchoring problem (the rate of
> chemical reaction, framed through a school-canteen effervescent drink), and the
> AI is instructed to keep its probes within this scenario, so that differences
> in dialogue are attributable to student–AI interaction rather than to
> differences in task content.

---

## 二、插入 §4.1 "Participants and Research Context"（若确定只做 G8–G9）

把现有第一句

> "The study is conducted across four intact science classes spanning Grades 7
> through 12 at a private school in Shenzhen, China..."

改为：

> "The study is conducted in intact science classes at Grades 8 and 9 at a
> private school in Shenzhen, China, with approximately 80 students in total and
> a roughly balanced gender distribution."

并把同段末句

> "PBL materials are differentiated in difficulty across grade levels to offset
> age-related differences in prior knowledge and reasoning capacity."

改为：

> "Because the sample is restricted to two adjacent grade levels, task materials
> are held constant across classes rather than differentiated by grade; the
> single difficulty level removes material difficulty as a source of variation
> between the two conditions."

**理由**：v2.2 已把 prompt 的读者固定为 G8–G9（13–15 岁）。若 RP 仍写 G7–G12 且
"材料按年级差异化"，评审会看到"prompt 假设单一学段、设计章描述多学段"的直接矛盾，
而且"材料差异化"会重新引入你想消除的那个变异源。

---

## 三、插入 §4.3 "The PBL Curriculum"（主题需与 prompt 锚定一致）

把 "The topic is about food in digestion." 与 "appropriate for Grades 7–12"
两处改为：

> "The topic is the rate of chemical reaction, framed through an anchoring
> scenario in which the school canteen plans to launch an effervescent drink and
> students must determine which factor — temperature, particle size,
> concentration, or a catalyst — most affects how quickly the tablet dissolves
> and reacts. The scenario is identical across classes and conditions."

> "...addresses an open-ended scientific inquiry topic appropriate for Grades 8–9."

---

## 四、若暂不改 RP 正文，至少加一句限定（最低成本方案）

在 §4.2 末尾加：

> "The prompt version reported in this study targets Grades 8–9; where the wider
> recruitment frame includes other grade levels, materials and AI scaffolding are
> aligned to that single register, and grade level enters the analysis as a
> covariate rather than as a design factor."

---

## 五、自检清单（改完 RP 后逐条对照）

- [ ] §4.1 年级范围 = prompt 里的 G8–G9（或已加第四节限定句）
- [ ] §4.1 "材料按年级差异化" 与"固定语域"不矛盾
- [ ] §4.3 主题 = 反应速率 / 泡腾片情境（不再是 digestion）
- [ ] §4.2 已声明 prompt 版本号（2.2）+ 生成参数 + 语言行为为预注册固定参数
- [ ] 附录 prompt 全文与 `docs/system_prompt_v2.2.md` 一致
- [ ] `api_logs.system_prompt_version` 能回溯到 2.2（Supabase 已跑 `seed_prompt_v2_2.sql`）
