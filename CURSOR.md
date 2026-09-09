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
| **用户本机（Mac）** | `git clone` 后 `npm start` | `scripts/dev-up.mjs`：**先探测 8080 是否已有进程**。有则复用，没有就 `npm run dev`（同样 `--host 0.0.0.0 --port 8080`）。`npm stop` 杀掉 8080。 | 本机浏览器 IndexedDB 为主存（按堂存），localStorage 只留目录索引、墓碑、同步账本；登录后走 `DATABASE_URL` |
| **Cursor 改代码** | 你 | 任意端口开发都行，但合回 Grok 预览前必须仍是 **8080 + host 0.0.0.0**，否则 grok.me 预览是黑的 | 不要把 `.env` 提交 |

**8080 约定（Grok 预览合同，不要改端口）：**

- `package.json` → `"dev": "node scripts/with-app-env.mjs vite dev --host 0.0.0.0 --port 8080"`
- `package.json` → `"start": "node scripts/dev-up.mjs"`（检查 8080，down 才拉起）
- `package.json` → `"stop": "node scripts/dev-up.mjs stop"`
- 不要把端口改成 3000/5173。Grok 预览代理只认 8080。
- `XAI_API_KEY` 由平台注入进程环境（Grok 沙箱与 grok.me 部署都有；`scripts/with-app-env.mjs` 只管 `VITE_*`）。没有 key 或钥匙没额度：听写退到浏览器识别并在听课栏写明原因，翻译一次即标「未译」，教练 / 纪要 / 脉络报「没接到模型」——不会静默。Cursor 的云端机器没有这把钥匙，在那里只能测错误路径。

环境变量：

- `XAI_API_KEY` — 听写、翻译、教练、纪要、检索（代码里叫 DeepSearch）全部走 xAI。每个入口都过 `aiGuard`：同源校验 + 调用者识别（登录 id → 本机 device id → IP）+ 每人每分钟令牌桶；IP 只是 40 倍的兜底桶，**一个教室共用一个出口也不能互相挤掉**（`src/lib/ai/limits.ts`）
- `DATABASE_URL` — 有则 Neon Postgres（登录后云端纪要）；无则 PGLite（预览/本机）。迁移在 `npm run build` 里跑（`scripts/migrate.mjs`），运行时不写盘
- Auth：Google / X。未登录纪要只在**这台浏览器**。

词汇：界面和文档说「检索」，代码、提示词和数据字段里仍叫 DeepSearch（`deep` / `essay`）。界面上不要再出现英文 DeepSearch。

---

## 3. 目录地图（先读这些再改）

三个面 = 三条路由，一个外壳、一个引擎、一个 store：

```
src/routes/__root.tsx                 文档外壳（AuthProvider、PreviewHostBridge），不放产品 UI
src/routes/_shell.tsx                 应用外壳：一条顶栏、一个引擎、一个键盘处理；中间随 URL 换，课在后台继续听
src/routes/_shell.index.tsx           /             课堂：听课 | 教练
src/routes/_shell.class.index.tsx     /class        目录，没选堂时的空态（示例讲义入口）
src/routes/_shell.class.$id.tsx       /class/:id    一份讲义；?catalog=1 目录抽屉，?edit=1 编辑态
src/routes/_shell.review.tsx          /review       刷卡；?class=<id> 只刷这一堂
src/routes/login.tsx · api/auth/$.ts  登录页与 Better Auth 路由
src/lib/nav.ts                        AppNav：引擎不认识 router，只会 home / classPage / catalog / review
```

数据与状态：

