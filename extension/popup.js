/* popup：读用户输入的时间段，注入 extractor.js 开始导出 */
(function () {
'use strict';

function $(id) { return document.getElementById(id); }

function pad(n) { return (n < 10 ? '0' : '') + n; }

function toLocalInput(ms) {
  const d = new Date(ms);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

(function init() {
  const now = Date.now();
  const s = new Date(now);
  s.setHours(0, 0, 0, 0);
  $('from').value = toLocalInput(s.getTime());
  $('to').value = toLocalInput(now);
})();

$('go').onclick = function () {
  const st = $('status');
  st.textContent = '';
  (async function () {
    try {
      const f = new Date($('from').value).getTime();
      const t = new Date($('to').value).getTime();
      if (isNaN(f) || isNaN(t)) { st.textContent = '请先选择开始和结束时间'; return; }
      if (f >= t) { st.textContent = '开始时间要早于结束时间'; return; }
      if (f > Date.now()) { st.textContent = '开始时间不能是未来时间'; return; }

      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs && tabs[0];
      if (!tab || !tab.url || tab.url.indexOf('web.telegram.org') < 0) {
        st.textContent = '请先在当前标签页打开 Telegram 网页版 (web.telegram.org)，并进入要导出的聊天';
        return;
      }
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: function (a, b) { window.__tgexport_cfg = { fromMs: a, toMs: b }; },
        args: [f, t]
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['extractor.js']
      });
      st.textContent = '已开始导出，请看网页右下角的进度。导出时不要切换聊天或关闭页面。';
    } catch (e) {
      st.textContent = '启动失败：' + (e && e.message ? e.message : e);
    }
  })();
};

})();
