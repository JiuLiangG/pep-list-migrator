var COOKIE_NAME = "ember_simple_auth-session";
var PAGE_URL = chrome.runtime.getURL("popup.html");
var WINDOW_KEY = "popupWindowId";

// 扩展窗口只留一个。扩展重新加载时，浏览器会把开着的扩展页面换成新标签页，窗口本身留下；
// 所以记下窗口编号，下次点图标或扩展重新加载后，把那个窗口换回扩展界面，而不是再开一个。
chrome.action.onClicked.addListener(function () {
  chrome.tabs.query({ url: PAGE_URL }, function (tabs) {
    var tab = tabs && tabs[0];
    if (tab && tab.windowId != null) {
      rememberWindow(tab.windowId);
      focusWindow(tab.windowId);
      return;
    }
    findOwnWindow(function (win) {
      if (win) {
        showPage(win);
        return;
      }
      openWindow();
    });
  });
});

// 扩展重新加载或更新后，把原来的窗口换回新版界面。
chrome.runtime.onInstalled.addListener(function () {
  findOwnWindow(function (win) {
    if (win) chrome.tabs.update(win.tabs[0].id, { url: PAGE_URL });
  });
});

// 浏览器重启后窗口编号会重新分配，旧记录作废。
chrome.runtime.onStartup.addListener(function () {
  chrome.storage.local.remove(WINDOW_KEY);
});

chrome.windows.onRemoved.addListener(function (windowId) {
  chrome.storage.local.get(WINDOW_KEY, function (data) {
    if (data && data[WINDOW_KEY] === windowId) chrome.storage.local.remove(WINDOW_KEY);
  });
});

function rememberWindow(windowId) {
  var data = {};
  data[WINDOW_KEY] = windowId;
  chrome.storage.local.set(data);
}

// 找扩展上次开的窗口：还在、是弹出窗口、只有一个页面，才算数。
function findOwnWindow(callback) {
  chrome.storage.local.get(WINDOW_KEY, function (data) {
    var windowId = data && data[WINDOW_KEY];
    if (typeof windowId !== "number") {
      callback(null);
      return;
    }
    chrome.windows.get(windowId, { populate: true }, function (win) {
      if (chrome.runtime.lastError || !win || win.type !== "popup" || !win.tabs || win.tabs.length !== 1) {
        chrome.storage.local.remove(WINDOW_KEY);
        callback(null);
        return;
      }
      callback(win);
    });
  });
}

function showPage(win) {
  chrome.tabs.update(win.tabs[0].id, { url: PAGE_URL }, function () {
    focusWindow(win.id);
  });
}

function focusWindow(windowId) {
  chrome.windows.update(windowId, { focused: true, state: "normal" });
}

function openWindow() {
  chrome.windows.getLastFocused({ windowTypes: ["normal"] }, function (browser) {
    var width = 400; // popup.js 的 MIN_WIDTH 与此一致：窗口不能拖得比这更窄
    var height = 480; // 打开后 popup.js 会按内容自动调整高度
    var options = {
      url: PAGE_URL,
      type: "popup",
      width: width,
      height: height,
      focused: true
    };
    if (browser && browser.left != null && browser.top != null && browser.width != null) {
      var left = browser.left + browser.width - width * 2 - 12;
      if (left < browser.left) left = browser.left;
      options.left = Math.round(left);
      options.top = Math.round(browser.top + 88);
    }
    chrome.windows.create(options, function (win) {
      if (win && win.id != null) rememberWindow(win.id);
    });
  });
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message) return;
  if (message.type === "pep-switch") {
    switchSite(message.value).then(function () {
      sendResponse({ ok: true });
    }).catch(function (error) {
      sendResponse({ ok: false, code: "switch-failed", error: error && error.message ? error.message : String(error) });
    });
    return true;
  }
  if (message.type !== "pep-export") return;
  exportLists(message).then(sendResponse).catch(function (error) {
    // code / status 由 popup 换成当前语言的文字；没有 code 的（浏览器自己的报错）显示 error 原文。
    sendResponse({
      ok: false,
      code: error && error.code,
      status: error && error.status,
      error: error && error.message ? error.message : String(error)
    });
  });
  return true;
});

// 切换 PEP 网站版本：pep-web.org 按 pep_experience cookie 分流，legacy 是旧版，policy-next 是新版。
// 网站自己设的只有 10 分钟，过期后会重新分配（新浏览器没登录新版时分到旧版）；这里设 30 天，切过去就一直停在那一版，直到再切换。
// 改完把浏览器当前标签页换成那一版：是 pep-web.org 就刷新（文献页换成对应版本的地址），不是就新开一个 pep-web.org 标签页。
var SITE_COOKIE = "pep_experience";
var SITE_DAYS = 30;