```
src/lib/types.ts                  全部数据结构（ClassSession, ClassRecap, CoachCard, Jot…）
src/lib/store.ts                  一个 zustand store = live-slice + sessions-slice 的 20 行组合，不放逻辑
src/lib/state/live-slice.ts       课中屏上的瞬时态：字幕、麦、教练卡、检索稿、flash、记要点弹层；phase 只由引擎写
src/lib/state/sessions-slice.ts   目录与堂级动作：liveId ≠ sessionId；结课 / 再出一份 / 置顶 / 改题 / 删除 / stashLive / hydrate / syncCloud
src/lib/session-persist.ts        目录的静态：读本机、写回、与云端合并、墓碑、hydrate 编排。没有 React
src/lib/session-merge.ts          纯函数：任何年代的行归一成当前形状；两份同一堂合并（更新者胜，逐字段）
src/lib/persist.ts                本机落盘：IndexedDB 按堂存（主存）；localStorage 只留 along.index（首屏索引）、along.sync（游标 + 账本）、墓碑。旧的 along.sessions 整块读一次即迁走
src/lib/session-sync.ts           云端推送计划：一处去抖、只推变了的堂次、账本记已确认指纹、只补未确认的墓碑
src/lib/session-wire.ts           一堂课在网上和库里的样子：body（实录 / 卡 / 检索 / 笔记 + 元数据列）与 recap 分开；超限先瘦身
src/lib/session-limits.ts         40 堂 / body 512 KB / recap 256 KB / schemaVersion，客户端与服务端共用
src/lib/recap-cloud.ts            登录后的服务函数：按 updated_at 游标增量 pull（带重叠窗口）、更新者胜 push；class_sessions + class_recaps + class_session_tombstones；每人保留 40 行
src/lib/session-order.ts          目录排序、置顶
src/lib/drill.ts                  复习分流：Leitner 盒子，会了升一格按 1/3/7/14/30 天到期，再来回本轮末尾；只存本机 along.drill
src/lib/segmenter.ts              纯函数：按教练卡话题（下一张卡确认才算变题）与 8 分钟上限把课切成段，太短的段并入
src/lib/segment-view.ts           脉络条的 chips、附录按段分组（纯函数）
src/lib/samples.ts                两份示例讲义（SpaceX / 记账 app）：只读页 /class/<id>，从不进目录
migrations/                       0001 auth · 0002 class_sessions · 0003 tombstones · 0004 元数据列 + class_recaps 分表
```

引擎（不依赖组件挂载，没有模块级全局）：

```
src/lib/engine/index.ts           引擎单例 createEngine({ store, nav, api })；组件只从这里拿 arm / safe / endClass / captureNote / sayLine / requestRecap…
src/lib/engine/engine.ts          编排：状态机 + 各 runtime + 心跳；abortLive 一处收口所有在途
src/lib/engine/class-machine.ts   显式状态机 idle → arming → listening ⇄ paused → ending → ended，纯函数，有测试
src/lib/engine/context.ts         EngineContext：store、nav、api（服务函数当普通 async 函数，测试可换假的）、去抖槽
src/lib/engine/listen-runtime.ts  麦与后端：xAI STT 先试两次，仍失败才换浏览器识别，并把 sttBackend / sttNote 写进 store 让学生看见；死掉的控制器不能再驱动 runtime；每个状态变化都过状态机
src/lib/engine/caption-pipeline.ts 字幕进、中文出：只译**已定型**的行（识别器说这句完了，或开头后过了 2.4 秒合并窗），一次最多 4 行，追最新，3 路在途、保留 12 条，每条 3 次后标「未译」；rate_limited 不算一次、整队歇 8 秒；unavailable 一次即标；状态全在实例上
src/lib/engine/coach-runtime.ts   教练：一次一张、永远写最新一拍，在途时只记「再来一张」，代次失效
src/lib/engine/deep-runtime.ts    检索：每卡代次，最多 2 路，其余排队
src/lib/engine/note-runtime.ts    记要点：先落纪要，另一半后台翻译
src/lib/engine/say-runtime.ts     「我想说」：中文一句 → 课上能开口的英文一句，记成 src:"say" 的随手记
src/lib/engine/structure-runtime.ts  课程脉络：心跳里用 segmenter 按教练话题切段，段收口调一次 Flash 写标题与要点，首段给课起标题；「刚才讲了什么」按需
src/lib/engine/recap-runtime.ts   结课整理 + 再出一份 + 门控（脉络作 packet 的 class_structure）
src/components/capcom/use-engine.ts  只剩 useCapcomEngine()：挂载时 engine.start()
```

服务端（`capcom-ai.ts` 只是 re-export 门面，新代码直接 import 能力文件）：

