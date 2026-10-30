// 运行：node --test test/
// 用 .cjs + vm 加载插件代码：上层目录的 package.json 即使声明了 "type": "module"，也不影响测试。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "import-model.js"), "utf8") + "\nthis.PepImport = PepImport;", context);
const PepImport = context.PepImport;

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("getArticleLists：读出书单，isDefault 的 1/0 被识别为默认书单", () => {
  const result = plain(PepImport.readActionBody(fixture("get-article-lists.flight.txt"), "getArticleLists"));
  assert.equal(result.success, true);
  assert.deepEqual(result.lists, [
    { id: 1001, name: "Reading list", isDefault: true, containsDocument: true },
    { id: 1002, name: "test", isDefault: false, containsDocument: false }
  ]);
});

test("getArticleLists：新版不认识的 documentId 返回空书单，而不是 null", () => {
  const result = plain(PepImport.readActionBody(fixture("get-article-lists-empty.flight.txt"), "getArticleLists"));
  assert.deepEqual(result, { success: true, lists: [] });
});

test("getArticleLists：无法识别的返回给出 null", () => {
  assert.equal(PepImport.readActionBody("<html>PEP | 404</html>", "getArticleLists"), null);
});

test("parseFile：只认本扩展导出的文件，并去重", () => {
  const text = JSON.stringify({
    source: "pep-web",
    favorites: [
      { documentId: "RPP-CS.022.0024A", title: "A", author: "X", year: 2000 },
      { documentId: "RPP-CS.022.0024A", title: "A again" }
    ]
  });
  const parsed = plain(PepImport.parseFile(text));
  assert.equal(parsed.readLater, null);
  assert.deepEqual(parsed.favorites, [{ documentId: "RPP-CS.022.0024A", title: "A", author: "X", year: "2000" }]);
  assert.throws(() => PepImport.parseFile("{\"source\":\"other\"}"), { code: "not-ours" });
  assert.throws(() => PepImport.parseFile("not json"), { code: "not-json" });
});

test("mergeRows：多来源合并去重，并补全缺失字段", () => {
  const merged = plain(PepImport.mergeRows([
    [{ documentId: "IJP.040.0308A", title: "", author: "", year: "" }],
    [{ documentId: "IJP.040.0308A", title: "T", author: "Au", year: "1959" }, { documentId: "PAQ.062.0346C", title: "P", author: "", year: "" }]
  ]));
  assert.deepEqual(merged, [
    { documentId: "IJP.040.0308A", title: "T", author: "Au", year: "1959" },
    { documentId: "PAQ.062.0346C", title: "P", author: "", year: "" }
  ]);
});

test("bridge.js 的文献 ID 正则：支持带连字符的刊名", () => {
  const source = fs.readFileSync(path.join(root, "bridge.js"), "utf8");
  const match = /var id = \/(.+)\/\.exec\(slice\);/.exec(source);
  assert.ok(match, "bridge.js 里没找到文献 ID 正则");
  const re = new RegExp(match[1]);
  assert.equal(re.exec("x RPP-CS.022.0024A y")[1], "RPP-CS.022.0024A");
  assert.equal(re.exec("search-result-IJP.040.0308A")[1], "IJP.040.0308A");
  assert.equal(re.exec("\"PAQ.062.0346C\"")[1], "PAQ.062.0346C");
});

test("getArticleLists：没有书单但返回了需要登录 / 错误码时，原样交给 popup", () => {
  const body = '0:{"a":"$@1","q":"","i":false}\n1:{"success":false,"errorCode":"UNAUTHORIZED","authRequired":true}\n';
  const result = plain(PepImport.readActionBody(body, "getArticleLists"));
  assert.deepEqual(result, { success: false, errorCode: "UNAUTHORIZED", authRequired: true });
});
