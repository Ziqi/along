# ALONG 跟课

Classroom companion for English lessons: live captions, a coach that suggests what to say, a translator, an AI chat, and a living recap you can keep.

课堂英语跟课工具：实时字幕、教练三条回复、翻译、AI 对话、课上就能写的纪要。

## What it does

- **Listen** — `开始听` starts a class. Pause only stops the mic. `结课` ends the class and polishes the recap.
- **Coach** — pause/resume independently of the mic. Questions get three replies; discussion gets three ways in. DeepSearch stays under that topic.
- **Recap** — while class is running, the recap page shows the transcript, a live outline, and your notes. After class it becomes a full write-up (lede, sections, patterns, lines, words).
- **Jot** — `记` or `N` opens a box. Notes go onto the current recap. You do not need a separate notes app.
- **Translate / AI chat** — independent pads and threads. `+` starts a new one.

## Run locally

Needs an [xAI API key](https://console.x.ai/).

```bash
npm install
export XAI_API_KEY=your_key
npm run dev
```

Chrome is the most reliable for live speech.

## Data

- **This browser:** recaps are kept in `localStorage` and IndexedDB (up to 40 classes).
- **Signed in:** recaps also sync to the app database, so they survive a cache clear on that account.
- **Download:** Markdown, or Print → Save as PDF.

Clearing site data still wipes the local copy. Sign in if you want the cloud copy.

## License

MIT