```
src/lib/ai/llm/models.ts          模型注册表：Flash 三个别名回退链、grok-4.6、各自超时。模型名只在这里出现
src/lib/ai/llm/transport.ts       调 xAI 的唯一出口：请求形状、超时、回退链、JSON 抢救、每次尝试一行结构化日志
src/lib/ai/guard.ts · guard.server.ts · bucket.ts · limits.ts   每个入口的门：同源校验、调用者识别（u: / d: / ip:）、两层令牌桶（本人额度 + IP 兜底 ×40）
src/lib/ai/errors.ts              AiErrorCode 枚举 + 每个码的中文一处（aiFail / aiErrorText），客户端按 code 分支，不按文案
src/lib/ai/prompts.ts             所有提示词一处（GOLD_* 与内联合一）
src/lib/ai/stt.ts                 mintSttSecret
src/lib/ai/translate.ts           liveTranslate · quickTranslate · sayIt
src/lib/ai/coach.ts               liveCoach → coach-assemble
src/lib/ai/deep.ts                expandTopic → essay-kit
src/lib/ai/recap.ts               recapClass → recap-kit 两道门
src/lib/ai/structure.ts           writeSegment（一段收口的标题 / 要点 / 作业）· catchUp（刚才讲了什么，三行简体）
src/lib/recap-kit.ts              纪要装配器：assembleRecap / isEssayFilled / isStudyFilled / isFilled / packCoach
src/lib/coach-assemble.ts         教练装配器：三种课型盖章三条名字，不编开口
src/lib/essay-kit.ts              检索稿装配
src/lib/class-mode.ts · coach-kit.ts · live-queue.ts   课型、间隔、队列的纯函数
src/lib/speech-controller.ts · stt-controller.ts       麦克风 + 流式 STT
```

界面：

```
src/components/capcom/mission-shell.tsx   外壳：顶栏、全局键（N 记要点 / Escape 逐层关）、记要点弹层
src/components/capcom/mission-bar.tsx     顶栏：开始听 / 暂停 / 继续听 / 记要点（主）/ 结课（次级 + 确认）/ 课型弹层
src/components/capcom/classroom.tsx · downlink-panel.tsx · uplink-panel.tsx   课堂两栏：听课 | 教练（手机两页签）
src/components/capcom/jot-pad.tsx         记要点 / 我想说 双页签弹层
src/components/capcom/recap-page.tsx + recap/   讲义页：目录、正文、语言点、附录、刷卡、导出、示例入口
src/components/ui/button.tsx · sheet.tsx · confirm.tsx · menu.tsx   四级按钮（primary / secondary / quiet / danger）+ 固定尺寸、弹层、确认、菜单
src/styles.css                            全部设计令牌：五档字阶 + 三种行高、纸感调色、一种划词 .key、自托管 IBM Plex
src/lib/export-recap.ts                   Markdown / 打印
scripts/dev-up.mjs                        8080 探测 / 拉起 / 杀掉
scripts/ai-latency.mjs                    把 [ai] 日志汇总成 tag · model 的次数 / 成功率 / p50 / p95 / 失败原因
```

不要新建平行 store、第二套纪要格式，或把引擎逻辑写回组件。

---

## 4. 课上逻辑（已经相对稳，不要推倒）

课是一台显式状态机（`src/lib/engine/class-machine.ts`，纯函数，有测试），引擎是唯一写手，store 只镜像 `phase`：

```
idle → arming → listening ⇄ paused → ending → ended → (arm) arming

开始听  →  arm：手选课型，新 ClassSession，开麦；后端接通才 mic_live → listening
暂停    →  pause：只停麦，课还在（liveId 不变），字幕队列不清，在途翻译照常落地
继续听  →  arm：同一堂课，不再问课型；xAI 听写重新接
结课    →  end → abortLive → closeMic → clear(keepRecap) → ended → requestRecap；try/finally 保证离开 ending
首页    →  reset：只在没有开着的课时清 HUD；ending 中不允许
```

