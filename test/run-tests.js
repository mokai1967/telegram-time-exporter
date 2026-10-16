/* extractor.js 纯逻辑单元测试：在 Node 里跑，不碰 DOM */
'use strict';
const L = require('../extension/extractor.js');

let pass = 0, fail = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; /* console.log('ok  -', name); */ }
  else { fail++; console.log('FAIL-', name, '\n  actual:  ', a, '\n  expected:', e); }
}
function ok(cond, name) {
  if (cond) { pass++; } else { fail++; console.log('FAIL-', name); }
}

// 固定一个"现在"：2026-10-14 14:00（本地时区下构造，避免测试机时区影响）
const nowMs = new Date(2026, 9, 14, 14, 0, 0).getTime();
const D = 86400000;
const today0 = L.dayStartMs(nowMs);

// ---- parseDividerText ----
eq(L.parseDividerText('今天', nowMs), today0, 'divider 今天');
eq(L.parseDividerText('昨天', nowMs), today0 - D, 'divider 昨天');
eq(L.parseDividerText('前天', nowMs), today0 - 2 * D, 'divider 前天');
eq(L.parseDividerText('Today', nowMs), today0, 'divider Today');
eq(L.parseDividerText('Yesterday', nowMs), today0 - D, 'divider Yesterday');
(function () {
  const r = L.parseDividerText('10月14日', nowMs);
  const d = new Date(r);
  ok(d.getMonth() === 9 && d.getDate() === 14 && d.getHours() === 0, 'divider 10月14日');
})();
(function () {
  const r = L.parseDividerText('October 14', nowMs);
  const d = new Date(r);
  ok(d.getMonth() === 9 && d.getDate() === 14, 'divider October 14');
})();
(function () {
  // 12月25日相对10月14日是未来 -> 上一年
  const r = L.parseDividerText('12月25日', nowMs);
  const d = new Date(r);
  ok(d.getMonth() === 11 && d.getDate() === 25 && d.getFullYear() === 2025, 'divider 未来日期回退上一年');
})();
eq(L.parseDividerText('某某加入了群组', nowMs), null, 'divider 非日期返回null');
eq(L.parseDividerText('', nowMs), null, 'divider 空返回null');

// ---- parseClockText ----
eq(L.parseClockText('22:03'), { h: 22, mi: 3 }, 'clock 22:03');
eq(L.parseClockText('9:05 PM'), { h: 21, mi: 5 }, 'clock 9:05 PM');
eq(L.parseClockText('12:00 AM'), { h: 0, mi: 0 }, 'clock 12:00 AM');
eq(L.parseClockText('abc'), null, 'clock 非法返回null');
eq(L.parseClockText(''), null, 'clock 空返回null');

// ---- walkNodes：两轮抓取（从新往旧），不确定 -> 确定覆盖 ----
(function () {
  const state = { curDayMs: today0, sawDivider: false };
  // 第一轮（底部）：A 在"昨天"分隔条上方 -> 时间猜今天，不确定
  const s1 = [
    { key: 'a', sender: 'u1', text: 'hello', clockText: '23:50', fullMs: null },
    { isDivider: true, dividerText: '昨天' },
    { key: 'b', sender: 'u2', text: 'hi', clockText: '22:10', fullMs: null },
  ];
  const r1 = L.walkNodes(s1, state, nowMs);
  eq(r1.length, 2, 'walk 第一轮两条消息');
  const A1 = r1.find(m => m.key === 'a');
  eq(A1.certain, false, 'walk A 第一轮不确定');
  eq(new Date(A1.tsMs).getDate(), 14, 'walk A 第一轮暂记今天');
  const B1 = r1.find(m => m.key === 'b');
  eq(B1.certain, true, 'walk B 第一轮确定');
  eq(new Date(B1.tsMs).getDate(), 13, 'walk B 是昨天');

  // 第二轮（往上翻，重叠窗口里 A 的真分隔条出现了）
  const s2 = [
    { isDivider: true, dividerText: '昨天' },
    { key: 'a', sender: 'u1', text: 'hello', clockText: '23:50', fullMs: null },
    { key: 'c', sender: 'u3', text: 'yo', clockText: '21:00', fullMs: null },
  ];
  const r2 = L.walkNodes(s2, state, nowMs);
  const seen = new Map();
  L.mergeSeen(seen, r1);
  L.mergeSeen(seen, r2);
  const A2 = seen.get('a');
  eq(A2.certain, true, 'walk A 第二轮被纠正确定');
  eq(new Date(A2.tsMs).getDate(), 13, 'walk A 纠正为昨天');
  eq(seen.get('c').certain, true, 'walk C 确定');
  eq(seen.size, 3, 'walk 合并后3条');
})();

