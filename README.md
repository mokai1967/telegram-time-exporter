# Telegram 按时间段导出 v1.3.3

Chrome 扩展（Manifest V3）：在 Telegram 网页版按用户输入的精确起止时间导出聊天记录为 JSON。

v1.3 新增：同时支持 `web.telegram.org/a` 和 `web.telegram.org/k` 两个网页版（自动识别）。

v1.3.1 新增：导出后做完整性检查——如果只抓到最近的消息、没到达设定的开始时间，明确提示"没抓全"，并建议刷新页面或改用 K 版。

v1.3.2 新增：到顶卡住时自动"再踢一脚"（往下滚一屏再回顶部，最多 3 次），给客户端多一次加载历史的机会；停止原因（抓全/到顶/卡住）用人话显示在完成提示里，并写进 JSON 的 `stop_reason` 字段。

v1.3.3 修复：K 客户端在拉取历史时消息容器会短暂"不可滚动"，此时改 scrollTop 会被浏览器忽略，旧逻辑会误判为"卡住"而提前停下（页面明明还能往上翻）。现在容器不可滚时不计入卡住、耐心等待约 20 秒；并把停止现场（scrollTop/scrollHeight/是否可滚/轮数/已收集数）写进 JSON 的 `debug` 字段方便排查。

## 文件

- `extension/` —— 扩展源码（`manifest.json` / `popup.html` / `popup.js` / `extractor.js` / `icons/`）
- `test/run-tests.js` —— Node 单元测试（72 项，纯逻辑：日期分隔条解析、时钟解析、时间戳还原、确定性覆盖、时间段过滤、K 版气泡解析、导出完整性检查、停止原因说明、停止现场快照）
- `tg-time-exporter-v1.zip` —— 打包好的扩展，发给 paul 安装用

## 原理

- popup 收集起止时间 → `chrome.scripting` 把配置写入页面再注入 `extractor.js`
- extractor 从聊天底部开始自动往上翻页抓取；Telegram 网页版 DOM 里消息时间只有"几点几分"，
  用日期分隔条（今天/昨天/10月14日/October 14 等，中英都认）还原完整日期；能读到 `time` 元素的
  `datetime` / `title` 完整时间则直接采用（最准）
- 时间戳分"确定/不确定"两档：不确定的会被后轮抓取纠正，实在纠正不了的在 JSON 里标 `uncertain_time: true`
- 抓到比开始时间还早的消息就停；最后按时间段过滤、排序，下载 `telegram-YYYYMMDD-HHMM-HHMM.json`

## JSON 格式

```json
{
  "app": "Telegram 按时间段导出 v1.0",
  "chat": "群名",
  "range": { "from": "2026-10-14T22:00:00+08:00", "to": "2026-10-14T22:10:00+08:00" },
  "exported_at": "2026-10-14T22:11:00+08:00",
  "count": 42,
  "uncertain_count": 0,
  "messages": [
    { "n": 1, "time": "2026-10-14T22:00:03+08:00", "sender": "Gary", "text": "..." }
  ]
}
```

## 已知限制

- 选择器同时兼容 web.telegram.org 的 A 版（`.Message`）和 K 版（`.bubble`），Telegram 大改版可能失效
- 超大时间段（跨很多天、群很活跃）翻页较慢；5 万条保护上限
- 未在真实 Telegram 上实测（paul 的号，只读也不碰），待 paul 装上试用反馈