- `liveId`：正在听的课。`sessionId`：纪要页在看的课。结课后 HUD 清空，纪要进已结束的 session。
- 双击 / 乱序事件由表查出 `null` 直接忽略（arming 时再 arm、ending 时再 end），不用 if 链。
- 教练可单独暂停/恢复（`coach.setLive`），不影响听写。暂停不 abort 教练和翻译，只关麦。
- **听写后端**：xAI STT 先试两次（间隔 1.5 秒），仍失败才换浏览器识别，并把 `sttBackend: "browser"` 和原因（太频繁 / 没钥匙 / 钥匙被 xAI 拒绝 / 没接上）写进 store，听课栏挂「浏览器听写」标记。**不许静默切换**——浏览器识别慢、不准、会重复，学生必须知道自己在用哪个。
- 浏览器识别的 interim 是累积的，`speech-controller` 只发增量（`unsaidTail`）；不这样做每段话会一行行重复「M Taylor Swift」。
- 翻译队列（`caption-pipeline`）：**一行定型了才译**——识别器给了 `speech_final`（`Caption.done`，之后的碎句不再并进这行），或这行开头后过了 `MERGE_WINDOW_MS`（2.4 秒，和 `pushFinal` 的合并窗同一个常量）。以前每来一个碎句 0.6 秒就发一次翻译，行一长答案就作废，三分之一的调用白扔、两个槽被占着，模型慢到 3 秒以上队列就塌——这就是"翻译不及时、有时不出来"。定型的行一次最多 4 行一起译（服务端 `translate.batch`，按 id 对回来，模型丢了 id 就按顺序），3 路在途，保留最新 12 条，每条 3 次后标「未译」；`rate_limited` 不算一次、整队歇 8 秒；`unavailable` 和被 xAI 拒绝的钥匙（`upstream` 401/402/403）一次即标（`isTerminalAiFail`）。一路回来立刻再看队列，不等心跳。busy 计数在 finally 里减，abort 归零。
- 切到纪要再回来，翻译必须续上，不能从「当前」另起丢掉中间句。
- 噪声 `???????` / 纯标点 / uh-um 进 `isSpeech` 过滤，不进实录。
- **session 是累加器，屏不是**：屏上只留最新 180 句；`stashLive` 用 `mergeTape` 按重叠拼接实录、`unionById` 并教练卡、合并检索，从不整段替换。翻译失败的句子英文照留。每 20 秒、标签页隐藏、离开页面各 stash 一次（只写盘）。
- **刷新后课还在**：从盘上 hydrate 时接手这台设备最近一堂未结束的课（回到 paused，实录 / 卡 / 检索回屏上）；云端拉来的别的设备开着的课不接手；6 小时没动的「进行中」在下次开课收掉。
- **首页不碰讲义**：`goHome` 不清 `recapPending / recapStage / recapError`；整理按堂记 `recapTarget`，另一堂的页面不显示、也不能发起会顶掉它的第二次整理。
- 每个 AI 调用在客户端都有 `withDeadline`；检索抛错要清占位草稿。
- xAI 听写：两次尝试按连接计，接通即清零；只有当前 socket 能改状态；麦克风轨道 `ended` 与音频图挂起都要上报，不许送静音装作在听。
- **课程脉络取代提纲**：不再有每 12 秒的模型调用。`segmenter` 在每次心跳里按教练卡话题切段（变题要下一张卡确认；太短并入；8 分钟必切；停写时只按时间），段收口才调一次 Flash 写 `heading / claims / todo`，第一段给课起标题（`canAutoTitle` 仍管）。段存在 `session.segments`，只写盘不推云，随下一次 stash 上云。「刚才讲了什么」只在学生点时调一次，结果只进 live slice，不持久化。
- 附录按段分组（`groupPackBySegment`），讲义 packet 带 `class_structure` 作参考，模型仍按 2–4 节合并；`recap.outline` 字段只读旧讲义，不再写。

模型（当前）：

| 能力 | 模型 |
|---|---|
| 听写 | xAI Speech-to-Text Streaming。英文字幕不经过 4.6。 |
| 字幕翻译、脉络段收口、刚才讲了什么、纪要补中文 | `grok-4.20-0309-non-reasoning`（仓库绰号 Flash = 最快聊天模型），再试 `grok-4.20-non-reasoning`，再 `grok-4.3` |
| 教练 | `grok-4.6` `reasoning_effort: low`，超时退最快聊天模型 |
| DeepSearch | 最快模型 + `web_search` 检索事实；互动 / 旁听写四十秒，只听写背景。没事实就失败，不许编。最多 2 路 |
| 纪要正文 | 最快模型与 grok-4.6 **并行**写内容 → 不够再 slim 一次 → 过关才写语言点 |

为什么是这几个（对照 docs.x.ai，2026-09）：