// ---- walkNodes：fullMs 直接确定 ----
(function () {
  const state = { curDayMs: today0, sawDivider: false };
  const full = new Date(2026, 9, 13, 20, 5, 0).getTime();
  const r = L.walkNodes(
    [{ key: 'x', sender: 'u', text: 't', clockText: '', fullMs: full }], state, nowMs);
  eq(r[0].tsMs, full, 'walk fullMs 直接采用');
  eq(r[0].certain, true, 'walk fullMs 确定');
})();

// ---- mergeSeen：确定的不被不确定的覆盖 ----
(function () {
  const seen = new Map();
  L.mergeSeen(seen, [{ key: 'k', sender: 'u', text: 't', tsMs: 100, certain: true }]);
  L.mergeSeen(seen, [{ key: 'k', sender: 'u', text: 't', tsMs: 200, certain: false }]);
  eq(seen.get('k').tsMs, 100, 'merge 确定的不被覆盖');
})();

// ---- filterByRange ----
(function () {
  const seen = new Map();
  const base = today0;
  L.mergeSeen(seen, [
    { key: '1', sender: 'u', text: 'a', tsMs: base + 10 * 3600000, certain: true },
    { key: '2', sender: 'u', text: 'b', tsMs: base + 12 * 3600000, certain: true },
    { key: '3', sender: 'u', text: 'c', tsMs: base + 14 * 3600000, certain: true },
  ]);
  const r = L.filterByRange(seen, base + 11 * 3600000, base + 13 * 3600000);
  eq(r.length, 1, 'filter 只留范围内');
  eq(r[0].key, '2', 'filter 留下正确的一条');
})();

// ---- walkNodes：续泡继承发送人，本人消息标"我"，开头无名标"未知" ----
(function () {
  const state = { curDayMs: today0, sawDivider: true, lastSender: null };
  const nodes = [
    { key: 'a', sender: 'Junqiesuiyi', text: '第一条', clockText: '16:11', fullMs: null },
    { key: 'b', sender: null, text: '续泡1', clockText: '16:11', fullMs: null },
    { key: 'c', sender: null, text: '续泡2', clockText: '16:12', fullMs: null },
    { key: 'd', sender: 'YanG', text: '换人', clockText: '16:13', fullMs: null },
    { key: 'e', sender: null, isOwn: true, text: '我发的', clockText: '16:14', fullMs: null },
  ];
  const r = L.walkNodes(nodes, state, nowMs);
  eq(r.map(m => m.sender), ['Junqiesuiyi', 'Junqiesuiyi', 'Junqiesuiyi', 'YanG', '我'], 'walk 续泡继承+本人识别');
})();
(function () {
  const state = { curDayMs: today0, sawDivider: true, lastSender: null };
  const r = L.walkNodes(
    [{ key: 'z', sender: null, text: '开头无名', clockText: '16:11', fullMs: null }], state, nowMs);
  eq(r[0].sender, '未知', 'walk 开头无名标未知');
})();

// ---- localISO / fileStamp 格式 ----
(function () {
  const s = L.localISO(new Date(2026, 9, 14, 22, 3, 5).getTime());
  ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(s), 'localISO 格式 ' + s);
  ok(L.fileStamp(new Date(2026, 9, 14, 22, 3).getTime()) === '20261014-2203', 'fileStamp 格式');
})();

