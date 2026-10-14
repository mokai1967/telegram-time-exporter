/* Telegram 按时间段导出 v1.2.0
 * 注入到 web.telegram.org 页面中运行：按用户指定的精确时间段收集消息，打包下载 JSON。
 * 在浏览器里：popup 通过 chrome.scripting 先写入 window.__tgexport_cfg 再注入本文件，自动运行。
 * 在 Node 里：require 本文件可做单元测试（纯逻辑部分），不会触碰 DOM。
 */
(function () {
'use strict';

/* ================= 纯逻辑（浏览器 / Node 通用） ================= */

function pad2(n) { return (n < 10 ? '0' : '') + n; }

function dayStartMs(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/* 日期分隔条文字 -> 当天 00:00（ms，本地时区）；认不出返回 null。
 * 支持：今天/昨天/前天、Today/Yesterday、10月14日、October 14 / 14 October */
function parseDividerText(text, nowMs) {
  if (text === null || text === undefined) return null;
  const t = String(text).trim();
  if (!t) return null;
  const now = nowMs === undefined ? Date.now() : nowMs;
  const today = dayStartMs(now);
  const D = 86400000;
  if (/^(今天|today)$/i.test(t)) return today;
  if (/^(昨天|yesterday)$/i.test(t)) return today - D;
  if (/^前天$/.test(t)) return today - 2 * D;
  let m = t.match(/(\d{1,2})\s*月\s*(\d{1,2})/);
  if (m) return monthDayToMs(+m[1], +m[2], now);
  const EN = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
  const pat = '(january|february|march|april|may|june|july|august|september|october|november|december)';
  m = t.match(new RegExp(pat + '\\s+(\\d{1,2})', 'i'));
  if (m) return monthDayToMs(EN[m[1].toLowerCase()], +m[2], now);
  m = t.match(new RegExp('(\\d{1,2})\\s+' + pat, 'i'));
  if (m) return monthDayToMs(EN[m[2].toLowerCase()], +m[1], now);
  return null;
}

function monthDayToMs(month, day, nowMs) {
  const now = new Date(nowMs === undefined ? Date.now() : nowMs);
  let d = new Date(now.getFullYear(), month - 1, day);
  d.setHours(0, 0, 0, 0);
  if (d.getTime() > now.getTime()) {
    d = new Date(now.getFullYear() - 1, month - 1, day);
    d.setHours(0, 0, 0, 0);
  }
  return d.getTime();
}

/* "22:03" / "9:05 PM" -> {h, mi}；认不出返回 null */
function parseClockText(text) {
  if (text === null || text === undefined) return null;
  const t = String(text).trim();
  if (!t) return null;
  let m = t.match(/(\d{1,2}):(\d{2})\s*([AP])\s*\.?M\.?/i);
  if (m && +m[2] < 60) {
    let h = (+m[1]) % 12;
    if (/p/i.test(m[3])) h += 12;
    return { h: h, mi: +m[2] };
  }
  m = t.match(/(\d{1,2}):(\d{2})/);
  if (m && +m[1] < 24 && +m[2] < 60) return { h: +m[1], mi: +m[2] };
  return null;
}

/* 本地时区 ISO：2026-10-14T22:03:00+08:00 */
function localISO(ms) {
  const d = new Date(ms);
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
    'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) +
    sign + pad2(Math.floor(a / 60)) + ':' + pad2(a % 60);
}

/* 文件名用时间戳：20261014-2200 */
function fileStamp(ms) {
  const d = new Date(ms);
  return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' +
    pad2(d.getHours()) + pad2(d.getMinutes());
}

/* 按文档顺序走一遍节点，给每条消息打时间戳。
 * nodes: [{isDivider, dividerText, skip, key, sender|null, isOwn, text, clockText, fullMs}]
 * state: {curDayMs, sawDivider, lastSender} —— 调用方在多次抓取之间保持传入（从新往旧翻页）。
 * 发送人规则：没名字的续泡继承上一条的发送人；带 own 标记的是本人（标"我"）；
 * 开头就没名字的标"未知"。绝不默认猜"我"。
 * 返回 [{key, sender, text, tsMs, certain}]，certain 表示时间是否来自确切来源。
 */
function walkNodes(nodes, state, nowMs) {
  const out = [];
  const now = nowMs === undefined ? Date.now() : nowMs;
  for (const n of nodes) {
    if (n.isDivider) {
      const d = parseDividerText(n.dividerText, now);
      if (d !== null && d !== undefined) { state.curDayMs = d; state.sawDivider = true; }
      continue;
    }
    if (n.skip || n.key === null || n.key === undefined) continue;
    if (!n.text) continue;
    let sender = n.sender;
    if (n.isOwn) sender = '我';
    else if (!sender) sender = state.lastSender || '未知';
    if (sender !== '未知') state.lastSender = sender;
    let tsMs = null;
    let certain = false;
    if (n.fullMs !== null && n.fullMs !== undefined && !isNaN(n.fullMs)) {
      tsMs = n.fullMs;
      certain = true;
    } else if (state.curDayMs !== null && state.curDayMs !== undefined) {
      const c = parseClockText(n.clockText);
      if (c) {
        tsMs = state.curDayMs + c.h * 3600000 + c.mi * 60000;
        certain = state.sawDivider;
      }
    }
    if (tsMs === null) continue;
    out.push({ key: n.key, sender: sender, text: n.text, tsMs: tsMs, certain: certain });
  }
  return out;
}

/* 合并进 seen（Map）：时间确定的覆盖不确定的 */
function mergeSeen(seen, stamped) {
  for (const m of stamped) {
    const old = seen.get(m.key);
    if (!old || !old.certain || m.certain) seen.set(m.key, m);
  }
  return seen;
}

/* 按时间段过滤并按时间排序 */
function filterByRange(seen, fromMs, toMs) {
  const arr = [];
  seen.forEach(function (m) {
    if (m.tsMs >= fromMs && m.tsMs <= toMs) arr.push(m);
  });
  arr.sort(function (a, b) {
    if (a.tsMs !== b.tsMs) return a.tsMs - b.tsMs;
    return String(a.key) < String(b.key) ? -1 : 1;
  });
  return arr;
}

function minCertainTs(seen) {
  let min = null;
  seen.forEach(function (m) {
    if (m.certain && (min === null || m.tsMs < min)) min = m.tsMs;
  });
  return min;
}

/* ================= 浏览器部分 ================= */

function textOf(el, selector) {
  if (!el || !el.querySelector) return '';
  const f = el.querySelector(selector);
  return f && f.innerText ? f.innerText.trim() : '';
}

/* 把真实 DOM 节点转成 walkNodes 能处理的形状 */
function adaptNode(el, nowMs) {
  const cl = el.classList;
  const has = function (c) { return cl && cl.contains(c); };
  const rawText = (el.innerText || '').trim();

  if (el.__tgexport_divider) return { isDivider: true, dividerText: rawText };
  if (has('is-date')) return { isDivider: true, dividerText: rawText };
  if (has('service')) {
    // 有的版本日期分隔条是 service 样式：能解析出日期就是分隔条，否则跳过
    if (parseDividerText(rawText, nowMs) !== null) return { isDivider: true, dividerText: rawText };
    return { skip: true };
  }

  // —— 普通消息 ——
  let sender = textOf(el, '.message-title, .peer-title, .sender-title');
  if (!sender) {
    const t = el.querySelector('[class*="title"]');
    if (t && t.innerText) sender = t.innerText.trim();
  }
  if (!sender) sender = null; // 分组续泡没名字：由 walkNodes 按上一条继承，不猜"我"

  // 是否本人的消息：自己的气泡通常带 own 标记（启发式，宁可漏判不误判）
  let isOwn = false;
  if (cl) {
    for (let i = 0; i < cl.length; i++) {
      const c = cl[i];
      if (c === 'is-own' || c === 'own' || /(^|-)own(-|$)/i.test(c)) { isOwn = true; break; }
    }
  }

  let text = textOf(el, '.text-content');
  if (!text) text = textOf(el, '.message-content');
  if (!text) {
    const p = el.querySelector('p');
    if (p && p.innerText) text = p.innerText.trim();
  }
  if (!text) {
    if (el.querySelector('video')) text = '[视频]';
    else if (el.querySelector('img')) text = '[图片]';
    else if (el.querySelector('[class*="document" i], [class*="Document"]')) text = '[文件]';
    else if (el.querySelector('[class*="voice" i]')) text = '[语音]';
    else text = '';
  }
  // 去掉气泡末尾自带的时间文字（如 "22:03"）
  text = text.replace(/\s*\d{1,2}:\d{2}(\s*[AP]\s*\.?M\.?)?\s*$/i, '').trim();
  if (!text) return { skip: true };

  let clockText = '';
  let fullMs = null;
  const timeEl = findTimeEl(el);
  if (timeEl) {
    try {
      const dt = timeEl.getAttribute ? (timeEl.getAttribute('datetime') || timeEl.getAttribute('data-datetime')) : null;
      if (dt) { const p = Date.parse(dt); if (!isNaN(p)) fullMs = p; }
      if (fullMs === null) {
        const dts = timeEl.getAttribute ? timeEl.getAttribute('data-timestamp') : null;
        if (dts && /^\d+$/.test(dts)) fullMs = (+dts) * 1000;
      }
      if (fullMs === null && timeEl.title) {
        const p = parseTitleDate(timeEl.title);
        if (p !== null) fullMs = p;
      }
      if (fullMs === null && timeEl.getAttribute) {
        const al = timeEl.getAttribute('aria-label');
        if (al) { const p = parseTitleDate(al); if (p !== null) fullMs = p; }
      }
    } catch (e) { /* 忽略，降级用分隔条+时钟 */ }
    clockText = (timeEl.innerText || '').trim();
  }

  const mid = el.getAttribute ? (el.getAttribute('data-message-id') || el.getAttribute('id')) : null;
  const key = mid ? 'mid_' + mid : ('k_' + (sender || '?') + '_' + text.slice(0, 60) + '_' + clockText);
  return { key: key, sender: sender, isOwn: isOwn, text: text, clockText: clockText, fullMs: fullMs };
}

/* 时间元素的 title 常带完整日期，如 "October 14, 2026 at 22:03" / "2026年10月14日 22:03" */
function parseTitleDate(s) {
  if (!s) return null;
  let t = String(s).trim().replace(/\s+at\s+/i, ' ');
  let p = Date.parse(t);
  if (!isNaN(p)) return p;
  let m = t.match(/(\d{4})年(\d{1,2})月(\d{1,2})日?\s*(\d{1,2}):(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
  return null;
}

/* 优先找自带完整时间的 <time> 元素 */
function findTimeEl(el) {
  if (!el || !el.querySelector) return null;
  return el.querySelector('time[datetime]') || el.querySelector('time[title]') ||
    el.querySelector('time') || el.querySelector('.MessageMeta') ||
    el.querySelector('[class*="MessageMeta"]');
}

/* 找日期分隔条：先试已知选择器，找不到就用文本扫描兜底（不依赖类名）。
 * 找到的节点打上 __tgexport_divider 标记。 */
function findDividerEls(scroller, nowMs) {
  const out = [];
  try {
    const known = scroller.querySelectorAll('.is-date');
    for (let i = 0; i < known.length; i++) out.push(known[i]);
  } catch (e) { /* 忽略 */ }
  if (out.length > 0) return out;
  // 兜底：扫描文本节点，找看起来像日期的短文本，且不在消息气泡内、不是悬浮/吸顶元素
  try {
    const walker = document.createTreeWalker(scroller, NodeFilter.SHOW_TEXT);
    let node;
    let checked = 0;
    while ((node = walker.nextNode()) && checked < 12000 && out.length < 12) {
      checked++;
      const v = node.nodeValue;
      if (!v) continue;
      const t = v.trim();
      if (t.length === 0 || t.length > 24) continue;
      if (parseDividerText(t, nowMs) === null) continue;
      let el = node.parentElement;
      let bad = false;
      let depth = 0;
      while (el && el !== scroller && depth < 6) {
        if (el.classList && el.classList.contains('Message')) { bad = true; break; }
        el = el.parentElement;
        depth++;
      }
      if (bad) continue;
      let target = node.parentElement;
      if (!target) continue;
      try {
        const pos = getComputedStyle(target).position;
        if (pos === 'fixed' || pos === 'sticky') continue;
      } catch (e2) { /* 忽略 */ }
      target.__tgexport_divider = true;
      out.push(target);
    }
  } catch (e) { /* 忽略 */ }
  return out;
}

/* 按文档顺序合并多个节点列表 */
function mergeInDocOrder(lists) {
  const seen = new Set();
  const all = [];
  for (const list of lists) {
    for (let i = 0; i < list.length; i++) {
      const el = list[i];
      if (!seen.has(el)) { seen.add(el); all.push(el); }
    }
  }
  all.sort(function (a, b) {
    try {
      const p = a.compareDocumentPosition(b);
      if (p & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (p & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    } catch (e) { /* 忽略 */ }
    return 0;
  });
  return all;
}

function findScroller() {
  const divs = document.querySelectorAll('div');
  for (let i = 0; i < divs.length; i++) {
    const el = divs[i];
    if (el.classList && el.classList.contains('MessageList') &&
        el.scrollHeight > el.clientHeight + 100) return el;
  }
  // 兜底：找包含消息节点的可滚动容器
  const msg = document.querySelector('.Message');
  let el = msg;
  while (el && el.parentElement) {
    el = el.parentElement;
    if (el.scrollHeight > el.clientHeight + 100) return el;
  }
  return null;
}

function getChatTitle() {
  const sels = ['.ChatInfo .peer-title', '.chat-info .peer-title', '[class*="ChatInfo"] [class*="title"]'];
  for (const s of sels) {
    const el = document.querySelector(s);
    if (el && el.innerText && el.innerText.trim()) return el.innerText.trim().slice(0, 80);
  }
  const t = document.title || '';
  return t.replace(/\s*[-–—]\s*Telegram.*$/i, '').trim().slice(0, 80) || 'telegram-chat';
}

function buildOverlay() {
  const old = document.getElementById('tgexport-overlay');
  if (old) old.remove();
  const box = document.createElement('div');
  box.id = 'tgexport-overlay';
  box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;' +
    'background:#fff;color:#222;border:1px solid #d0d0d0;border-radius:10px;' +
    'padding:12px 16px;font-size:14px;line-height:1.6;box-shadow:0 4px 20px rgba(0,0,0,.18);' +
    'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;max-width:320px;';
  box.innerHTML = '<div style="font-weight:600;margin-bottom:4px;">正在按时间导出聊天记录…</div>' +
    '<div id="tgexport-progress" style="color:#555;">准备中</div>' +
    '<button id="tgexport-cancel" style="margin-top:8px;padding:4px 14px;border:1px solid #ccc;' +
    'border-radius:6px;background:#f5f5f5;cursor:pointer;">取消</button>';
  document.body.appendChild(box);
  return {
    el: box,
    progress: function (t) {
      const p = document.getElementById('tgexport-progress');
      if (p) p.textContent = t;
    },
    done: function (t) {
      box.innerHTML = '<div style="font-weight:600;margin-bottom:4px;">' + t + '</div>' +
        '<button id="tgexport-close" style="margin-top:8px;padding:4px 14px;border:1px solid #ccc;' +
        'border-radius:6px;background:#f5f5f5;cursor:pointer;">关闭</button>';
      const c = document.getElementById('tgexport-close');
      if (c) c.onclick = function () { box.remove(); };
      setTimeout(function () { if (box.parentNode) box.remove(); }, 12000);
    },
    onCancel: function (fn) {
      const b = document.getElementById('tgexport-cancel');
      if (b) b.onclick = fn;
    }
  };
}

function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function runExport(cfg) {
  const fromMs = cfg.fromMs;
  const toMs = cfg.toMs;
  const overlay = buildOverlay();
  let cancelled = false;
  overlay.onCancel(function () { cancelled = true; overlay.progress('正在取消…'); });

  try {
    const scroller = findScroller();
    if (!scroller) {
      overlay.done('没找到消息列表，请先打开一个聊天再导出');
      return;
    }
    // 回到底部，从最新消息开始往上翻
    scroller.scrollTop = scroller.scrollHeight;
    await sleep(1200);

    const seen = new Map();
    const state = { curDayMs: dayStartMs(Date.now()), sawDivider: false, lastSender: null };
    const nowMs = Date.now();
    const STOP_MARGIN = 10 * 60000;
    const MAX_MSGS = 50000;
    let stuck = 0, lastCount = 0, rounds = 0;

    while (!cancelled) {
      rounds++;
      // 消息气泡 + 日期分隔条，按文档顺序合并后统一走一遍
      const msgEls = scroller.querySelectorAll('.Message');
      const divEls = findDividerEls(scroller, nowMs);
      const ordered = mergeInDocOrder([msgEls, divEls]);
      const nodes = [];
      for (const el of ordered) {
        try { const n = adaptNode(el, nowMs); if (n) nodes.push(n); } catch (e) { /* 单条解析失败就跳过 */ }
      }
      mergeSeen(seen, walkNodes(nodes, state, nowMs));

      const minC = minCertainTs(seen);
      let prog = '已收集 ' + seen.size + ' 条' +
        (minC !== null ? '（已翻到 ' + localISO(minC).slice(0, 16).replace('T', ' ') + '）' : '');
      if (!state.sawDivider && rounds > 40) {
        prog += '（暂未识别到日期分隔条，仍在尝试；如长时间无进展可点取消）';
      }
      overlay.progress(prog);

      // 停止条件1：已经翻到比开始时间还早的消息（再往上只会更早）
      if (minC !== null && minC < fromMs - STOP_MARGIN) break;
      // 停止条件2：消息数保护
      if (seen.size >= MAX_MSGS) break;
      // 停止条件3：轮数保护
      if (rounds > 3000) break;

      const before = scroller.scrollTop;
      scroller.scrollTop = before - Math.floor(scroller.clientHeight * 0.8);
      await sleep(900);

      if (scroller.scrollTop <= 0) {
        if (seen.size === lastCount) { stuck++; if (stuck >= 3) break; }
        else { stuck = 0; lastCount = seen.size; }
      } else if (scroller.scrollTop === before) {
        stuck++;
        if (stuck >= 8) break;
      } else {
        stuck = 0;
      }
    }

    if (cancelled) {
      overlay.done('已取消');
      return;
    }

    const list = filterByRange(seen, fromMs, toMs);
    const uncertain = list.filter(function (m) { return !m.certain; }).length;
    const data = {
      app: 'Telegram 按时间段导出 v1.2.0',
      chat: getChatTitle(),
      range: { from: localISO(fromMs), to: localISO(toMs) },
      exported_at: localISO(Date.now()),
      count: list.length,
      uncertain_count: uncertain,
      messages: list.map(function (m, i) {
        const o = { n: i + 1, time: localISO(m.tsMs), sender: m.sender, text: m.text };
        if (!m.certain) o.uncertain_time = true;
        return o;
      })
    };
    const fname = 'telegram-' + fileStamp(fromMs) + '-' + fileStamp(toMs).slice(9) + '.json';
    downloadJSON(data, fname);
    overlay.done('导出完成：' + list.length + ' 条' +
      (uncertain ? '（其中 ' + uncertain + ' 条时间不确定）' : '') + '，文件已开始下载');
  } catch (e) {
    overlay.done('导出出错：' + (e && e.message ? e.message : e));
  } finally {
    if (typeof window !== 'undefined') window.__tgexport_running = false;
  }
}

/* ================= 入口 ================= */

if (typeof module !== 'undefined' && module.exports) {
  // Node：导出纯逻辑做单元测试
  module.exports = {
    pad2: pad2,
    dayStartMs: dayStartMs,
    parseDividerText: parseDividerText,
    parseClockText: parseClockText,
    localISO: localISO,
    fileStamp: fileStamp,
    walkNodes: walkNodes,
    mergeSeen: mergeSeen,
    filterByRange: filterByRange,
    minCertainTs: minCertainTs,
    parseTitleDate: parseTitleDate
  };
} else if (typeof window !== 'undefined' && window.__tgexport_cfg && !window.__tgexport_running) {
  window.__tgexport_running = true;
  runExport(window.__tgexport_cfg).catch(function (e) {
    window.__tgexport_running = false;
  });
}

})();
