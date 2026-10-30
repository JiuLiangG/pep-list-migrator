// 切换网站版本时的地址换算（background.js 的 siteUrl）。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadBackground() {
  const noop = () => {};
  const events = { addListener: noop };
  const chrome = {
    runtime: { getURL: (x) => x, onMessage: events, onInstalled: events, onStartup: events },
    action: { onClicked: events },
    windows: { onRemoved: events },
    tabs: { onRemoved: events },
    storage: { local: {} }
  };
  const context = { chrome, URL, console, setTimeout };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "background.js"), "utf8"), context);
  return context;
}

const { siteUrl } = loadBackground();

test("新版文献页切到旧版时换成旧版文献地址，带语言段也认", () => {
  assert.equal(siteUrl("https://pep-web.org/content/IJP.040.0308A", "legacy"), "https://pep-web.org/search/document/IJP.040.0308A");
  assert.equal(siteUrl("https://pep-web.org/en/content/IJP.040.0308A", "legacy"), "https://pep-web.org/search/document/IJP.040.0308A");
});

test("新版书单页在旧版没有对应页面，切到旧版时换成首页", () => {
  assert.equal(siteUrl("https://pep-web.org/my-research/lists/1001?page=1", "legacy"), "https://pep-web.org/");
});

test("旧版文献页切到新版时换成新版文献地址", () => {
  assert.equal(siteUrl("https://pep-web.org/search/document/IJP.040.0308A", "policy-next"), "https://pep-web.org/content/IJP.040.0308A");
  assert.equal(siteUrl("https://pep-web.org/browse/document/PAQ.012.0288B", "policy-next"), "https://pep-web.org/content/PAQ.012.0288B");
});

test("其他页面原地址不变", () => {
  assert.equal(siteUrl("https://pep-web.org/search?q=freud", "policy-next"), "https://pep-web.org/search?q=freud");
  assert.equal(siteUrl("https://pep-web.org/", "legacy"), "https://pep-web.org/");
});
