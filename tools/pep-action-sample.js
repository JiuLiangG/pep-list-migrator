(function () {
  if (window.__pepSample) {
    console.log("[pep-sample] 已在运行。输入 __pepSample.help() 查看用法。");
    return;
  }

  var VERSION = "1";
  var orig = window.fetch;
  var names = new Map();
  var scanned = new Set();
  var calls = [];
  var contexts = new Map();
  var KEYWORDS = ["isDefault", "containsDocument", "listId", "readingList", "reading_list"];
  var ID_RE = /[A-Z][A-Z0-9]*\.\d{3}[A-Z]?\.[0-9A-Z]+/;

  function domChunks() {
    var set = new Set();
    document.querySelectorAll("script[src], link[href]").forEach(function (node) {
      var src = (node.src || node.href || "").split("?")[0];
      if (src) set.add(src);
    });
    return set;
  }

  function absorb(text, url) {
    var re = /createServerReference\)\("([0-9a-f]{42})",[^)]{0,220},"([A-Za-z0-9_]+)"\)/g;
    var match;
    var inDom = domChunks().has(url);
    while ((match = re.exec(text))) {
      if (names.has(match[1])) continue;
      names.set(match[1], { name: match[2], chunk: url.split("/").pop(), inDom: inDom });
    }
  }

  function scan(url) {
    var clean = url.split("?")[0];
    if (scanned.has(clean)) return;
    scanned.add(clean);
    orig(url, { credentials: "same-origin" }).then(function (res) {
      return res.text();
    }).then(function (text) {
      absorb(text, clean);
    }).catch(function () {});
  }

  function pull() {
    performance.getEntriesByType("resource").forEach(function (entry) {
      if (entry.name.indexOf("/_next/static/") !== -1 && /\.js(\?|$)/.test(entry.name)) scan(entry.name);
    });
  }

  new PerformanceObserver(pull).observe({ type: "resource", buffered: true });
  pull();

  function headersOf(input, init) {
    var out = {};
    try {
      if (input && typeof input !== "string" && input.headers) {
        new Headers(input.headers).forEach(function (v, k) { out[k] = v; });
      }
      if (init && init.headers) {
        new Headers(init.headers).forEach(function (v, k) { out[k] = v; });
      }
    } catch (error) {}
    return out;
  }

  function publicHeaders(headers) {
    var out = {};
    Object.keys(headers).forEach(function (k) {
      if (/cookie|authorization/i.test(k)) out[k] = "redacted";
      else if (k === "next-router-state-tree") out[k] = "len:" + headers[k].length;
      else out[k] = headers[k];
    });
    return out;
  }

  function bodyOf(input, init) {
    var body = init && init.body;
    if (body == null) return { kind: "none" };
    if (typeof body === "string") return { kind: "string", text: body };
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      var entries = [];
      body.forEach(function (value, key) {
        entries.push([key, typeof value === "string" ? value : { file: value.name, size: value.size, type: value.type }]);
      });
      return { kind: "formdata", entries: entries };
    }
    if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
      return { kind: "urlsearchparams", text: body.toString() };
    }
    return { kind: Object.prototype.toString.call(body) };
  }

  function absUrl(input) {
    var raw = typeof input === "string" ? input : (input && input.url) || "";
    try {
      return new URL(raw || location.href, location.href).href;
    } catch (error) {
      return location.href;
    }
  }

  function nameOf(id) {
    var info = names.get(id);
    return info ? info.name : "unknown:" + id.slice(0, 8);
  }

  function responseHeaders(res) {
    var out = {};
    res.headers.forEach(function (v, k) {
      if (/^x-action|^x-nextjs|^content-type$|^location$/i.test(k)) out[k] = v;
    });
    return out;
  }

  function record(entry, promise) {
    calls.push(entry);
    return promise.then(function (res) {
      return res.clone().text().then(function (text) {
        entry.response = {
          status: res.status,
          redirected: res.redirected,
          headers: responseHeaders(res),
          bytes: text.length,
          text: text
        };
        console.log("[pep-sample] #" + entry.n, entry.action || entry.kind, res.status, text.length + " 字节");
        return res;
      });
    }).catch(function (error) {
      entry.response = { error: String(error).slice(0, 300) };
      throw error;
    });
  }

  window.fetch = function (input, init) {
    var headers = headersOf(input, init);
    var actionId = headers["next-action"];
    var url = absUrl(input);
    var promise = orig.apply(this, arguments);
    if (actionId) {
      var action = nameOf(actionId);
      contexts.set(action, { url: url, headers: headers, actionId: actionId });
      var entry = {
        n: calls.length + 1,
        at: new Date().toISOString(),
        source: "page",
        kind: "action",
        action: action,
        actionId: actionId,
        method: ((init && init.method) || "GET").toUpperCase(),
        path: url.replace(location.origin, ""),
        request: { headers: publicHeaders(headers), body: bodyOf(input, init) },
        response: null
      };
      record(entry, promise.then(function (res) { return res; })).catch(function () {});
      return promise;
    }
    promise.then(function (res) {
      return res.clone().text().then(function (text) {
        var hits = KEYWORDS.filter(function (k) { return text.indexOf(k) !== -1; });
        if (!hits.length) return;
        calls.push({
          n: calls.length + 1,
          at: new Date().toISOString(),
          source: "page",
          kind: headers.rsc === "1" ? "rsc" : "fetch",
          path: url.replace(location.origin, ""),
          keywords: hits,
          request: { headers: publicHeaders(headers), body: bodyOf(input, init) },
          response: { status: res.status, headers: responseHeaders(res), bytes: text.length, text: text }
        });
        console.log("[pep-sample] #" + calls.length, "含书单关键词的普通请求", url.replace(location.origin, ""), hits);
      });
    }).catch(function () {});
    return promise;
  };

  function actionInfo(id) {
    var head = parseInt(id.slice(0, 2), 16);
    var mask = (head >> 1) & 63;
    var used = [];
    for (var i = 0; i < 6; i++) used.push(((mask >> (5 - i)) & 1) === 1);
    return { type: (head >> 7) === 1 ? "use-cache" : "server-action", used: used, rest: (head & 1) === 1 };
  }

  function omitArgs(args, info) {
    var kept = new Array(args.length);
    var length = 0;
    for (var i = 0; i < args.length; i++) {
      if ((i < 6 && info.used[i]) || (i >= 6 && info.rest)) {
        kept[i] = args[i];
        length = i + 1;
      }
    }
    kept.length = length;
    return kept;
  }

  function idFromPage() {
    var real = calls.filter(function (c) { return c.action === "getArticleLists" && c.source === "page"; })[0];
    var text = real && real.request.body && (real.request.body.text || JSON.stringify(real.request.body.entries || ""));
    var hit = text && ID_RE.exec(text);
    if (hit) return hit[0];
    hit = ID_RE.exec(decodeURIComponent(location.pathname));
    return hit ? hit[0] : "";
  }

  function replay(actionName, args, label) {
    var ctx = contexts.get(actionName);
    if (!ctx) {
      console.warn("[pep-sample] 还没截到网站自己调用 " + actionName + "。先在页面上手动操作一次。");
      return Promise.resolve(null);
    }
    var info = actionInfo(ctx.actionId);
    var body = JSON.stringify(omitArgs(args, info));
    var entry = {
      n: calls.length + 1,
      at: new Date().toISOString(),
      source: label || "replay",
      kind: "action",
      action: actionName,
      actionId: ctx.actionId,
      actionInfo: info,
      method: "POST",
      path: ctx.url.replace(location.origin, ""),
      request: { headers: publicHeaders(ctx.headers), body: { kind: "string", text: body } },
      response: null
    };
    return record(entry, orig(ctx.url, {
      method: "POST",
      headers: ctx.headers,
      body: body,
      credentials: "same-origin",
      cache: "no-store"
    })).then(function () { return entry; });
  }

  function summary() {
    console.table(calls.map(function (c) {
      return {
        n: c.n,
        source: c.source,
        kind: c.kind,
        action: c.action || "",
        path: c.path,
        body: c.request && c.request.body ? (c.request.body.text || c.request.body.kind).slice(0, 80) : "",
        status: c.response ? c.response.status : "pending",
        bytes: c.response ? c.response.bytes : ""
      };
    }));
  }

  function actionList() {
    var out = [];
    names.forEach(function (info, id) {
      out.push({ name: info.name, id: id, info: actionInfo(id), chunk: info.chunk, inDom: info.inDom });
    });
    return out;
  }

  function download() {
    var data = {
      probe: "pep-action-sample",
      version: VERSION,
      capturedAt: new Date().toISOString(),
      page: location.pathname,
      pageDocumentId: idFromPage(),
      actions: actionList(),
      calls: calls
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "pep-action-sample-" + Date.now() + ".json";
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    console.log("[pep-sample] 已下载，共 " + calls.length + " 条记录。");
  }

  window.__pepSample = {
    calls: calls,
    actions: actionList,
    summary: summary,
    download: download,
    replay: replay,
    asPlugin: function (documentId) {
      var id = documentId || idFromPage();
      if (!id) {
        console.warn("[pep-sample] 找不到文献 ID，请手动传入：__pepSample.asPlugin(\"IJP.081.0001A\")");
        return Promise.resolve(null);
      }
      console.log("[pep-sample] 用插件的参数形状重放 getArticleLists：", { documentId: id });
      return replay("getArticleLists", [{ documentId: id }], "plugin-shape");
    },
    help: function () {
      console.log([
        "1. 在当前文献页手动点保存/书签按钮，打开书单面板（等它加载出书单）。",
        "2. __pepSample.summary()      查看截到了什么",
        "3. __pepSample.asPlugin()     按插件的方式重放一次 getArticleLists 做对照",
        "4. __pepSample.download()     下载 JSON 样本"
      ].join("\n"));
    }
  };

  console.log("[pep-sample] 探针已启动。");
  window.__pepSample.help();
})();
