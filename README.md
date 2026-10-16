# Telegram Time-Range Exporter v1.3.3

[English](#english) | [中文](#中文说明)

<a name="english"></a>
## English

A Chrome extension (Manifest V3) that exports Telegram Web chat history for an exact, user-specified time range as JSON.

**v1.3** — Supports both `web.telegram.org/a` and `web.telegram.org/k` (auto-detected).

**v1.3.1** — Completeness check after export: if only recent messages were captured and the requested start time was never reached, it clearly warns "incomplete export" and suggests refreshing the page or switching to the K client.

**v1.3.2** — When stuck at the top, automatically "kicks" once more (scrolls down one screen and back to the top, up to 3 times) to give the client another chance to load history; the stop reason (completed / top reached / stuck) is shown in plain language and written into the JSON as `stop_reason`.

**v1.3.3** — Bug fix: while the K client fetches history, the message container can briefly become non-scrollable, and `scrollTop` assignments are silently ignored by the browser — the old logic mistook this for "stuck" and stopped early even though more history was available. Now a non-scrollable container no longer counts as stuck (waits patiently ~20s instead), and a debug snapshot (`scrollTop` / `scrollHeight` / scrollable / rounds / collected count) is written into the JSON `debug` field for troubleshooting.

### Files

- `extension/` — extension source (`manifest.json` / `popup.html` / `popup.js` / `extractor.js` / `icons/`)
- `test/run-tests.js` — Node unit tests (72 cases, pure logic: date-divider parsing, clock parsing, timestamp reconstruction, certainty override, time-range filtering, K-client bubble parsing, completeness check, stop-reason text, debug snapshot)

### How it works

- The popup collects the from/to times → `chrome.scripting` writes the config into the page, then injects `extractor.js`
- The extractor scrolls up from the bottom of the chat, collecting messages. Telegram Web's DOM only shows clock times ("14:03"), so full dates are reconstructed from date dividers (Today / Yesterday / October 14 / 10月14日, EN+CN both recognized); when a `time` element carries a full `datetime` / `title`, that is used directly (most accurate)
- Timestamps are two-tiered (certain / uncertain): uncertain ones get corrected by later scroll passes; anything still uncertain is flagged `uncertain_time: true` in the JSON
- Stops once messages older than the start time are reached; finally filters by the time range, sorts, and downloads `telegram-YYYYMMDD-HHMM-HHMM.json`

### JSON format

```json
{
  "app": "Telegram 按时间段导出 v1.3.3",
  "chat": "group name",
  "range": { "from": "2026-10-16T06:00:00+08:00", "to": "2026-10-16T15:29:00+08:00" },
  "exported_at": "2026-10-16T15:35:00+08:00",
  "count": 1769,
  "uncertain_count": 0,
  "stop_reason": "reached",
  "debug": {
    "stop_reason": "reached",
    "rounds": 273,
    "stuck_rounds": 0,
    "nudge_tries": 0,
    "collected_total": 1782,
    "scrollTop": 2398,
    "scrollHeight": 4858,
    "clientHeight": 601,
    "scrollable": true,
    "oldest_collected": "2026-10-16T05:44:00+08:00"
  },
  "messages": [
    { "n": 1, "time": "2026-10-16T06:00:00+08:00", "sender": "Gary", "text": "..." }
  ]
}
```

### Limitations

- Selectors cover both the A client (`.Message`) and K client (`.bubble`) of web.telegram.org; a major Telegram redesign may break them
- Very large ranges (many days, very active groups) scroll slowly; 50k-message safety cap
- Install: `chrome://extensions` → Developer mode → Load unpacked → select `extension/`

---

<a name="中文说明"></a>
## 中文说明

Chrome 扩展（Manifest V3）：在 Telegram 网页版按用户输入的精确起止时间导出聊天记录为 JSON。

**v1.3** 新增：同时支持 `web.telegram.org/a` 和 `web.telegram.org/k` 两个网页版（自动识别）。

**v1.3.1** 新增：导出后做完整性检查——如果只抓到最近的消息、没到达设定的开始时间，明确提示"没抓全"，并建议刷新页面或改用 K 版。

**v1.3.2** 新增：到顶卡住时自动"再踢一脚"（往下滚一屏再回顶部，最多 3 次），给客户端多一次加载历史的机会；停止原因（抓全/到顶/卡住）用人话显示在完成提示里，并写进 JSON 的 `stop_reason` 字段。

**v1.3.3** 修复：K 客户端在拉取历史时消息容器会短暂"不可滚动"，此时改 scrollTop 会被浏览器忽略，旧逻辑会误判为"卡住"而提前停下（页面明明还能往上翻）。现在容器不可滚时不计入卡住、耐心等待约 20 秒；并把停止现场（scrollTop/scrollHeight/是否可滚/轮数/已收集数）写进 JSON 的 `debug` 字段方便排查。

### 文件

- `extension/` —— 扩展源码（`manifest.json` / `popup.html` / `popup.js` / `extractor.js` / `icons/`）
- `test/run-tests.js` —— Node 单元测试（72 项，纯逻辑：日期分隔条解析、时钟解析、时间戳还原、确定性覆盖、时间段过滤、K 版气泡解析、导出完整性检查、停止原因说明、停止现场快照）

### 原理

- popup 收集起止时间 → `chrome.scripting` 把配置写入页面再注入 `extractor.js`
- extractor 从聊天底部开始自动往上翻页抓取；Telegram 网页版 DOM 里消息时间只有"几点几分"，
  用日期分隔条（今天/昨天/10月14日/October 14 等，中英都认）还原完整日期；能读到 `time` 元素的
  `datetime` / `title` 完整时间则直接采用（最准）
- 时间戳分"确定/不确定"两档：不确定的会被后轮抓取纠正，实在纠正不了的在 JSON 里标 `uncertain_time: true`
- 抓到比开始时间还早的消息就停；最后按时间段过滤、排序，下载 `telegram-YYYYMMDD-HHMM-HHMM.json`

### JSON 格式

见上方英文部分的示例（字段相同）。

### 已知限制

- 选择器同时兼容 web.telegram.org 的 A 版（`.Message`）和 K 版（`.bubble`），Telegram 大改版可能失效
- 超大时间段（跨很多天、群很活跃）翻页较慢；5 万条保护上限
- 安装：`chrome://extensions` → 开发者模式 → 加载未打包的扩展 → 选择 `extension/` 目录
