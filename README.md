# ALONG 跟课

课堂英语跟课：实时听写与中英字幕、教练三条回复、DeepSearch、翻译、AI 对话、课上就能写的纪要。

Live classroom companion: captions, a coach, DeepSearch, translation, AI chat, and a recap written during class.

仓库：[github.com/Ziqi/along](https://github.com/Ziqi/along)  
这一版改了什么、现场踩过什么坑：见 [CHANGELOG.md](./CHANGELOG.md)。  
给 Cursor 改代码用的系统全貌、8080 约定、纪要 P0：见 [CURSOR.md](./CURSOR.md)。

---

## 登录和同步（手机 / 电脑）

纪要默认只存在**这台浏览器**。手机和电脑不是同一份缓存，所以会对不上。

- 顶栏 **登录**（手机在顶栏或「更多」里）。Google 或 X。
- 登录后写入云端，换设备打开同一账号会拉回来。
- 没登录：清缓存、换浏览器、换手机，纪要就空。

上课可以不登录。要手机和电脑同一份纪要，先登录再结课。

---

## 功能

### 听课

- **开始听**：开一堂新课，打开麦克风，走 xAI Speech-to-Text Streaming。
- **暂停**：只停麦，课还在。
- **继续听**：同一堂课接着听。
- **结课**：下课并整理纪要。下一堂必须再点「开始听」。
- 左侧实录（英 + 中）。听不清的噪声（如 `???????`）会丢掉。可手写补一句。

### 教练

- 听一段再出卡片。问句三条回复；讨论接话 / 追问 / 例子，外加两条延展。
- 可单独暂停、恢复。点过的主题可从顶部游标跳回。
- **DeepSearch** 挂在该主题下面：事实 + 一段能讲四十秒的话。快写和检索并行，大约十秒；可同时开两路。
- **记 / N**：弹出要点框，写入当前纪要。

### 纪要

结课后一份文档，三块：

1. **课堂内容**：导语、要点、每个主题的段落（不是目录本身）。
2. **英语学习**：单词、搭配、句式、语法、好例句。
3. **教练**：课上出过的开口建议；点过 DeepSearch 的检索稿跟在卡片下面。

装配器拼结构（目录扩成段落、装入教练和 DeepSearch）。模型写正文。没有段落不算写完，失败会自动再写。可改标题、下载 Markdown、导出 PDF。

### 翻译

独立便签。中英互译，`+` 开新便签。

### AI 对话

课堂问答，中英都给。`+` 开新线程。可放大，Esc 收回。

---

## 模型

| 能力 | 模型 |
|---|---|
| 听写 | xAI STT Streaming |
| 字幕翻译、课上提纲、纪要填空 | grok-4.20-non-reasoning（Flash） |
| 教练、AI 对话 | grok-4.6 low；超时退 Flash |
| DeepSearch | Flash 与联网检索并行 |
| 纪要正文 | Flash 与 grok-4.6 并行，装配器收口 |

---

## 怎么跑

1. **Grok 里的预览**：浏览器打开即可。
2. **自己电脑上跑源码**：

```bash
git clone https://github.com/Ziqi/along.git
cd along
npm install
export XAI_API_KEY=your_key
npm start
```

Chrome 听写最稳。`npm start` 会检查开发服务是不是已经在跑。

```bash
npm stop
```

---

## 数据存在哪

| 层 | 何时 | 多久 |
|---|---|---|
| 本机浏览器 | 默认 | 清站点数据之前。最多 40 堂 |
| 云端数据库 | 登录后 | 账号还在就还在 |
| 下载 | Markdown / PDF | 在你磁盘上 |

---

## 课上按钮

```
开始听  →  新的一堂课（开麦）
暂停    →  麦停，课还在
继续听  →  同一堂课
结课    →  下课 + 整理纪要
```

---

## 许可

MIT