- 每句字幕都要过一次翻译，量最大、最赶时间 → 最快的非推理模型（首字约 0.5 s、约 200 tok/s，$1.25/$2.50 每百万），80 token、8 s 超时。
- 教练要判对话题、写对三条 → `grok-4.6`（官方称最聪明也最快的模型）`reasoning_effort: low`，10 s 不到再退最快模型 10 s。代价是慢的一拍最多等 20 s；`COACH_PRIMARY_MS` 要按实测 p95 调，别拍脑袋。
- 检索先用最快模型 + `web_search`（Responses API，15 s）拿事实，再让 4.6 只根据事实写四十秒（12 s）。不用 4.6 直接联网：慢一倍、贵一倍，且容易把议论当事实。
- 纪要正文让最快模型和 4.6 **同时**写一稿，装配器取过门的；多花一份 token 换一次点击就出讲义。
- `FLASH_MODELS` 末位的 `grok-4.3` 是推理模型，只在前两个 4.20 别名都 400/404 时才会到；真到了会明显变慢，日志里 `translate · grok-4.3` 一出现就该换掉。

**用数字判，不用感觉判**：服务端每次模型调用都写一行 `[ai] {tag, model, ms, ok, status, reason}`。`node scripts/ai-latency.mjs <日志文件>`（或把 `vercel logs` 管进去）按 tag · model 给出次数、成功率、p50 / p95 / max 和失败原因。改模型或超时之前先看这张表。钥匙所在的 xAI 团队没额度时所有调用都是 `upstream 403`，听课栏会直接写「xAI 拒绝了这个部署的听写钥匙」。

---

## 5. 纪要：产品定义

纪要 = **老师读完整堂课之后出的一份讲义**，不是目录，不是教练卡复印件。

读入（`recapClass` 的 packet）：

- 实录 `transcript`（英+中，已 `compactTape` 去重）
- 学生笔记 `student_notes`
- 教练卡 + DeepSearch `coach_and_deep`
- 课程脉络 `class_structure`（每段的标题、时间、要点、作业；作节的划分参考，可合并）
- 主题名 `topics`（缺时由段标题补）

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

### P1（9 月 8 日）— 听写变差、一直重复、暂停后翻译全失败

**现象**：识别慢、听错、反复打出「M Taylor Swift」；暂停再继续听后翻译全「未译」。

**原因**：重复模式是浏览器识别器的签名（累积 interim 被当成整句反复上屏），说明 xAI 听写没接上、被**静默**换成了浏览器识别。接不上的最可能原因是新加的限流按 IP 记账——同一个办公室 / 教室 / 代理后的所有人共用 10 次听写密钥、90 次翻译每分钟，一个人续听拿不到密钥，所有人的翻译一起被拒；客户端遇拒绝还连烧三次直接标「未译」。

**现状**：限流键 登录 id → 本机 device id → IP，IP 只作 40 倍兜底；xAI 听写先重试一次再换浏览器，换了就挂「浏览器听写」标记和原因；浏览器识别只发增量；翻译遇 `rate_limited` 歇 8 秒不计次。回归时核对：`listen-runtime.test.ts`、`caption-pipeline.test.ts`、`bucket.test.ts`、`speech-controller.test.ts`。

### P1（9 月 8 日，第二轮审查）— 五处会丢课的路，两处会把讲义写歪的路

四路审查（引擎 / 数据 / AI / 界面）查出并已修，详见 `docs/review-2026-09-08.md` §3：索引空壳在读失败时盖掉整堂课；换账号把上一个人的课推进新账号；屏上 180 句整段替换 session 让一小时只剩后半；翻译失败的句子从实录消失；刷新后开着的课不接手；`recapClass` 只读开头 36 句；段落 640 字符截断；中文门接受英文和繁体。回归时核对 `session-merge.test.ts`（mergeTape、完稿不被草稿盖）、`recap-kit.test.ts`（中文门、spread、段落）、`listen-runtime.test.ts`（按连接计次）。

### P1（9 月 9 日）— 翻译不及时、有时不出来

**原因**：翻译按碎句发。xAI 每 1–2 秒给一个 chunk_final，客户端 0.6 秒后就发翻译；2.4 秒内的下一个碎句并进同一行，行一长，在途的答案因为英文对不上被丢掉——模拟一堂课约 37% 的调用白扔，两个槽被占着；Flash 慢到 3 秒时 p90 等 6.6 秒，5 秒时有 17 行永远没译出来（最长等 50 秒）。**现状**：只译定型的行（`speech_final` 或 2.4 秒合并窗到），最多 4 行一起译，3 路在途；同样的模拟 0 次白扔、全部译出、5 秒模型时最长等 5.7 秒。回归核对 `caption-pipeline.test.ts`（定型、合并、按 id 对回、按序兜底）。