function switchSite(value) {
  if (value !== "legacy" && value !== "policy-next") return Promise.reject(new Error("bad value"));
  return setSiteCookie(value).then(function () {
    return new Promise(function (resolve) {
      chrome.windows.getLastFocused({ populate: true, windowTypes: ["normal"] }, function (win) {
        if (chrome.runtime.lastError) win = null;
        resolve(win);
      });
    });
  }).then(function (win) {
    var tab = win && win.tabs ? win.tabs.filter(function (item) { return item.active; })[0] : null;
    if (tab && tab.id != null && tab.url && tab.url.indexOf("https://pep-web.org/") === 0) {
      var next = siteUrl(tab.url, value);
      return next === tab.url ? callTabs("reload", tab.id) : callTabs("update", tab.id, { url: next });
    }
    var options = { url: "https://pep-web.org/" };
    if (win && win.id != null) options.windowId = win.id;
    return callTabs("create", options);
  });
}

function setSiteCookie(value) {
  return new Promise(function (resolve, reject) {
    chrome.cookies.set({
      url: "https://pep-web.org/",
      name: SITE_COOKIE,
      value: value,
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "lax",
      expirationDate: Math.floor(Date.now() / 1000) + SITE_DAYS * 86400
    }, function (cookie) {
      var runtimeError = chrome.runtime.lastError;
      if (runtimeError || !cookie) reject(new Error(runtimeError ? runtimeError.message : "cookie not set"));
      else resolve(cookie);
    });
  });
}

// 文献页两版地址不同：新版 /content/<ID>（前面可能带 /en 这类语言段），旧版 /search/document/<ID> 或 /browse/document/<ID>。
// 新版的“我的书单”在旧版没有对应页面，换成首页；其他页面原地址刷新。
function siteUrl(url, value) {
  var parsed = new URL(url);
  var path = parsed.pathname.replace(/\/$/, "");
  var content = path.match(/^(?:\/[a-z]{2})?\/content\/([^/]+)$/i);
  var legacyDoc = path.match(/^\/(?:search|browse)\/document\/([^/]+)$/i);
  if (value === "legacy") {
    if (content) return parsed.origin + "/search/document/" + content[1];
    if (/^(?:\/[a-z]{2})?\/my-research(\/|$)/.test(path)) return parsed.origin + "/";
    return url;
  }
  if (legacyDoc) return parsed.origin + "/content/" + legacyDoc[1];
  return url;
}

function callTabs(method, a, b) {
  return new Promise(function (resolve, reject) {
    var done = function () {
      var runtimeError = chrome.runtime.lastError;
      if (runtimeError) reject(new Error(runtimeError.message));
      else resolve();
    };
    if (b === undefined) chrome.tabs[method](a, done);
    else chrome.tabs[method](a, b, done);
  });
}

function exportLists(message) {
  var wantFavorites = !!message.favorites;
  var wantReadLater = !!message.readLater;
  if (!wantFavorites && !wantReadLater) {
    return Promise.reject(codedError("pick-one"));
  }
  var source = readingSource(wantFavorites, wantReadLater);
  return readSessionId().then(function (sessionId) {
    progress(source, 0);
    return fetchUser(sessionId).then(function (user) {
      var settings = user.ClientSettings || {};
      var favorites = normalizeIds(settings.favorites);
      var readLater = normalizeIds(settings.readLater);
      var selected = {};
      if (wantFavorites) selected.favorites = favorites;
      if (wantReadLater) selected.readLater = readLater;
      var ids = uniqueIds(selected);
      return lookupTitles(sessionId, ids, source).then(function (meta) {
        var file = {
          exportedAt: new Date().toISOString(),
          source: "pep-web",
          favorites: wantFavorites ? rowsFor(favorites, meta) : undefined,
          readLater: wantReadLater ? rowsFor(readLater, meta) : undefined
        };
        if (!wantFavorites) delete file.favorites;
        if (!wantReadLater) delete file.readLater;
        return { ok: true, file: file };
      });
    });
  });
}

function readSessionId() {
  return new Promise(function (resolve, reject) {
    chrome.cookies.get({ url: "https://pep-web.org/", name: COOKIE_NAME }, function (cookie) {
      var runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }
      if (!cookie || !cookie.value) {
        reject(codedError("no-session"));
        return;
      }
      var data;
      try {
        data = JSON.parse(decodeURIComponent(cookie.value));
      } catch (error) {
        try {
          data = JSON.parse(cookie.value);
        } catch (parseError) {
          reject(codedError("bad-session"));
          return;
        }
      }
      var auth = data && data.authenticated ? data.authenticated : data;
      var sessionId = auth && (auth.SessionId || auth.sessionId) || "";
      if (!/^[0-9a-fA-F-]{36}$/.test(sessionId)) {
        reject(codedError("bad-session"));
        return;
      }
      resolve(sessionId);
    });
  });
}

