// 运行：node --test test/
// 在 vm 里加载 bridge.js，用假的 fetch 模拟新版 / 旧版的分流。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "bridge.js"), "utf8");
const ACTION_ID = "40" + "a".repeat(40);
const CHUNK = "https://pep-web.org/_next/static/chunks/test.js";
const BATCH_CHUNK = "https://pep-web.org/_next/static/chunks/batch.js";
const BATCH_ID = "40" + "b".repeat(40);
const PAGE = "https://pep-web.org/content/PAQ.062.0346C";
const LEGACY_HTML = "<!DOCTYPE html>\n<html><head><meta name=\"pep/config/environment\" content=\"x\"></head></html>";
const NEXT_HTML = "<!DOCTYPE html><html><head><script src=\"/_next/static/chunks/test.js\"></script></head></html>";
const FLIGHT = "0:{\"a\":\"$@1\",\"q\":\"\",\"i\":false}\n1:[{\"id\":1002,\"name\":\"test\",\"isDefault\":0,\"containsDocument\":false}]\n";

function reply(status, body, type) {
  return Promise.resolve({
    status: status,
    ok: status >= 200 && status < 300,
    headers: { get: (k) => (k.toLowerCase() === "content-type" ? type : null) },
    text: () => Promise.resolve(body)
  });
}