### P2 — 听写变慢 / 翻译掉队（更早）

翻译失败会把 busy 卡死（必须 finally）。tries 按 caption id，`abort` 必须清。听写不要等翻译。

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

还没做（先修再拓，依据见 `docs/review-2026-09-08.md` §4–§6）：

1. **测试基建**：`src/lib/state/*` 改成相对 `.ts` 导入让 node 能跑，补 `pushFinal / stashLive / applyCatalog / clear` 的 slice 测试。
2. **多标签页互通**（BroadcastChannel）；**手机触控** xs / sm 按钮加 `max-md:min-h-11`；**超限瘦身两端一致**（`slimToLimit` 进 `session-wire`）。
3. **教练节流**改前沿带尾沿；**教练错误按码分支**；**暂停不丢最后半句**；迁移 0004 跳过坏行；SSR 主题闪。
4. **借同类产品**：字幕行一键标记进讲义；xAI STT `keyterm` 专有名词偏置（段标题与卡的 keys 是现成词表）；课后「问这堂课」只引用实录作答。已做：「刚才讲了什么」、话题时间线（脉络条 + 附录分段）、老师布置的作业（段的 `todo`，进 takeaways）。
5. **纪要总索引**：各堂词、搭配、句式做成总索引。复习入口已经拿到整理 / 导出同一排。
6. **界面**：字幕点词看释义；教练卡等待时长可见；手机横屏两栏；讲义页固定目录与三步整理进度；词条「加到复习」开关；复习键盘 / 滑动；首次引导一屏。

已做：课型开课必选、课中不改；只听三块拉开；字号和中文字体；顶栏主次（记要点主、结课次级加确认）；纪要目录带日期和课型；**「我想说」**（记要点弹层的另一面，`sayIt` + `say-runtime`，记成 `src: "say"` 的随手记）；复习真分流（`src/lib/drill.ts`：会了升一格并按 1/3/7/14/30 天到期，再来回到本轮末尾；状态只存本机 `along.drill`）。

不要做：人声分离；纪要里写「老师说 / 同学说」；折掉同意 / 对比 / 例子；再发明一套笔记独立产品；把翻译垫 / AI 对话加回去。

---

## 8. 改代码时的硬约束

- 不要改 8080 / `0.0.0.0`（除非用户以后明确说改合同）
- 不要提交 `.env`、`.grok/`、`screenshots/`、`node_modules`
- 不要用目录/Map 冒充讲义
- 不要让 `draft: false` 只因为有 `coachPack`
- 中文界面，简体；DeepSearch/纪要禁止繁体；界面上写「检索」不写 DeepSearch
- `npm run typecheck`、`npm test`、`npm run build` 都必须过；改了课上逻辑要跑 `browser-smoke` 看 dev 和 built 两份
- 纪要 JSON 要能被 `extractJsonObject` 吃到；宁可短而完整，不要写到一半被截断
- 引擎逻辑只写在 `src/lib/engine/`，组件只调 `@/lib/engine` 的导出；不要再有模块级全局
- 课的状态只能通过 `dispatch` 走状态机，不要在组件里 `setPhase`
- 任何降级（换识别器、限流、没钥匙）都要让学生看见原因，不许静默
- 限流的 key 不能只按 IP；新加 AI 入口必须挂 `aiGuard` 并 `takeAiToken(context.caller, kind)`
- AI 错误一律 `aiFail(code)`：`code` 是合同、`error` 是给人看的中文；客户端按 `code` 分支（`isTerminalAiError`），不要 `/太频繁/` 匹配文案
- 不要往 `__root.tsx` 放 `og:*`；不要删 `PreviewHostBridge`、`startup.sh`、`server/`

---

## 9. 和 Grok Build 的交接

1. 在本仓库 `main` 上直接推（[github.com/Ziqi/along](https://github.com/Ziqi/along)）
2. 跟用户说「可以拉了」
3. Grok Build 会 `git pull`，在沙箱里跑 `npm start`（8080），预览出现在 grok.me
4. 不要指望 Grok Build 能读到你浏览器 localStorage 里的那堂课；验收用新结课或「整理本堂」

可试、可发布的版本只有 `main`。`cursor/*` 是合并前的工作分支，合入即删，文档里不要再指向它们。不要指望沙箱能读到你浏览器里的那堂课；验收用新结课或「整理本堂」。
