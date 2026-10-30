(function () {
  if (window.__pepBridgeInstalled) return;
  window.__pepBridgeInstalled = true;

  var state = { tree: "", deploymentId: "" };
  var originalFetch = window.fetch;
  var originalEncode = window.encodeURIComponent;
  var actionsPromise = null;

  window.encodeURIComponent = function (value) {
    var encoded = originalEncode.apply(this, arguments);
    if (typeof value === "string" && value.charAt(0) === "[" && value.indexOf("__PAGE__") !== -1) {
      state.tree = encoded;
    }
    return encoded;
  };

  window.fetch = function (input, init) {
    rememberRequest(input, init);
    return originalFetch.apply(this, arguments);
  };

  function rememberRequest(input, init) {
    var tree = headerValue(input, init, "next-router-state-tree");
    if (tree) state.tree = tree;
    var deploymentId = headerValue(input, init, "x-deployment-id");
    if (deploymentId) state.deploymentId = deploymentId;
  }

  function headerValue(input, init, name) {
    try {
      if (init && init.headers) {
        var fromInit = new Headers(init.headers).get(name);
        if (fromInit) return fromInit;
      }
      if (typeof Request !== "undefined" && input instanceof Request) return input.headers.get(name) || "";
    } catch (error) {}
    return "";
  }

  function chunkUrls() {
    var seen = {};
    var nodes = document.querySelectorAll("script[src], link[href]");
    Array.prototype.forEach.call(nodes, function (node) {
      var src = node.src || node.href || "";
      if (src.indexOf("/_next/static/chunks/") === -1 || src.indexOf(".js") === -1) return;
      seen[src] = true;
    });
    return Object.keys(seen);
  }

  function loadActions() {
    return scanChunks(chunkUrls());
  }

  function scanChunks(urls) {
    var actions = {};
    var pattern = /createServerReference\)\("([0-9a-f]{42})",[^)]{0,220},"([A-Za-z0-9_]+)"\)/g;
    return Promise.all(urls.map(function (url) {
      return originalFetch(url, { credentials: "same-origin" }).then(function (response) {
        if (!response.ok) return "";
        return response.text();
      }).then(function (text) {
        if (!text) return;
        pattern.lastIndex = 0;
        var match;
        while ((match = pattern.exec(text))) actions[match[2]] = match[1];
      }).catch(function () {});
    })).then(function () {
      return actions;
    });
  }

  function ensureActions() {
    if (!actionsPromise) {
      actionsPromise = loadActions().catch(function (error) {
        actionsPromise = null;
        throw error;
      });
    }
    return actionsPromise;
  }

  function documentUrl(documentId) {
    return location.origin + "/content/" + encodeURIComponent(String(documentId));
  }

  // 新版服务器只认请求地址对应页面用到的操作（2026-10-28 验证）：
  // - /content/<id> 文献页：getArticleLists、toggleArticleInList、saveArticleToDefault
  // - /search 搜索页：上面三个，加上批量的 toggleArticlesInList、saveArticlesToDefault
  // - /my-research/lists：只有书单的增删改，没有加入书单的操作
  var BATCH_ACTIONS = { toggleArticlesInList: true, saveArticlesToDefault: true };

  function routeFor(name, documentId) {
    if (BATCH_ACTIONS[name]) return location.origin + "/search?q=" + encodeURIComponent(String(documentId));
    return documentUrl(documentId);
  }

  function routeKey(url) {
    return url.split("?")[0].replace(/\/content\/.*/, "/content/");
  }

  // 当前页面的代码里没有需要的操作时，读一次目标页面的 HTML，从它引用的 chunk 里取操作编号和部署编号。
  // 按页面类型缓存（所有文献页共用一份，搜索页一份）。
  var routeActions = {};
  function loadRouteActions(url) {
    var key = routeKey(url);
    if (!routeActions[key]) {
      routeActions[key] = originalFetch(url, { credentials: "same-origin", cache: "no-store" }).then(function (response) {
        return response.text();
      }).then(function (html) {
        if (html.indexOf(LEGACY_MARK) !== -1) {
          delete routeActions[key];
          return {};
        }
        var dpl = /data-dpl-id="([0-9a-f]+)"/.exec(html) || /[?&]dpl=([0-9a-f]+)/.exec(html);
        if (dpl && !state.deploymentId) state.deploymentId = dpl[1];
        var seen = {};
        (html.match(/\/_next\/static\/chunks\/[^"'\s?]+\.js/g) || []).forEach(function (path) {
          seen[location.origin + path] = true;
        });
        return scanChunks(Object.keys(seen));
      }).catch(function (error) {
        delete routeActions[key];
        throw error;
      });
    }
    return routeActions[key];
  }

  function resolveAction(name, routeUrl) {
    return ensureActions().then(function (actions) {
      if (actions[name] || !routeUrl) return actions[name] || "";
      return loadRouteActions(routeUrl).then(function (more) {
        return more[name] || "";
      });
    });
  }

  function pageDeploymentId() {
    if (state.deploymentId) return state.deploymentId;
    var node = document.querySelector("script[src*='dpl=']");
    var match = node && /[?&]dpl=([0-9a-f]+)/.exec(node.src || "");
    return match ? match[1] : "";
  }

  function actionInfo(id) {
    var head = parseInt(id.slice(0, 2), 16);
    var mask = (head >> 1) & 63;
    var used = [];
    for (var i = 0; i < 6; i++) used.push(((mask >> (5 - i)) & 1) === 1);
    return { used: used, rest: (head & 1) === 1 };
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

  function callAction(name, argument) {
    return directCall(name, argument);
  }

  var LEGACY_MARK = "pep/config/environment";

  // 网站按 pep_experience cookie（有效期 10 分钟，之后的请求不会续期）把请求分给新版或旧版。
  // cookie 过期后，POST 不会被重新分配，而是直接交给旧版，返回旧版首页 HTML（状态 200）。
  function responseKind(response, text) {
    var type = (response.headers && response.headers.get && response.headers.get("content-type")) || "";
    if (response.status === 404) return "rejected";
    if (response.status === 409 || /Server Action unavailable/i.test(String(text).slice(0, 200))) return "stale";
    if (text.indexOf(LEGACY_MARK) !== -1) return "legacy";
    if (!text) return "empty";
    if (type.indexOf("text/html") !== -1 || /^\s*</.test(text)) return "html";
    return "ok";
  }

  // 用 GET 打开一次当前页面：cookie 已过期时，网站会先跳转并重新分配 pep_experience。
  // 返回 true 表示这次被分到了新版。
  function refreshExperience() {
    return originalFetch(location.href, { credentials: "same-origin", cache: "no-store" }).then(function (response) {
      return response.text();
    }).then(function (text) {
      return text.indexOf(LEGACY_MARK) === -1 && text.indexOf("/_next/static/") !== -1;
    }).catch(function () {
      return false;
    });
  }

  // 新版服务器按请求地址判断认哪些操作：书单页地址不认 getArticleLists（409），
  // 发到这篇文献的 /content/ 地址、且不带 next-router-state-tree 则可以（2026-10-28 验证，读取）。
  // 批量操作一律发到 /search?q=<第一篇>（2026-10-28：/search 不带 q 的页面有 135 万字节，带 q 约 72 万字节）。
  function directCall(name, argument) {
    var documentId = argument && (argument.documentId || (argument.documentIds && argument.documentIds[0]));
    var onDocument = isDocumentPage() && !BATCH_ACTIONS[name];
    if (onDocument && !state.tree) {
      return Promise.resolve({ ok: false, code: "refresh-document" });
    }
    if (!onDocument && !documentId) {
      return Promise.resolve({ ok: false, code: "open-document-retry" });
    }
    var target = onDocument ? location.href : routeFor(name, documentId);
    return resolveAction(name, onDocument ? "" : target).then(function (id) {
      if (!id) return { ok: false, code: "action-missing" };
      var body = JSON.stringify(omitArgs([argument], actionInfo(id)));
      var headers = {
        Accept: "text/x-component",
        "next-action": id
      };
      if (onDocument) headers["next-router-state-tree"] = state.tree;
      var deploymentId = pageDeploymentId();
      if (deploymentId) headers["x-deployment-id"] = deploymentId;

      function post(retried) {
        return originalFetch(target, {
          method: "POST",
          headers: headers,
          body: body,
          credentials: "same-origin",
          cache: "no-store"
        }).then(function (response) {
          return response.text().then(function (text) {
            var kind = responseKind(response, text);
            window.__pepBridgeLast = {
              at: new Date().toISOString(),
              name: name,
              status: response.status,
              kind: kind,
              retried: retried,
              request: { url: target, page: location.href, treeLength: onDocument ? state.tree.length : 0, deploymentId: deploymentId, body: body },
              text: text
            };
            if (kind === "legacy" && !retried) {
              return refreshExperience().then(function (isNext) {
                if (isNext) return post(true);
                return { ok: false, code: "legacy-send" };
              });
            }
            if (kind === "legacy") {
              return { ok: false, code: "legacy-request" };
            }
            if (kind === "stale") {
              // 409 Server Action unavailable：新版服务器在这个页面路由下找不到这个操作。
              // 2026-10-28 在 /my-research/lists 上发 getArticleLists 时出现（部署编号未变）。
              actionsPromise = null;
              routeActions = {};
              return { ok: false, code: "stale" };
            }
            if (kind === "rejected") return { ok: false, code: "rejected" };
            if (kind === "empty") return { ok: false, code: "empty" };
            if (kind === "html") {
              return { ok: false, code: "html", status: response.status };
            }
            return { ok: true, body: text, retried: retried };
          });
        });
      }

      return post(false);
    });
  }

  function memberIds(text) {
    var ids = [];
    var seen = {};
    var re = /citationMeta/g;
    var match;
    while ((match = re.exec(text))) {
      var slice = text.slice(Math.max(0, match.index - 180), match.index + 180);
      var id = /([A-Z][A-Z0-9-]*\.\d{3}[A-Z]?\.[0-9A-Z]+)/.exec(slice);
      if (!id || seen[id[1]]) continue;
      seen[id[1]] = true;
      ids.push(id[1]);
    }
    return ids;
  }

  function itemCount(text) {
    var match = /itemCount\\?"\s*:\s*(\d+)/.exec(text) || /"itemCount"\s*:\s*(\d+)/.exec(text);
    if (!match) return null;
    return Number(match[1]);
  }

  // 书单页 GET 也受 pep_experience 分流影响：过期后可能被分到旧版，或跳到登录页。
  // 旧版页面、非新版页面一律报错，不能当成“读全了、空书单”，否则核对时会把已写入的全部当成缺失再逐篇重写。
  // 逐页进度：总页数 = itemCount ÷ 第 1 页的篇数（向上取整）；只有多于 1 页时才报告。
  function reportProgress(token, done, total) {
    window.postMessage({ source: "pep-bridge-progress", token: token, done: done, total: total }, location.origin);
  }

  function listMembers(listId, token) {
    if (listId == null || listId === "") return Promise.resolve({ ok: false, code: "no-list" });
    var seen = {};
    var perPage = 0;
    function pageUrl(page) {
      return location.origin + "/my-research/lists/" + encodeURIComponent(String(listId)) + "?page=" + page;
    }
    function pull(page, total, retried) {
      return originalFetch(pageUrl(page), { credentials: "same-origin", cache: "no-store" }).then(function (response) {
        return response.text().then(function (text) {
          if (text.indexOf(LEGACY_MARK) !== -1) {
            if (retried) return { ok: false, code: "legacy-read" };
            return refreshExperience().then(function (isNext) {
              if (!isNext) return { ok: false, code: "legacy-list" };
              return pull(page, total, true);
            });
          }
          if (response.status === 404 || text.indexOf("PEP | 404") !== -1) {
            return { ok: false, code: "list-404" };
          }
          if (text.indexOf("/_next/static/") === -1) {
            return { ok: false, code: "list-not-next", status: response.status };
          }
          var ids = memberIds(text);
          var added = 0;
          ids.forEach(function (id) {
            if (seen[id]) return;
            seen[id] = true;
            added += 1;
          });
          var reported = itemCount(text);
          if (reported != null) total = reported;
          var count = Object.keys(seen).length;
          if (total === 0) return { ok: true, complete: true, documentIds: [] };
          // 空书单页面没有 itemCount（2026-10-28 用户实测），只能按“读全的空书单”处理；
          // popup 核对时若刚写入过还读到空书单，会按“没能核对”处理，不逐篇重写。
          if (page === 1 && added === 0 && total > 0) {
            return { ok: false, code: "unread" };
          }
          if (page === 1) perPage = added;
          var pages = total != null && perPage ? Math.ceil(total / perPage) : 0;
          if (pages > 1 && page < pages) reportProgress(token, page, pages);
          if (total != null && count >= total) return { ok: true, complete: true, documentIds: Object.keys(seen) };
          if (added === 0 || page >= 40) {
            return { ok: true, complete: total == null || count >= total, documentIds: Object.keys(seen) };
          }
          return pull(page + 1, total, retried);
        });
      });
    }
    return pull(1, null, false);
  }

  function isDocumentPage() {
    return location.pathname.indexOf("/content/") === 0;
  }

  function isNextPage() {
    return !!document.querySelector("script[src*='/_next/static/'], link[href*='/_next/static/']");
  }

  function pokePrefetch() {
    var link = document.querySelector("a[href^='/'], a[href^='" + location.origin + "']");
    if (!link) return;
    link.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  }

  // 文献页要有路由树才能发请求；其他新版页面把请求发到文献页地址，不需要路由树。
  function pingResult() {
    var next = isNextPage();
    return {
      ok: true,
      next: next,
      href: location.href,
      hasTree: !!state.tree,
      ready: next && (!!state.tree || !isDocumentPage())
    };
  }

  function ping() {
    if (state.tree || !isNextPage() || !isDocumentPage()) {
      return Promise.resolve(pingResult());
    }
    pokePrefetch();
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve(pingResult());
      }, 400);
    });
  }

  window.addEventListener("message", function (event) {
    if (event.source !== window || event.origin !== location.origin) return;
    var data = event.data;
    if (!data || data.source !== "pep-relay") return;
    var job;
    if (data.op === "ping") job = ping();
    else if (data.op === "call") job = callAction(data.arg && data.arg.name, data.arg && data.arg.argument);
    else if (data.op === "members") job = listMembers(data.arg && data.arg.listId, data.arg && data.arg.token);
    else job = Promise.resolve({ ok: false, code: "unknown-op" });
    Promise.resolve(job).then(function (result) {
      window.postMessage({ source: "pep-bridge-result", requestId: data.requestId, result: result }, location.origin);
    }).catch(function (error) {
      window.postMessage({
        source: "pep-bridge-result",
        requestId: data.requestId,
        result: { ok: false, error: error && error.message ? error.message : String(error) }
      }, location.origin);
    });
  });
})();
