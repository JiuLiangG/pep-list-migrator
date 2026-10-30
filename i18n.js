// 界面文字（中文 / English）。默认跟随浏览器语言（zh 开头用中文，含繁体；其他用英文），
// 用户点右上角的“中文 / EN”切换后记在 localStorage，之后一直用这个选择。切换时直接刷新扩展窗口。
// 书单名用 {list}：中文模板自己带「」，英文显示成斜体（fillText 渲染成 <em>）。
// 其他部分（background.js、bridge.js、relay.js、import-model.js）只给错误代码，这里的 err.* 负责换成文字。
var I18N = {
  zh: {
    "app.name": "PEP 阅读清单迁移工具（非官方）",
    "lang.label": "语言",
    "site.toLegacy": "切换到旧版",
    "site.toNext": "切换到新版",
    "site.nowLegacy": "pep-web.org 现在显示旧版。点击切换到新版。",
    "site.nowNext": "pep-web.org 现在显示新版。点击切换到旧版。",
    "site.nowUnknown": "还不确定 pep-web.org 现在显示哪一版。点击切换到新版。",
    "notice": "本扩展非 PEP 官方产品，由 GJL 个人开发，供学习研究使用。",

    "export.title": "导出清单",
    "export.which": "导出哪个清单",
    "export.button": "导出",
    "export.reading": "正在读取 {source}",
    "export.readingBoth": "正在读取 Favorites 和 Read Later",
    "export.saving": "正在保存文件",
    "export.failed": "导出失败",
    "save.done": "已保存 {parts}",
    "save.part": "{source} {n} 篇",
    "save.partSep": "，",
    "save.untitled": "。其中 {n} 篇没查到标题，只保留了编号，不影响导入。",
    "save.empty": "。旧清单是空的；如果不对，请在旧版重新登录后再导出。",
    "save.cancelled": "已取消保存。",
    "save.unknown": "未检测到保存结果，请到下载文件夹确认。",
    "save.failed": "保存失败（{error}）。",
    "save.interrupted": "下载中断",
    "save.erased": "下载记录已删除",

    "import.title": "导入清单",
    "import.pickFile": "选择文件",
    "import.readingFiles": "正在读取文件",
    "file.error": "{file}：{error}",
    "file.unreadable": "{file} 无法读取",
    "source.count": "{n} 篇",
    "files.pickedOne": "已选择 {n} 个文件",
    "files.picked": "已选择 {n} 个文件",
    "files.empty": "文件里没有可导入的文献。",
    "sources.join": " 和 ",
    "sources.empty": "{sources} 里没有文献。",

    "lists.load": "读取书单",
    "lists.loading": "正在读取书单",
    "lists.none": "读取书单失败，请尝试在新版界面重新登录。",
    "lists.label": "书单",
    "lists.default": "{name}（默认）",
    "lists.only": "导入到「{list}」",
    "rows.summary": "{sources} 共 {n} 篇",
    "rows.summaryOne": "{sources} 共 {n} 篇",
    "rows.summaryDedup": "{sources} 共 {n} 篇（已去重）",
    "rows.summaryDedupOne": "{sources} 共 {n} 篇（已去重）",

    "tools.all": "全选",
    "tools.none": "全不选",
    "tools.import": "导入",
    "mark.done": "已导入",
    "mark.present": "已在书单中",
    "mark.pending": "已提交，未核对",
    "mark.failed": "导入失败",

    "progress.checking": "正在比对书单，过滤已有文献",
    "progress.batch": "正在批量导入",
    "progress.verifying": "正在核对文献是否导入成功",
    "progress.single": "正在逐篇导入",

    "result.written": "已导入 {n} 篇至「{list}」",
    "result.unverified": "已提交 {n} 篇至「{list}」，未确认是否导入成功，请自行查看书单",
    "result.skipped": "已跳过 {n} 篇（已在书单中）",
    "result.failed": "{n} 篇导入失败",
    "result.failedWhy": "{n} 篇导入失败（{reason}）",
    "result.stopped": "已停止导入（{why}）",
    "result.stoppedLeft": "已停止导入（{why}），还有 {n} 篇没有尝试",
    "result.streak": "连续 {n} 篇失败",
    "result.retry": "没导入的已保留勾选，处理好后重新点导入即可",
    "result.nothing": "没有需要导入的文献。",
    "result.sep": "；",
    "result.end": "。",
    "result.notes": "（{notes}）",
    "result.notesSep": "；",
    "note.batchFailed": "{n} 篇批量写入失败（{reason}），改为逐篇写入",
    "note.missing": "{n} 篇核对时不在书单里，改为逐篇写入",
    "reason.empty": "返回为空",
    "reason.code": "错误码 {code}",
    "reason.success": "返回 success={x}",

    "err.pick-one": "至少选择一份清单",
    "err.no-session": "没有旧版登录信息。请在旧版登录后再导出。",
    "err.switch-failed": "切换网站版本失败（{error}）",
    "err.bad-session": "旧清单会话无法读取。请在 pep-web.org 重新登录。",
    "err.expired": "旧版登录已过期，请在旧版重新登录后再导出。",
    "err.read-failed": "读取旧清单失败（{status}）",
    "err.not-json": "这不是 JSON 文件",
    "err.not-ours": "只认这个扩展导出的文件",
    "err.favorites-not-array": "favorites 不是数组",
    "err.readlater-not-array": "readLater 不是数组",
    "err.refresh-document": "请刷新当前这个新版文献页，再回到扩展页导入。",
    "err.disconnected": "pep-web 页面和扩展断开了：扩展重新加载后，已打开的页面要刷新才能连上。请刷新那篇新版文献页再试。",
    "err.open-document": "请打开一篇新版文献并刷新，然后再导入。",
    "err.open-document-retry": "请打开一篇新版文献页，刷新后再试。",
    "err.no-response": "页面没有响应（{error}）。请刷新那篇新版文献页。",
    "err.page-timeout": "新版页面没有响应",
    "err.page-no-result": "新版页面没有返回结果",
    "err.sign-in": "请先在新版页面登录",
    "err.lists-failed": "读取书单失败（{code}）",
    "err.lists-failed-plain": "读取书单失败",
    "err.request-failed": "书单请求失败",
    "err.lists-unknown": "书单返回的格式无法识别。请刷新新版页面后再试；仍不行时，在页面控制台运行 __pepBridgeLast 查看原始返回。",
    "err.result-unknown": "书单结果无法识别",
    "err.members-unread": "没有读到这本书单里的文献",
    "err.members-partial": "这本书单没有读全，已停止导入。",
    "err.verify-empty": "核对时读到的书单是空的",
    "err.action-missing": "找不到书单操作。请打开一篇新版文献页，刷新后再试。",
    "err.legacy-send": "网站现在把你分到了旧版，书单请求发不出去。请刷新页面，切回新版后再试。",
    "err.legacy-list": "网站现在把你分到了旧版，读不了书单。请刷新页面，切回新版后再试。",
    "err.legacy-request": "书单请求被网站分到了旧版。请刷新新版页面，确认显示的是新版后再试。",
    "err.legacy-read": "读书单时被网站分到了旧版。请刷新新版页面，确认显示的是新版后再试。",
    "err.stale": "新版服务器不认这个书单操作（409），可能网站刚更新过。请刷新新版页面后再试。",
    "err.rejected": "书单请求被拒绝。请刷新当前这个新版文献页。",
    "err.empty": "书单接口没有返回结果。请刷新当前这个新版文献页。",
    "err.html": "书单接口返回了网页而不是数据（状态 {status}）。请刷新新版页面后再试。",
    "err.no-list": "没有选定书单",
    "err.list-404": "打不开这本书单页面。",
    "err.list-not-next": "书单页面返回的不是新版页面（状态 {status}）。请刷新新版页面后再试。",
    "err.unread": "没有读到这本书单里的文献，已停止导入。",
    "err.unknown-op": "未知操作"
  },
  en: {
    "app.name": "PEP List Migrator (Unofficial)",
    "lang.label": "Language",
    "site.toLegacy": "Previous site",
    "site.toNext": "New site",
    "site.nowLegacy": "pep-web.org is showing the previous site. Click to switch to the new site.",
    "site.nowNext": "pep-web.org is showing the new site. Click to switch to the previous site.",
    "site.nowUnknown": "Not sure which site pep-web.org is showing. Click to switch to the new site.",
    "notice": "Not an official PEP product. Made by GJL for study and research.",

    "export.title": "Export lists",
    "export.which": "Which list to export",
    "export.button": "Export",
    "export.reading": "Reading {source}…",
    "export.readingBoth": "Reading both lists…",
    "export.saving": "Saving file…",
    "export.failed": "Export failed",
    "save.done": "Saved {parts}",
    "save.part": "{source} ({n})",
    "save.partSep": ", ",
    "save.untitled": ". {n} had no title (kept by ID); import still works.",
    "save.empty": ". List is empty. If wrong, sign in on the previous site and retry.",
    "save.cancelled": "Save canceled.",
    "save.unknown": "Save unconfirmed. Check Downloads.",
    "save.failed": "Save failed ({error}).",
    "save.interrupted": "interrupted",
    "save.erased": "download deleted",

    "import.title": "Import lists",
    "import.pickFile": "Open files",
    "import.readingFiles": "Reading files…",
    "file.error": "{file}: {error}",
    "file.unreadable": "Can't read {file}",
    "source.count": "{n}",
    "files.pickedOne": "{n} file selected",
    "files.picked": "{n} files selected",
    "files.empty": "No articles to import.",
    "sources.join": " & ",
    "sources.empty": "No articles in {sources}",

    "lists.load": "Load lists",
    "lists.loading": "Loading lists…",
    "lists.none": "Couldn't load lists. Sign in again on the new site.",
    "lists.label": "List",
    "lists.default": "{name} (default)",
    "lists.only": "Import to {list}",
    "rows.summary": "{n} articles from {sources}",
    "rows.summaryOne": "{n} article from {sources}",
    "rows.summaryDedup": "{n} articles from {sources} (duplicates merged)",
    "rows.summaryDedupOne": "{n} article from {sources} (duplicates merged)",

    "tools.all": "Select all",
    "tools.none": "Deselect all",
    "tools.import": "Import",
    "mark.done": "Imported",
    "mark.present": "Already in list",
    "mark.pending": "Sent, unchecked",
    "mark.failed": "Failed",

    "progress.checking": "Skipping existing items…",
    "progress.batch": "Importing…",
    "progress.verifying": "Verifying import…",
    "progress.single": "Importing singly…",

    "result.written": "Imported {n} to {list}",
    "result.unverified": "Sent {n} to {list}, unverified; please check it",
    "result.skipped": "Skipped {n} (already there)",
    "result.failed": "{n} failed",
    "result.failedWhy": "{n} failed ({reason})",
    "result.stopped": "Stopped ({why})",
    "result.stoppedLeft": "Stopped ({why}); {n} not tried",
    "result.streak": "{n} failed in a row",
    "result.retry": "Unimported stay checked; click Import to retry",
    "result.nothing": "Nothing to import.",
    "result.sep": ". ",
    "result.end": ".",
    "result.notes": " ({notes})",
    "result.notesSep": "; ",
    "note.batchFailed": "{n} failed in batch ({reason}); retried singly",
    "note.missing": "{n} missing on check; retried singly",
    "reason.empty": "empty",
    "reason.code": "code {code}",
    "reason.success": "success={x}",

    "err.pick-one": "Pick at least one list",
    "err.no-session": "Not signed in to the previous site. Sign in there, then export.",
    "err.switch-failed": "Couldn't switch site ({error})",
    "err.bad-session": "Can't read your previous-site sign-in. Sign in again at pep-web.org.",
    "err.expired": "Previous-site sign-in expired. Sign in there again, then export.",
    "err.read-failed": "Couldn't read lists ({status})",
    "err.not-json": "Not a JSON file",
    "err.not-ours": "Not exported by this tool",
    "err.favorites-not-array": "favorites isn't an array",
    "err.readlater-not-array": "readLater isn't an array",
    "err.refresh-document": "Refresh the new-site article page, then import here.",
    "err.disconnected": "pep-web page disconnected: after an extension reload, open pages need a refresh. Refresh the article page and retry.",
    "err.open-document": "Open a new-site article, refresh, then import.",
    "err.open-document-retry": "Open a new-site article, refresh, and retry.",
    "err.no-response": "No response ({error}). Refresh the article page.",
    "err.page-timeout": "Page not responding",
    "err.page-no-result": "Page returned nothing",
    "err.sign-in": "Sign in on the new site",
    "err.lists-failed": "Couldn't load lists ({code})",
    "err.lists-failed-plain": "Couldn't load lists",
    "err.request-failed": "List request failed",
    "err.lists-unknown": "Unknown list format. Refresh and retry; if it persists, run __pepBridgeLast in the page console.",
    "err.result-unknown": "Unknown list result",
    "err.members-unread": "Couldn't read this list",
    "err.members-partial": "List partly read. Import stopped.",
    "err.verify-empty": "List empty on check",
    "err.action-missing": "List action missing. Open a new-site article, refresh, retry.",
    "err.legacy-send": "pep-web.org switched you to the previous site; can't send. Refresh, switch back, retry.",
    "err.legacy-list": "pep-web.org switched you to the previous site; can't load lists. Refresh, switch back, retry.",
    "err.legacy-request": "The request went to the previous site. Refresh and make sure you're on the new site.",
    "err.legacy-read": "Loading lists went to the previous site. Refresh and make sure you're on the new site.",
    "err.stale": "Server rejected the list action (409); site may have changed. Refresh and retry.",
    "err.rejected": "Request rejected. Refresh the article page.",
    "err.empty": "No reply. Refresh the article page.",
    "err.html": "Got a web page, not data ({status}). Refresh and retry.",
    "err.no-list": "No list selected",
    "err.list-404": "Can't open this list.",
    "err.list-not-next": "List page isn't new-site ({status}). Refresh and retry.",
    "err.unread": "Couldn't read this list. Import stopped.",
    "err.unknown-op": "Bad op"
  }
};