function fetchUser(sessionId) {
  return fetch("https://pads.pep-web.org/PEPSecure/api/v1/Users/?SessionId=" + encodeURIComponent(sessionId), {
    headers: {
      Accept: "application/vnd.api+json, application/json",
      "client-id": "2",
      "client-session": sessionId
    }
  }).then(function (response) {
    if (response.status === 401 || response.status === 403) {
      throw codedError("expired");
    }
    if (!response.ok) throw codedError("read-failed", response.status);
    return response.json();
  });
}

// 报错只给代码，文字由 popup 按当前语言生成（i18n.js 的 err.*）。
function codedError(code, status) {
  var error = new Error(code);
  error.code = code;
  if (status != null) error.status = status;
  return error;
}

// 进度只报“读哪个清单 + 百分比”，文字由 popup 生成。
function readingSource(wantFavorites, wantReadLater) {
  if (wantFavorites && wantReadLater) return "both";
  return wantFavorites ? "favorites" : "readLater";
}

// 进度按请求数算：读清单 1 个 + 查标题每 40 篇 1 个。
function lookupTitles(sessionId, ids, source) {
  var meta = {};
  var size = 40;
  var batches = [];
  var index = 0;
  for (var i = 0; i < ids.length; i += size) batches.push(ids.slice(i, i + size));
  function next() {
    if (index >= batches.length) return Promise.resolve(meta);
    var batch = batches[index];
    var percent = Math.floor((index + 1) / (batches.length + 1) * 100);
    index += 1;
    progress(source, percent);
    return fetchTitleBatch(sessionId, batch).then(function (rows) {
      batch.forEach(function (id) {
        meta[id] = rows[id] || blankMeta();
      });
      return next();
    });
  }
  return next();
}

function fetchTitleBatch(sessionId, ids) {
  var found = {};
  function page(offset) {
    var clause = ids.map(function (id) {
      return '"' + id.replace(/"/g, "") + '"';
    }).join(" OR ");
    var url = "https://api.pep-web.org/v2/Database/Search/?smarttext="
      + encodeURIComponent("art_id:(" + clause + ")")
      + "&limit=" + ids.length
      + "&offset=" + offset;
    return fetch(url, {
      headers: {
        Accept: "application/json",
        "client-id": "2",
        "client-session": sessionId
      }
    }).then(function (response) {
      if (!response.ok) return found;
      return response.json().then(function (body) {
        var list = body && body.documentList || {};
        var docs = list.responseSet || [];
        docs.forEach(function (doc) {
          if (!doc || !doc.documentID || found[doc.documentID]) return;
          found[doc.documentID] = {
            title: textOf(doc.title),
            author: textOf(doc.authorMast || doc.authorCitation),
            year: doc.year == null ? "" : String(doc.year)
          };
        });
        var fullCount = list.responseInfo && list.responseInfo.fullCount || 0;
        if (docs.length && offset + docs.length < fullCount && Object.keys(found).length < ids.length) {
          return page(offset + docs.length);
        }
        return found;
      });
    }).catch(function () {
      return found;
    });
  }
  return page(0);
}

function rowsFor(ids, meta) {
  return ids.map(function (id) {
    var info = meta[id] || blankMeta();
    return {
      documentId: id,
      title: info.title,
      author: info.author,
      year: info.year
    };
  });
}

function normalizeIds(value) {
  if (!Array.isArray(value)) return [];
  var seen = {};
  var ids = [];
  value.forEach(function (item) {
    if (typeof item !== "string" || !item || seen[item]) return;
    seen[item] = true;
    ids.push(item);
  });
  return ids;
}

function uniqueIds(selected) {
  var seen = {};
  var ids = [];
  Object.keys(selected).forEach(function (key) {
    selected[key].forEach(function (id) {
      if (seen[id]) return;
      seen[id] = true;
      ids.push(id);
    });
  });
  return ids;
}

function blankMeta() {
  return { title: "", author: "", year: "" };
}

function textOf(value) {
  return typeof value === "string" ? value : "";
}

function progress(source, percent) {
  try {
    var pending = chrome.runtime.sendMessage({ type: "pep-export-progress", source: source, percent: percent });
    if (pending && typeof pending.catch === "function") pending.catch(function () {});
  } catch (error) {}
}
