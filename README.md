# Telegram Time Range Exporter

A Chrome extension (Manifest V3) that exports messages from Telegram Web ([web.telegram.org](https://web.telegram.org)) as JSON, filtered by an exact time range you specify.

Telegram Web only shows hours and minutes on each message. This extension rebuilds full timestamps from the date dividers ("Today", "昨天", "October 14", … — English and Chinese both supported), auto-scrolls up from the newest message until it passes your start time, then downloads the result.

## Features

- ⏱ Export any precise time range (down to the minute) as JSON
- 🕐 Full timestamps rebuilt from date dividers + message times; prefers the `<time>` element's `datetime` / `title` when available
- 👤 Sender names preserved — grouped message bubbles (which hide the name) are attributed back to the correct sender; your own messages are detected via the bubble's own-marker
- ⚠️ Messages whose time couldn't be determined exactly are flagged `"uncertain_time": true` instead of being silently mislabeled
- 📜 Zero dependencies, vanilla JS, Manifest V3

## Install

1. Download or clone this repo
2. Open `chrome://extensions`, enable **Developer mode**
3. Click **Load unpacked** and select the `extension/` folder

## Usage

1. Open the chat / group / channel on Telegram Web
2. Click the toolbar icon, set start and end time (defaults to today 00:00 → now)
3. Click the export button and watch the progress panel (bottom-right of the page)
4. A `telegram-YYYYMMDD-HHMM-HHMM.json` file downloads automatically

JSON shape:

```json
{
  "app": "Telegram 按时间段导出 v1.2.0",
  "chat": "Group name",
  "range": { "from": "2026-10-14T22:00:00+08:00", "to": "2026-10-14T22:10:00+08:00" },
  "exported_at": "2026-10-14T22:11:00+08:00",
  "count": 42,
  "uncertain_count": 0,
  "messages": [
    { "n": 1, "time": "2026-10-14T22:00:03+08:00", "sender": "Alice", "text": "..." }
  ]
}
```

## Development

The pure logic lives in `extension/extractor.js` and is unit-tested in Node (no DOM needed):

```bash
node test/run-tests.js
```

## Limitations

- DOM selectors target web.telegram.org ("A" version); a Telegram redesign may break them
- Very large ranges in very busy groups take a while (about one viewport per second); 50k-message safety cap
- Media-only messages export as `[图片]` / `[视频]` / `[文件]` placeholders (captions included when present)

## 中文说明

在 Telegram 网页版按你输入的精确起止时间（精确到分钟）导出聊天记录为 JSON。用法：打开要导出的聊天后点工具栏图标，设好时间点导出，右下角看进度，完成后自动下载。时间戳用日期分隔条还原（中英都认）；时间不确定的消息会标 `uncertain_time: true`。安装见上面 Install 三步。

## License

MIT