// ---- parseTitleDate ----
(function () {
  const p1 = L.parseTitleDate('October 14, 2026 at 22:03');
  ok(p1 !== null && new Date(p1).getHours() === 22, 'title 英文日期');
  const p2 = L.parseTitleDate('2026年10月14日 22:03');
  ok(p2 !== null && new Date(p2).getHours() === 22, 'title 中文日期');
  eq(L.parseTitleDate('nothing'), null, 'title 非法返回null');
})();

// ---- K 版（web.telegram.org/k）adaptNode：用假 DOM 元素 ----
function fakeEl(o) {
  o = o || {};
  const classes = o.classes || [];
  const cl = { contains: function (c) { return classes.indexOf(c) >= 0; } };
  Object.defineProperty(cl, 'length', { get: function () { return classes.length; } });
  for (let i = 0; i < classes.length; i++) cl[i] = classes[i];
  const qmap = o.q || {};
  return {
    classList: cl,
    innerText: o.innerText || '',
    querySelector: function (sel) {
      const parts = String(sel).split(',');
      for (let i = 0; i < parts.length; i++) {
        const k = parts[i].trim();
        if (qmap[k]) return qmap[k];
      }
      return null;
    },
    getAttribute: function (n) { return ((o.attrs || {})[n]) || null; }
  };
}
function fakeTime(attrs, text) {
  attrs = attrs || {};
  return {
    innerText: text || '',
    title: attrs.title || '',
    getAttribute: function (n) { return attrs[n] || null; }
  };
}
(function () {
  // K 版他人消息：.bubble.is-in + .peer-title + .message + span.time[title]
  const el = fakeEl({
    classes: ['bubble', 'is-in', 'is-group-first'],
    innerText: 'Gary\n早\n06:33',
    attrs: { 'data-mid': '777' },
    q: {
      '.peer-title': { innerText: 'Gary' },
      '.message': { innerText: '早' },
      '.time': fakeTime({ title: 'October 16, 2026 at 06:33' }, '06:33')
    }
  });
  const n = L.adaptNode(el, nowMs);
  eq(n.sender, 'Gary', 'K 他人消息发送人');
  eq(n.text, '早', 'K 消息正文');
  eq(n.isOwn, false, 'K 他人消息非本人');
  eq(n.key, 'mid_777', 'K data-mid 做 key');
  ok(n.fullMs !== null && new Date(n.fullMs).getHours() === 6 &&
     new Date(n.fullMs).getMinutes() === 33 && new Date(n.fullMs).getDate() === 16,
     'K 时间 title 解析出完整时间');
})();
(function () {
  // K 版自己的消息：is-out → 本人
  const el = fakeEl({
    classes: ['bubble', 'is-out'],
    innerText: '收到\n06:35',
    attrs: { 'data-mid': '778' },
    q: {
      '.message': { innerText: '收到' },
      '.time': fakeTime({ title: 'October 16, 2026 at 06:35' }, '06:35')
    }
  });
  const n = L.adaptNode(el, nowMs);
  eq(n.isOwn, true, 'K is-out 识别为本人');
  eq(n.text, '收到', 'K 本人消息正文');
})();
(function () {
  // K 版日期分隔条：.bubble.is-date
  const n = L.adaptNode(fakeEl({ classes: ['bubble', 'is-date'], innerText: 'October 16' }), nowMs);
  eq(n.isDivider, true, 'K 日期分隔条识别');
  eq(n.dividerText, 'October 16', 'K 分隔条文字');
})();
(function () {
  // K 版服务消息（如入群通知）：.bubble.is-service → 跳过
  const n = L.adaptNode(fakeEl({ classes: ['bubble', 'is-service'], innerText: 'Gary 加入了群组' }), nowMs);
  eq(n.skip, true, 'K 服务消息跳过');
})();
(function () {
  // K 版 data-timestamp 兜底：unix 秒
  const el = fakeEl({
    classes: ['bubble', 'is-in'],
    attrs: { 'data-mid': '779' },
    q: {
      '.peer-title': { innerText: 'YanG' },
      '.message': { innerText: 'ok' },
      '.time': fakeTime({ 'data-timestamp': '1729056780' }, '06:33')
    }
  });
  const n = L.adaptNode(el, nowMs);
  eq(n.fullMs, 1729056780 * 1000, 'K data-timestamp 解析');
})();
(function () {
  // K 版只有时钟文字、无完整时间时：clockText 兜底给分隔条逻辑用
  const el = fakeEl({
    classes: ['bubble', 'is-in'],
    attrs: { 'data-mid': '780' },
    q: {
      '.peer-title': { innerText: 'YanG' },
      '.message': { innerText: 'ok' },
      '.time': fakeTime({}, '06:33')
    }
  });
  const n = L.adaptNode(el, nowMs);
  eq(n.fullMs, null, 'K 无完整时间时 fullMs 为空');
  eq(n.clockText, '06:33', 'K 时钟文字提取');
})();

