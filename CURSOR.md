# ALONG 跟课 · Cursor 接手说明

给 Cursor 用的系统全貌。产品仓库：[github.com/Ziqi/along](https://github.com/Ziqi/along)

改完后由 Grok Build 从 GitHub 拉下来，部署到 grok.me 预览。不要在这份说明里发明第二套产品规则。

---

## 1. 这是什么

课堂英语跟课 HUD。上课时：

- 左：实时听写（英）+ 行下中文（听懂这一句，不是翻译垫）
- 右：教练。开课前手选互动 / 旁听 / 只听；上课不能改课型
  - 互动 / 旁听：同意 / 对比 / 例子，或问句三答
  - 只听：这句 / 剖析 / 背景
- 结课：一份**讲义**（不是目录）。只听的 Part 3 是课中剖析，不是开口原件

不要把翻译垫、AI 对话、听课底下的打字口加回去。

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
src/lib/persist.ts               localStorage + IndexedDB（along.sessions）+ 本机墓碑
src/lib/session-sync.ts          云端推送计划：一处去抖、只推变了的堂次、只补未确认的墓碑
src/lib/session-limits.ts        40 堂 / 512 KB / schemaVersion 三个上限，客户端与服务端共用
src/lib/recap-cloud.ts           登录后 pull/push class_sessions；删除写 tombstone 行，服务端保留 40 行
src/lib/recap-kit.ts             纪要装配器：GOLD_CONTENT / GOLD_STUDY / assembleRecap / isFilled / packCoach
src/lib/ai/                      AI 入口的门：同源校验、调用者识别（登录 id 或 IP）、每人每分钟令牌桶
src/lib/capcom-ai.ts             全部 serverFn：STT secret、翻译、教练、DeepSearch、recapClass（全部挂 aiGuard）
src/lib/essay-kit.ts             DeepSearch 装配
src/lib/speech-controller.ts     麦克风 + 流式 STT
src/lib/stt-controller.ts
src/lib/class-mode.ts            课型、旁听间隔、课中剖析标题
src/lib/coach-kit.ts             跟听间隔、是否留卡、教练栏文案
src/lib/coach-assemble.ts        教练装配器：三种课型盖章三条名字，不编开口
src/components/capcom/use-engine.ts   听课生命周期 + requestRecap + 翻译队列 + 卡住重写
src/components/capcom/mission-shell.tsx  听课 | 教练两栏
src/components/capcom/recap-page.tsx  纪要页 UI
src/lib/export-recap.ts          Markdown / 打印
scripts/dev-up.mjs               8080 探测 / 拉起 / 杀掉
```

不要新建平行 store 或第二套纪要格式。

---

## 4. 课上逻辑（已经相对稳，不要推倒）

```
开始听  →  手选课型，新 ClassSession，开麦，xAI STT Streaming
暂停    →  只停麦，课还在（liveId 不变）
继续听  →  同一堂课，不再问课型
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
| 教练 | `grok-4.6` `reasoning_effort: low`，超时退最快聊天模型 |
| DeepSearch | 最快模型 + `web_search` 检索事实；互动 / 旁听写四十秒，只听写背景。没事实就失败，不许编。最多 2 路 |
| 纪要正文 | 最快模型与 grok-4.6 **并行**写内容 → 不够再 slim 一次 → 过关才写语言点 |

---

## 5. 纪要：产品定义

纪要 = **老师读完整堂课之后出的一份讲义**，不是目录，不是教练卡复印件。

读入（`recapClass` 的 packet）：

- 实录 `transcript`（英+中，已 `compactTape` 去重）
- 学生笔记 `student_notes`
- 教练卡 + DeepSearch `coach_and_deep`
- 主题名 `topics`

写出三块：

1. **本堂内容** — `lede` + `ledeZh` + 每个主题一篇 `body`/`bodyZh`（段落 + 1.2.3），`takeaways`
2. **语言点** — 由模型当英语老师选词、难词、划线（`marks`）、用法、例句。不要词频表，不要 BASIC 词表替老师做主
3. **附录** — `packCoach` 把课上教练和 DeepSearch **原样**附在后面。互动 / 旁听叫开口原件；只听叫课中剖析。不要抄进第 1 块

完成判定（`src/lib/recap-kit.ts`），分两道门：

- 正文门 `isEssayFilled`：`lede` 与 `ledeZh` 都超过 40 字；至少 **2 节** 同时有成段英文 `body`（不是纯 1.2.3 列表）、超过 40 字的 `bodyZh`、且标题不是听写碎片。
- 服务端再叠一层 `essayReadyForClass`：正文不得整段粘贴教练三条开口句；正文必须用到课堂原料（随手记 / DeepSearch 事实 / 教练概括至少命中其一）。
- 语言点门 `isStudyFilled`：words / collos / patterns / grammar / lines 五类里 **≥4 行**齐全（en、zh、use、example 都有），其中词与搭配 **≥2 行**。
- `isFilled = isEssayFilled && isStudyFilled`。**有教练卡 ≠ 写完**。以前 `attachCoachPack` 用 `pack.length` 把目录标成完稿，这是 9 月 7 日现场事故。

`recapClass`：正文 Flash ∥ grok-4.6 并行一次，不过关再 slim 重写一次，**两次仍不过就返回错误**，不在后台连打第三次；第三次交给人点「整理本堂」。`requestRecap` 收到错误就 `setRecapError("纪要没写出来…")`，**禁止**把 skeleton 目录存成完成稿。

UI：没有正文时不要渲染 Contents/Map 当 PART 1。标题不要拼 `· 再出`。

---

## 6. 现场事故（按优先级改）

### P0（已收口）— 纪要连续写不出来

**当时现象**  
「Long-Term Vision vs Quarterly Pressure」结课 / 再出一份 / 整理本堂，连续 ≥4 次只有目录或直接红字「纪要没写出来」。标题变成 `…01:02 · 再出`。

**现状（`main`）**

- packet 包含实录、笔记、教练卡 + DeepSearch；教练概括也算「原料」，没检索、没笔记时正文仍须用到它
- 正文 Flash ∥ grok-4.6 并行 → 不过门再 slim 一次（grok-4.6）→ 仍不过就停，返回错误，把第三次交给人
- `isEssayFilled` 过关才写语言点；语言点 Flash → 不够再 grok-4.6 一次 → 缺中文补一次翻译
- 失败不再拿目录充数；`extractJsonObject` 会抢救被截断的 JSON；`promoteOutline` 不把无正文 heading 当 section
- 开口句判定放宽到「整句粘贴」才打回，引用一句好例子不再触发重写

回归时仍要核对的点：`recapClass` 返回体是否完整（截断 / 只有 outline / 超时），以及 `GOLD_STUDY` 词表是否由模型选词、每行 `zh/use/useZh/example/exampleZh` 齐全。

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

未登录 = 本机缓存。登录后 `recap-cloud` 按 user 存 40 堂，服务端每次推送后只保留最新 40 行。删除 = 本机 removed id + 服务端 `class_session_tombstones` 行；upsert 遇到墓碑直接跳过，另一台设备 hydrate 时会拉到墓碑并删掉本机副本，课不会复活。

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

已落地、不要倒回去：讲义三块、语言点由模型选、实录作附录、失败再写、登录同步、三种课型、两栏 HUD、不要手写混进听写。

还没做：

1. **纪要总索引**：各堂词、搭配、句式做成总索引。复习入口已经拿到整理 / 导出同一排。

已做：课型开课必选、课中不改；只听三块拉开；字号和中文字体；顶栏主次（记要点主、结课次级加确认）；纪要目录带日期和课型；**「我想说」**（记要点弹层的另一面，`sayIt` + `say-runtime`，记成 `src: "say"` 的随手记）；复习真分流（`src/lib/drill.ts`：会了升一格并按 1/3/7/14/30 天到期，再来回到本轮末尾；状态只存本机 `along.drill`）。

不要做：人声分离；纪要里写「老师说 / 同学说」；折掉同意 / 对比 / 例子；再发明一套笔记独立产品；把翻译垫 / AI 对话加回去。

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

可试、可发布的版本只有 `main`。`cursor/*` 是合并前的工作分支，合入即删，文档里不要再指向它们。不要指望沙箱能读到你浏览器里的那堂课；验收用新结课或「整理本堂」。