var LANG_KEY = "pepLang";
var EM_OPEN = "\uE000";
var EM_CLOSE = "\uE001";

var LANG = (function () {
  try {
    var saved = localStorage.getItem(LANG_KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch (error) {}
  var ui = "";
  try {
    ui = chrome.i18n.getUILanguage();
  } catch (error) {
    ui = typeof navigator !== "undefined" ? navigator.language : "";
  }
  return /^zh/i.test(ui || "zh") ? "zh" : "en";
})();

function hasText(key) {
  return Object.prototype.hasOwnProperty.call(I18N[LANG], key);
}

// 按当前语言取文字并填入参数；{list} 在英文里加上斜体标记。参数值里的花括号不会被再次替换。
function t(key, params) {
  var template = hasText(key) ? I18N[LANG][key] : (I18N.zh[key] || key);
  return template.replace(/\{(\w+)\}/g, function (whole, name) {
    if (!params || params[name] == null) return whole;
    var value = String(params[name]);
    return name === "list" && LANG === "en" ? EM_OPEN + value + EM_CLOSE : value;
  });
}

// 把带斜体标记的文字写进元素：标记内的部分放进 <em>，其余是普通文字（都用 textContent，不用转义）。
function fillText(el, text) {
  el.textContent = "";
  String(text).split(/(\uE000[^\uE001]*\uE001)/).forEach(function (part) {
    if (!part) return;
    if (part.charAt(0) === EM_OPEN) {
      var em = document.createElement("em");
      em.textContent = part.slice(1, -1);
      el.appendChild(em);
    } else {
      el.appendChild(document.createTextNode(part));
    }
  });
}

// 页面里写死的文字：data-i18n 填文字，data-i18n-aria 填读屏标签。
function applyStatic() {
  document.documentElement.lang = LANG === "zh" ? "zh-CN" : "en";
  document.title = t("app.name");
  Array.prototype.forEach.call(document.querySelectorAll("[data-i18n]"), function (el) {
    el.textContent = t(el.dataset.i18n);
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-aria]"), function (el) {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });
  var toggle = document.getElementById("lang");
  if (toggle) {
    toggle.dataset.active = LANG;
    Array.prototype.forEach.call(toggle.querySelectorAll("button"), function (button) {
      button.setAttribute("aria-checked", String(button.dataset.lang === LANG));
    });
  }
}

function switchLanguage(lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch (error) {}
  location.reload();
}