// ---- assessCoverage：抓完后的完整性检查 ----
(function () {
  const base = today0;
  // 正常到达：最早的消息早于开始时间
  let seen = new Map();
  L.mergeSeen(seen, [
    { key: '1', sender: 'u', text: 'a', tsMs: base + 10 * 3600000, certain: true },
    { key: '2', sender: 'u', text: 'b', tsMs: base + 2 * 3600000, certain: true },
  ]);
  let c = L.assessCoverage(seen, base + 10 * 3600000);
  eq(c.ok, true, 'coverage 正常到达');
  eq(c.reason, 'ok', 'coverage reason ok');
  // 没抓全：最早的消息比开始时间晚 2 小时
  c = L.assessCoverage(seen, base);
  eq(c.ok, false, 'coverage 发现缺口');
  eq(c.reason, 'gap', 'coverage reason gap');
  eq(c.gapMinutes, 120, 'coverage 缺口 120 分钟');
  eq(c.count, 2, 'coverage 条数');
  // 一条都没抓到
  c = L.assessCoverage(new Map(), base);
  eq(c.ok, false, 'coverage 空');
  eq(c.reason, 'empty', 'coverage reason empty');
})();

// ---- describeStopReason：停止原因人话 ----
(function () {
  eq(L.describeStopReason('reached'), '已翻到设定的开始时间，抓全了', 'stop reached');
  eq(L.describeStopReason('top').indexOf('页面顶部') >= 0, true, 'stop top');
  eq(L.describeStopReason('stuck').indexOf('卡住') >= 0, true, 'stop stuck');
  eq(L.describeStopReason('max').indexOf('上限') >= 0, true, 'stop max');
  eq(L.describeStopReason('rounds').indexOf('上限') >= 0, true, 'stop rounds');
  eq(L.describeStopReason('weird').indexOf('weird') >= 0, true, 'stop 未知回退');
})();

// ---- snapDebug：停止现场快照（用假 scroller，不碰 DOM） ----
(function () {
  const fakeScroller = { scrollTop: 0, scrollHeight: 800, clientHeight: 600 };
  const seen = new Map();
  const base = today0;
  L.mergeSeen(seen, [{ key: '1', sender: 'u', text: 'a', tsMs: base + 3600000, certain: true }]);
  const d = L.snapDebug(fakeScroller, seen, 42, 3, 1, 'top');
  eq(d.stop_reason, 'top', 'snap stop_reason');
  eq(d.rounds, 42, 'snap rounds');
  eq(d.stuck_rounds, 3, 'snap stuck');
  eq(d.nudge_tries, 1, 'snap nudges');
  eq(d.collected_total, 1, 'snap collected');
  eq(d.scrollable, true, 'snap scrollable=true');
  eq(d.oldest_collected, L.localISO(base + 3600000), 'snap oldest');
  const d2 = L.snapDebug({ scrollTop: 0, scrollHeight: 500, clientHeight: 600 }, new Map(), 0, 0, 0, 'loading');
  eq(d2.scrollable, false, 'snap scrollable=false');
  eq(d2.oldest_collected, null, 'snap oldest null');
})();

console.log('\n通过 ' + pass + ' / ' + (pass + fail) + (fail ? ('，失败 ' + fail) : '，全部通过'));
process.exit(fail ? 1 : 0);
