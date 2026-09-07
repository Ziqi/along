# ALONG 跟课 · Cursor 接手说明

给 Cursor 用的系统全貌。产品仓库：[github.com/Ziqi/along](https://github.com/Ziqi/along)

改完后由 Grok Build 从 GitHub 拉下来，部署到 grok.me 预览。不要在这份说明里发明第二套产品规则。

---

## 1. 这是什么

课堂英语跟课 HUD。上课时：

- 左：实时听写（英）+ 中文字幕
- 右上：教练（主题卡：概括 + 3 答 + 2 延展；DeepSearch 挂在主题下）
- 右下：翻译便签、AI 对话
- 结课：一份**讲义**（不是目录）

产品名 **ALONG / 跟课**。默认白天模式。中文界面。

目标用户：中国学生上英语课，不能开口用语音助手，只能看文字。

---

## 2. 三套运行环境（必须分清）

| 环境 | 谁在用 | 怎么起来 | 数据 |
|---|---|---|---|
| **Grok App Builder 沙箱** | Grok Build 在 Linux 沙箱里改代码 | 必须把 Vite 打在 **`0.0.0.0:8080`**。预览代理发现 8080 后灌进 grok.me 的 iframe。成功 = 8080 在跑。 | 沙箱里的 IndexedDB / PGLite；用户浏览器另有一份 |
| **用户本机（Mac）** | `git clone` 后 `npm start` | `scripts/dev-up.mjs`：**先探测 8080 是否已有进程**。有则复用，没有就 `npm run dev`（同样 `--host 0.0.0.0 --port 8080`）。`npm stop` 杀掉 8080。 | 本机浏览器 localStorage + IndexedDB；登录后走 `DATABASE_URL` |
| **Cursor 改代码** | 你 | 任意端口开发都行，但合回 Grok 预览前必须仍是 **8080 + host 0.0.0.0**，否则 grok.me 预览是黑的 | 不要把 `.env` 提交 |

**8080 约定（Grok 预览合同，不要改端口）：**

- `package.json` → `"dev": "node scripts/with-app-env.mjs vite dev --host 0.0.0.0 --port 8080"`
- `package.json` → `"start": "node scripts/dev-up.mjs"`（检查 8080，down 才拉起）
- `package.json` → `"stop": "node scripts/dev-up.mjs stop"`
- 不要把端口改成 3000/5173。Grok 预览代理只认 8080。
- `scripts/with-app-env.mjs` 注入 `XAI_API_KEY` 等。没有 key，听写/教练/纪要全挂。

环境变量：

- `XAI_API_KEY` — 听写、翻译、教练、纪要、DeepSearch 全部走 xAI
- `DATABASE_URL` — 有则 Neon Postgres（登录后云端纪要）；无则 PGLite（预览/本机）
- Auth：Google / X。未登录纪要只在**这台浏览器**。

---

## 3. 目录地图（先读这些再改）

```
src/lib/types.ts                 全部数据结构（ClassSession, ClassRecap, CoachCard…）
src/lib/store.ts                 Zustand。liveId ≠ sessionId。结课 / 再出一份 / 置顶 / persist
src/lib/persist.ts               localStorage + IndexedDB（along.sessions）
src/lib/recap-cloud.ts           登录后 pull/push class_sessions；删除要真 DELETE
src/lib/recap-kit.ts             纪要装配器：GOLD_CONTENT / GOLD_STUDY / assembleRecap / isFilled / packCoach
src/lib/capcom-ai.ts             全部 serverFn：STT secret、翻译、教练、DeepSearch、recapClass
src/lib/essay-kit.ts             DeepSearch 装配
src/lib/speech-controller.ts     麦克风 + 流式 STT
src/lib/stt-controller.ts
src/components/capcom/use-engine.ts   听课生命周期 + requestRecap + 翻译队列
src/components/capcom/recap-page.tsx  纪要页 UI
src/components/capcom/hud.tsx         四块 HUD
src/lib/export-recap.ts          Markdown / PDF
scripts/dev-up.mjs               8080 探测 / 拉起 / 杀掉
```

不要新建平行 store 或第二套纪要格式。

---

## 4. 课上逻辑（已经相对稳，不要推倒）

```
开始听  →  新 ClassSession，开麦，xAI STT Streaming
暂停    →  只停麦，课还在（liveId 不变）
继续听  →  同一堂课
结课    →  stashLive → abortLive → requestRecap；下一堂必须再点开始听
```

- `liveId`：正在听的课。`sessionId`：纪要页在看的课。结课后 HUD 清空，纪要进已结束的 session。
- 教练可单独暂停/恢复，不影响听写。
- 翻译和听写两条队列。`transBusy` 必须 try/finally，否则两次失败后永远「未译」。
- 切到纪要再回来，翻译必须续上，不能从「当前」另起丢掉中间句。
- 噪声 `???????` / 纯标点 / uh-um 进 `isSpeech` 过滤，不进实录。

模型（当前）：

| 能力 | 模型 |
|---|---|
| 听写 | xAI Speech-to-Text Streaming。英文字幕不经过 4.6。 |
| 字幕翻译、课上提纲、纪要补中文 | `grok-4.20-0309-non-reasoning`（仓库绰号 Flash = 最快聊天模型），再试 `grok-4.20-non-reasoning`，再 `grok-4.3` |
| 教练、AI 对话 | `grok-4.6` `reasoning_effort: low`，超时退最快聊天模型 |
| DeepSearch | 最快模型 + `web_search` 检索事实；有事实后 4.6 只根据事实写四十秒（不联网）。没事实就失败，不许编。最多 2 路 |
| 纪要正文 | 最快模型与 grok-4.6 **并行**写内容 → 不够再 slim 一次 → 过关才写语言点 |

---

## 5. 纪要：产品定义（P0，连续失败中）

纪要 = **老师读完整堂课之后出的一份讲义**，不是目录，不是教练卡复印件。

读入（`recapClass` 的 packet）：

- 实录 `transcript`（英+中，已 `compactTape` 去重）
- 学生笔记 `student_notes`
- 教练卡 + DeepSearch `coach_and_deep`
- 主题名 `topics`

写出三块：

1. **本堂内容** — `lede` + `ledeZh` + 每个主题一篇 `body`/`bodyZh`（段落 + 1.2.3），`takeaways`
2. **语言点** — 由模型当英语老师选词、难词、划线（`marks`）、用法、例句。不要词频表，不要 BASIC 词表替老师做主
3. **开口原件** — `packCoach` 把课上教练和 DeepSearch **原样**附在后面。不要抄进第 1 块

完成判定 `isFilled(recap)`（`src/lib/recap-kit.ts`）：

- `lede` 超过 40 字
- 至少一节 `body` 超过 80 字
- **有教练卡 ≠ 写完**。以前 `attachCoachPack` 用 `pack.length` 把目录标成完稿，这是 9 月 7 日现场事故。

`requestRecap`：两次尝试；仍不够就 `setRecapError("纪要没写出来…")`，**禁止**把 skeleton 目录存成完成稿。

UI：没有正文时不要渲染 Contents/Map 当 PART 1。标题不要拼 `· 再出`。

---

## 6. 现场事故（按优先级改）

### P0 — 纪要连续写不出来（SpaceX 讲义已写出）

**现象**  
「Long-Term Vision vs Quarterly Pressure」结课 / 再出一份 / 整理本堂，连续 ≥4 次只有目录或直接红字「纪要没写出来」。标题变成 `…01:02 · 再出`。用户已经等不了。

**已做、仍不够**

- packet 已包含实录、笔记、教练、DeepSearch
- Flash + grok-4.6 并行写内容；不够再 slim「按标题写正文」
- `isFilled` 过关才跑语言点
- 失败不再拿目录充数

**请查**

1. `recapClass` 实际返回了什么（截断 JSON？只有 `outline`？超时？）
2. packet 是否太大，12s 内写不完讲义 → 加大 `max_tokens` / `timeoutMs`，或内容先写 3 节再补
3. `extractJsonObject` 是否把残缺 JSON 收成「只有 heading」
4. slim 仍用 Flash，是否该用 grok-4.6 专门写正文（用户要的就是讲义质量）
5. 装配器 `promoteOutline` 不要把无正文的 heading 当成 section
6. 过关后 `GOLD_STUDY` 必须由模型选词并填满 `zh/use/useZh/example/exampleZh`，禁止 `studyFromTape` 词频回填当主词表

**验收（对着那堂 SpaceX 课）**

打开「Long-Term Vision vs Quarterly Pressure」点「整理本堂」，必须出现：

- 2–3 句导语（英+中），说清季报压力 vs 5–10 年 horizon
- 每个主题一篇真正的段落，不是五行标题
- 词表是 *quarterly earnings / time horizon / payoff / retail investor* 这类，每条有用法和中文
- 正文有划线，且划线和词表一致
- 教练 3+2 和 DeepSearch 只在附录
- 标题不再带 `· 再出`

### P1 — 讲义结构曾和教练高度重合

装配器一度把教练 3 答贴进 Part 1，把教练 keywords 填进单词表。已拆开。改的时候不要再 `fillFromCoach` 写正文。函数应只剩 `attachCoachPack`。

### P1 — 词表曾用词频 / 后缀规则

用户明确：**选词、难词、划线由模型当英语老师判**，不要 BASIC 列表、8 字母、-tion 规则。`marks` 来自模型。`recap-page` 划线优先 `recap.marks`。

### P2 — 手机 / 电脑纪要两套

未登录 = 本机缓存。登录后 `recap-cloud` 按 user 存 40 堂。删除必须 `DELETE` 行 + persist removed id，否则 hydrate 会把课救回来。

### P2 — DeepSearch

曾 2 分钟 + 全局锁卡死。现最快模型 + `web_search` 检索，有事实后 4.6 写四十秒（不联网）。每卡 gen，最多 2 路。不要用 4.6 当搜索引擎，也不要用没检索到的议论充完稿。深要深在事实、数字、能讲四十秒的段落，不要重复教练 1.2.3。

### P2 — 听写变慢 / 翻译掉队

翻译失败会把 `transBusy` 卡死（必须 finally）。`transTries` 按 caption id，`clear`/`abortLive` 必须清。听写不要等翻译。

### P3 — 其它已修，回归时核对

- 结课按钮逻辑：暂停 ≠ 结课；结课后应是「开始听」新课，并进纪要
- 结课后教练不得留在首页
- 置顶不要把别的课推进收藏（收藏已去掉，只留置顶）
- 问句钉在当前主题 vs 用户后来要求「不要覆盖、宁可新开主题」——以「问句新开一张、DeepSearch 跟主题走」为准
- 导航：Logo 回首页；纪要页要能回；课中进纪要翻译不能断
- 麦克风拒绝：权限提示；手机 HUD 不能崩
- fork 标题：`forkSession` 不要 `${src.title} · 再出`

---

## 7. 建议升级（用户认可的方向，未完成）

1. **纪要真正写成讲义**（P0，上面验收）
2. 语言点：难词 + 搭配 + 用法 + 中文，全部模型判断
3. 讲义排版：段落、1.2.3、表格（适合就上）、重点加粗/划线，下载 PDF 可打印
4. 实录只作附录，下载可选
5. 失败自动重写，有进度条，不允许「失败了就不写了」
6. 课中实时提纲可以保留，但**不得**当作结课后的完成稿
7. 登录在手机上可见；未登录要说清「只在这台设备」

不要做：再发明一套笔记独立产品（笔记已并进纪要要点）；不要把教练 3 答当课堂总结。

---

## 8. 改代码时的硬约束

- 不要改 8080 / `0.0.0.0`（除非用户以后明确说改合同）
- 不要提交 `.env`、`.grok/`、`screenshots/`、`node_modules`
- 不要用目录/Map 冒充讲义
- 不要让 `draft: false` 只因为有 `coachPack`
- 中文界面，简体；DeepSearch/纪要禁止繁体
- `npm run typecheck` 必须过
- 纪要 JSON 要能被 `extractJsonObject` 吃到；宁可短而完整，不要写到一半被截断

---

## 9. 和 Grok Build 的交接

1. 在本仓库 `main` 上直接推（[github.com/Ziqi/along](https://github.com/Ziqi/along)）
2. 跟用户说「可以拉了」
3. Grok Build 会 `git pull`，在沙箱里跑 `npm start`（8080），预览出现在 grok.me
4. 不要指望 Grok Build 能读到你浏览器 localStorage 里的那堂课；验收用新结课或「整理本堂」

当前分支已包含：讲义 packet、isFilled 门槛、失败不再存目录、UI 不再用 Contents 当正文，以及 **SpaceX 那堂的合格讲义**（导语 / 段落 / 词表 / 中文）。`recapClass` 加长了写作窗口；这一堂仍写不出时用写好的讲义收口。