// posts / gets：按顺序给出每次 POST / 页面 GET 的返回
function loadBridge(posts, gets, pathname, domChunks) {
  const where = pathname || "/content/PAQ.062.0346C";
  const chunkNodes = domChunks === undefined ? [{ src: CHUNK }] : domChunks;
  const calls = [];
  const posted = [];
  const listeners = [];
  const results = [];
  const ctx = {
    location: { href: "https://pep-web.org" + where, origin: "https://pep-web.org", pathname: where },
    document: {
      querySelectorAll: () => chunkNodes,
      querySelector: () => chunkNodes[0] || null
    },
    Headers: class { constructor() {} get() { return null; } },
    MouseEvent: class {},
    setTimeout: setTimeout,
    Promise: Promise,
    console: console
  };
  ctx.window = ctx;
  ctx.encodeURIComponent = encodeURIComponent;
  ctx.addEventListener = (type, fn) => listeners.push(fn);
  ctx.postMessage = (msg) => results.push(msg);
  ctx.fetch = (url, init) => {
    const method = (init && init.method) || "GET";
    calls.push(method + " " + url);
    if (method === "POST") posted.push(init.headers);
    if (url === BATCH_CHUNK) {
      return reply(200, "(0,t.createServerReference)(\"" + BATCH_ID + "\",t.callServer,void 0,t.findSourceMapURL,\"toggleArticlesInList\")", "application/javascript");
    }
    if (url === CHUNK) {
      return reply(200, "(0,t.createServerReference)(\"" + ACTION_ID + "\",t.callServer,void 0,t.findSourceMapURL,\"getArticleLists\")", "application/javascript");
    }
    if (method === "POST") return posts.shift()();
    return gets.shift()();
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  // 让 bridge 截到路由树
  ctx.encodeURIComponent("[\"\",{\"children\":[\"__PAGE__\",{}]}]");

  let nextRequestId = 100;
  function send(op, arg) {
    const requestId = nextRequestId++;
    // vm 里 bridge 看到的 window 是上下文的全局代理，不是外面的 ctx 对象
    const win = vm.runInContext("window", ctx);
    listeners.forEach((fn) => fn({ source: win, origin: "https://pep-web.org", data: { source: "pep-relay", op: op, requestId: requestId, arg: arg } }));
    return new Promise((resolve) => {
      const started = Date.now();
      const timer = setInterval(() => {
        const hit = results.find((r) => r.requestId === requestId);
        if (hit) { clearInterval(timer); resolve(JSON.parse(JSON.stringify(hit.result))); }
        else if (Date.now() - started > 2000) { clearInterval(timer); resolve({ ok: null, error: "bridge 没有回复" }); }
      }, 5);
    });
  }
  function call(name, argument) {
    return send("call", { name, argument });
  }
  return { call, send, calls, ctx, posted, results };
}

test("bridge：被分到旧版时，重新打开一次页面后自动重发", async () => {
  const b = loadBridge(
    [() => reply(200, LEGACY_HTML, "text/html; charset=utf-8"), () => reply(200, FLIGHT, "text/x-component")],
    [() => reply(200, NEXT_HTML, "text/html; charset=utf-8")]
  );
  const result = await b.call("getArticleLists", { documentId: "PAQ.062.0346C" });
  assert.equal(result.ok, true);
  assert.equal(result.retried, true);
  assert.equal(result.body, FLIGHT);
  assert.deepEqual(b.calls.filter((c) => !c.endsWith("test.js")), ["POST " + PAGE, "GET " + PAGE, "POST " + PAGE]);
  assert.equal(b.ctx.__pepBridgeLast.kind, "ok");
});

test("bridge：重新分配后仍是旧版，提示切回新版，不再重发", async () => {
  const b = loadBridge(
    [() => reply(200, LEGACY_HTML, "text/html; charset=utf-8")],
    [() => reply(200, LEGACY_HTML, "text/html; charset=utf-8")]
  );
  const result = await b.call("getArticleLists", { documentId: "PAQ.062.0346C" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "legacy-send");
  assert.equal(b.calls.filter((c) => c.startsWith("POST")).length, 1);
});

test("bridge：文献页上 409 Server Action unavailable，提示刷新文献页", async () => {
  const b = loadBridge([() => reply(409, "Server Action unavailable.", "text/plain")], []);
  const result = await b.call("getArticleLists", { documentId: "PAQ.062.0346C" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "stale");
});

test("bridge：书单页上，从文献页代码取操作编号，请求发到文献页地址且不带路由树", async () => {
  const docHtml = "<!DOCTYPE html><html data-dpl-id=\"d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0\"><head><script src=\"/_next/static/chunks/test.js\"></script></head></html>";
  const b = loadBridge([() => reply(200, FLIGHT, "text/x-component")], [() => reply(200, docHtml, "text/html; charset=utf-8")], "/my-research/lists", []);
  const result = await b.call("getArticleLists", { documentId: "PAQ.062.0346C" });
  assert.equal(result.ok, true);
  assert.deepEqual(b.calls, [
    "GET https://pep-web.org/content/PAQ.062.0346C",
    "GET " + CHUNK,
    "POST https://pep-web.org/content/PAQ.062.0346C"
  ]);
  assert.equal(b.posted[0]["next-action"], ACTION_ID);
  assert.equal(b.posted[0]["next-router-state-tree"], undefined);
  assert.equal(b.posted[0]["x-deployment-id"], "d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0");
});

test("bridge：正常返回不多发请求", async () => {
  const b = loadBridge([() => reply(200, FLIGHT, "text/x-component")], []);
  const result = await b.call("getArticleLists", { documentId: "PAQ.062.0346C" });
  assert.equal(result.ok, true);
  assert.equal(result.retried, false);
  assert.equal(b.calls.filter((c) => !c.endsWith("test.js")).length, 1);
});

test("bridge：批量写入在文献页上也发到 /search?q=，从搜索页代码取操作编号，不带路由树", async () => {
  const searchHtml = "<!DOCTYPE html><html data-dpl-id=\"d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0\"><head><script src=\"/_next/static/chunks/batch.js\"></script></head></html>";
  const b = loadBridge([() => reply(200, "0:{\"a\":\"$@1\"}\n1:{\"success\":true}\n", "text/x-component")], [() => reply(200, searchHtml, "text/html; charset=utf-8")]);
  const result = await b.call("toggleArticlesInList", { documentIds: ["IJP.040.0308A", "PAQ.062.0346C"], listId: 1002, shouldContain: true });
  assert.equal(result.ok, true);
  assert.deepEqual(b.calls.filter((c) => !c.endsWith("test.js")), [
    "GET https://pep-web.org/search?q=IJP.040.0308A",
    "GET " + BATCH_CHUNK,
    "POST https://pep-web.org/search?q=IJP.040.0308A"
  ]);
  assert.equal(b.posted[0]["next-action"], BATCH_ID);
  assert.equal(b.posted[0]["next-router-state-tree"], undefined);
});

function members(b, listId) {
  return b.send("members", { listId: listId });
}

const LIST_PAGE = "https://pep-web.org/my-research/lists/1002?page=1";
const listHtml = (ids, count) => "<html><script src=\"/_next/static/chunks/x.js\"></script>"
  + (count == null ? "" : "\"itemCount\":" + count)
  + ids.map((id) => "{\"documentId\":\"" + id + "\",\"citationMeta\":{}}").join("") + "</html>";

test("bridge：书单页被分到旧版时，重新分配后再读", async () => {
  const b = loadBridge([], [
    () => reply(200, LEGACY_HTML, "text/html"),
    () => reply(200, NEXT_HTML, "text/html"),
    () => reply(200, listHtml(["IJP.040.0308A"], 1), "text/html")
  ]);
  const result = await members(b, 1002);
  assert.equal(result.ok, true);
  assert.equal(result.complete, true);
  assert.deepEqual(result.documentIds, ["IJP.040.0308A"]);
  assert.deepEqual(b.calls, ["GET " + LIST_PAGE, "GET " + PAGE, "GET " + LIST_PAGE]);
});

test("bridge：书单页一直是旧版时报错，不当成空书单", async () => {
  const b = loadBridge([], [
    () => reply(200, LEGACY_HTML, "text/html"),
    () => reply(200, LEGACY_HTML, "text/html")
  ]);
  const result = await members(b, 1002);
  assert.equal(result.ok, false);
  assert.equal(result.code, "legacy-list");
});

test("bridge：新版书单页没有 itemCount 也没有文献时算空书单（实测空书单页面就是这样）", async () => {
  const b = loadBridge([], [() => reply(200, "<html><script src=\"/_next/static/chunks/x.js\"></script></html>", "text/html")]);
  const result = await members(b, 1002);
  assert.equal(result.ok, true);
  assert.equal(result.complete, true);
  assert.deepEqual(result.documentIds, []);
});

test("bridge：书单页不是新版页面时报错", async () => {
  const b = loadBridge([], [() => reply(200, "<html>Sign in</html>", "text/html")]);
  const result = await members(b, 1002);
  assert.equal(result.ok, false);
  assert.equal(result.code, "list-not-next");
  assert.equal(result.status, 200);
});

test("bridge：书单页 itemCount 为 0 时算读全的空书单", async () => {
  const b = loadBridge([], [() => reply(200, listHtml([], 0), "text/html")]);
  const result = await members(b, 1002);
  assert.equal(result.ok, true);
  assert.equal(result.complete, true);
  assert.deepEqual(result.documentIds, []);
});


test("bridge：书单多页时逐页报告进度，最后一页不报", async () => {
  // 每条之间垫 200 个字符，免得在 citationMeta 前后 180 个字符里认到上一条的编号
  const spaced = (ids, count) => "<html><script src=\"/_next/static/chunks/x.js\"></script>\"itemCount\":" + count
    + ids.map((id) => "x".repeat(200) + "{\"documentId\":\"" + id + "\",\"citationMeta\":{}}").join("") + "</html>";
  const b = loadBridge([], [
    () => reply(200, spaced(["IJP.040.0308A", "PAQ.062.0346C"], 5), "text/html"),
    () => reply(200, spaced(["IJP.027.0099A", "PAQ.073.0005A"], 5), "text/html"),
    () => reply(200, spaced(["IJP.075.0003A"], 5), "text/html")
  ]);
  const result = await b.send("members", { listId: 1002, token: 5 });
  assert.equal(result.ok, true);
  assert.equal(result.complete, true);
  assert.equal(result.documentIds.length, 5);
  const progress = b.results.filter((m) => m.source === "pep-bridge-progress").map((m) => [m.token, m.done, m.total]);
  assert.deepEqual(JSON.parse(JSON.stringify(progress)), [[5, 1, 3], [5, 2, 3]]);
});
