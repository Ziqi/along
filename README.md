# ALONG 跟课

课堂英语跟课：实时听写与中英字幕、教练三条回复、翻译、AI 对话、课上就能写的纪要。

Live classroom companion: captions, a coach, translation, AI chat, and a recap you write during class.

仓库：[github.com/Ziqi/along](https://github.com/Ziqi/along)

---

## 功能

### 听课
- **开始听**：开一堂新课，打开麦克风，走 xAI Speech-to-Text **Streaming**（`wss://api.x.ai/v1/stt`）。
- **暂停**：只停麦，课还在。
- **继续听**：同一堂课接着听。
- **结课**：这堂结束，自动整理纪要。下一堂必须再点「开始听」，不会误续旧课。
- 左侧是实录字幕（英 + 中）。可手写补一句。

### 教练
- 听一段再出卡片，不抢秒回。
- 模型：**grok-4.6**（`reasoning_effort: low`），超时退回 Flash。
- 看最近约 24 句，判断主题：问句给 3 条回答；讨论给接话 / 追问 / 例子。
- 可单独暂停、恢复。**DeepSearch** 挂在该主题下面。
- **记 / N**：弹出要点框，写入当前纪要，不必打开纪要页。

### 纪要
- **课中**：实录、实时提纲、自己记的要点，同一份文档。
- **结课后**：导语、段落、主题、句式、句子、单词。
- 可改标题、改正文、删除。「再出一份」另存，并标明由哪一份再出。
- 下载 Markdown，或「下载 PDF」走打印另存。

### 翻译
独立便签。中英互译，`+` 开新便签，同一便签可持续翻。

### AI 对话
课堂问答，中英都给。模型 **grok-4.6 low**。`+` 开新线程。可放大，Esc 收回。

---

## 模型

| 能力 | 模型 |
|---|---|
| 听写 | xAI STT Streaming |
| 字幕翻译、课上提纲 | grok-4.20-non-reasoning（Flash） |
| 教练、AI 对话、结课纪要、DeepSearch | grok-4.6 low；超时退 Flash |

---

## 怎么跑

有两种完全不同的「开着」：

1. **Grok 里的预览**（你现在用的）  
   跑在 Grok 的沙箱里，浏览器打开即可。你的 Mac **不会**、也 **不必** 开 8080。关掉预览页，沙箱里的开发服务可能还在，但那是云端环境，不是你电脑。

2. **自己电脑上跑源码**（clone 这份仓库）  
   这时才需要本机 `:8080`。

```bash
git clone https://github.com/Ziqi/along.git
cd along
npm install
export XAI_API_KEY=your_key
npm start
```

打开 [http://127.0.0.1:8080/](http://127.0.0.1:8080/)。Chrome 听写最稳。

`npm start` 会先检查 8080：已经在服务就直接用，没开才拉起。不要开两个。

```bash
npm stop          # 关掉占用 8080 的进程
# 或在跑着的终端里 Ctrl+C
```

关掉浏览器标签 **不会** 停 8080。停服务用 `npm stop` 或 Ctrl+C。下次再 `npm start`。

需要登录才能云端存纪要时，在 `.grok/app-env.json` 里打开 auth / database（Grok 部署会注入 `DATABASE_URL`）。本地没配数据库时，纪要只存在这台浏览器。

---

## 数据存在哪

启动时会做一次 **读写自检**（localStorage + IndexedDB 各写一条再读回）。写不进去会在顶栏提示：无痕模式或空间满时，纪要可能保不住。

| 层 | 何时 | 多久 |
|---|---|---|
| localStorage + IndexedDB | 本机浏览器 | 清站点数据之前。最多 40 堂 |
| Neon 数据库 | 登录后同步 | 账号还在就还在 |
| 下载 | Markdown / 打印 PDF | 在你磁盘上 |

换电脑、换浏览器、清缓存：没登录就会空。登录后从云端拉回。

---

## 课上按钮逻辑

```
开始听  →  新的一堂课（开麦）
暂停    →  麦停，课还在
继续听  →  同一堂课
结课    →  下课 + 整理纪要
           之后只有「开始听」，不会「继续」旧课
```

---

## 许可

MIT
