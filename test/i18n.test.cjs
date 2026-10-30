// 界面文字：中英两套词条一一对应、占位符一致；代码里用到的错误代码都有文字。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");

function load(lang) {
  const store = lang ? { pepLang: lang } : {};
  const context = { localStorage: { getItem: (k) => store[k] || null, setItem() {} } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "i18n.js"), "utf8") + "\nthis.I18N = I18N; this.t = t; this.LANG = LANG;", context);
  return context;
}

const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort().join(" ");

test("i18n：中英词条一一对应，占位符一致", () => {
  const { I18N } = load();
  assert.deepEqual(Object.keys(I18N.en).sort(), Object.keys(I18N.zh).sort());
  for (const key of Object.keys(I18N.zh)) {
    assert.equal(placeholders(I18N.en[key]), placeholders(I18N.zh[key]), key);
  }
});

test("i18n：background / bridge / relay / import-model 给出的错误代码都有文字", () => {
  const { I18N } = load();
  const codes = new Set();
  for (const file of ["background.js", "bridge.js", "relay.js", "import-model.js"]) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    for (const m of source.matchAll(/codedError\("([\w-]+)"|code: "([\w-]+)"/g)) codes.add(m[1] || m[2]);
  }
  assert.ok(codes.size > 20);
  for (const code of codes) assert.ok(I18N.zh["err." + code], code);
});

test("i18n：popup.js 和 popup.html 用到的词条都存在", () => {
  const { I18N } = load();
  const js = fs.readFileSync(path.join(root, "popup.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "popup.html"), "utf8");
  const keys = new Set();
  for (const m of js.matchAll(/\bt\("([\w.-]+)"/g)) keys.add(m[1]);
  for (const m of js.matchAll(/"((?:err|progress|reason|result|export)\.[\w-]+)"/g)) keys.add(m[1]);
  for (const m of html.matchAll(/data-i18n(?:-aria)?="([\w.-]+)"/g)) keys.add(m[1]);
  for (const kind of ["done", "present", "pending", "failed"]) keys.add("mark." + kind);
  for (const key of keys) if (!key.endsWith(".")) assert.ok(I18N.zh[key], key);
});

test("i18n：书单名中文用「」，英文用斜体标记；记住的选择优先", () => {
  assert.equal(load("zh").t("result.written", { n: 3, list: "Reading list" }), "已导入 3 篇至「Reading list」");
  assert.equal(load("en").t("result.written", { n: 3, list: "Reading list" }), "Imported 3 to \uE000Reading list\uE001");
  assert.equal(load("en").t("lists.default", { name: "Reading list" }), "Reading list (default)");
  assert.equal(load("en").LANG, "en");
});
