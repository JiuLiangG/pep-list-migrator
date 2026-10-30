var exportFavorites = document.getElementById("export-favorites");
var exportReadLater = document.getElementById("export-readLater");
var exportButton = document.getElementById("export");
var exportStatus = document.getElementById("export-status");
var fileInput = document.getElementById("file");
var sourcesBox = document.getElementById("sources");
var loadListsButton = document.getElementById("load-lists");
var listPicker = document.getElementById("list-picker");
var importStatus = document.getElementById("import-status");
var tools = document.getElementById("tools");
var rowsBox = document.getElementById("rows");
var importButton = document.getElementById("import");
var pickFileButton = document.getElementById("pick-file");
var langToggle = document.getElementById("lang");
var siteToggle = document.getElementById("site");

applyStatic();
// 点另一种语言：滑块先滑过去（0.2 秒），再记住选择并刷新窗口。
langToggle.addEventListener("click", function (event) {
  var target = event.target.closest("button");
  if (!target || target.disabled || importing || exporting || target.dataset.lang === LANG) return;
  langToggle.dataset.switching = "";
  langToggle.dataset.active = target.dataset.lang;
  setTimeout(function () { switchLanguage(target.dataset.lang); }, 200);
});

// 网站版本：pep-web.org 按 pep_experience cookie 把请求分给旧版（legacy）或新版（policy-next）。
// 按钮显示“点了会去哪”：现在是新版就写“切换到旧版”，是旧版或还不知道（没有这个 cookie）就写“切换到新版”；
// 悬停提示说明现在是哪一版。网站或别处改了 cookie，按钮也会跟着变。
var SITE_COOKIE = "pep_experience";

function showSite(value) {
  var target = value === "policy-next" ? "legacy" : "policy-next";
  siteToggle.dataset.site = target;
  siteToggle.querySelector("span").textContent = t(target === "legacy" ? "site.toLegacy" : "site.toNext");
  siteToggle.title = t(value === "policy-next" ? "site.nowNext" : value === "legacy" ? "site.nowLegacy" : "site.nowUnknown");
}

function readSite() {
  if (!chrome.cookies) return;
  chrome.cookies.get({ url: "https://pep-web.org/", name: SITE_COOKIE }, function (cookie) {
    showSite(cookie && cookie.value);
  });
}

readSite();
if (chrome.cookies && chrome.cookies.onChanged) {
  chrome.cookies.onChanged.addListener(function (info) {
    if (info.cookie && info.cookie.name === SITE_COOKIE && /(^|\.)pep-web\.org$/.test(info.cookie.domain)) readSite();
  });
}

// 点按钮：按钮先换成反方向，由 background.js 改 cookie 并把浏览器里当前的 pep-web.org 页面换成那一版；失败时按钮恢复原样。
siteToggle.addEventListener("click", function () {
  if (siteToggle.disabled || importing || exporting) return;
  var target = siteToggle.dataset.site;
  showSite(target);
  chrome.runtime.sendMessage({ type: "pep-switch", value: target }, function (result) {
    var runtimeError = chrome.runtime.lastError;
    if (!runtimeError && result && result.ok) return;
    readSite();
    setNote(exportStatus, runtimeError ? runtimeError.message : describe(result || { code: "switch-failed", error: "?" }), "error");
  });
});

// 成对的按钮等宽，按较宽的那个对齐：“选择文件 / 读取书单”上下两行，“全选 / 全不选”左右并排。
// 量的是实际宽度，隐藏时量不到，所以“全选 / 全不选”在列表显示出来后（renderRows）再对齐。
var rowButtons = [pickFileButton, loadListsButton];
var selectButtons = [document.getElementById("select-all"), document.getElementById("select-none")];

function alignButtons(buttons) {
  buttons.forEach(function (button) { button.style.minWidth = ""; });
  var width = Math.max.apply(null, buttons.map(function (button) { return button.getBoundingClientRect().width; }));
  if (!width) return;
  buttons.forEach(function (button) { button.style.minWidth = Math.ceil(width) + "px"; });
}

function alignAllButtons() {
  alignButtons(rowButtons);
  alignButtons(selectButtons);
}
alignAllButtons();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(alignAllButtons);

var parsedFile = null;
var chosenLists = [];
var selectedListId = "";
var merged = [];
// 每个书单各自记录行状态：rowMarks[书单 id][文献 id] = { text, locked }；切换书单时按新书单重画。
var rowMarks = {};
var requestGeneration = 0;

chrome.runtime.onMessage.addListener(function (message) {
  if (!message) return;
  if (message.type === "pep-export-progress" && exporting) setStatus(exportStatus, readingText(message.source), message.percent || 0);
  // 读书单的逐页进度（bridge → relay 转来）；只认当前这次读取，读完后迟到的进度一律忽略。
  if (message.type === "pep-members-progress" && message.token === progressToken && progressLabel) {
    showProgress(progressLabel, message.done, message.total);
  }
});

// 状态行一律经这里写入。传了 percent（0～100）就是“进行中”：显示进度条，长度按 percent，
// percent 大于 0 时文字后加百分比；不传就是普通文字，隐藏进度条。不再从文字内容判断是否进行中。
function setStatus(status, text, percent) {
  var busy = typeof percent === "number";
  delete status.dataset.tone;
  fillText(status, busy && percent > 0 ? text + " " + percent + "%" : text);
  status.classList.toggle("busy", busy);
  status.style.setProperty("--progress", (busy ? Math.min(100, percent) : 0) + "%");
}

// 结束时的消息带语气：warn 提醒（橙）、error 出错（红）；不传就是普通消息（正文色）。
function setNote(status, text, tone) {
  setStatus(status, text);
  if (tone) status.dataset.tone = tone;
}

// 窗口高度跟着内容走：还没有文献列表时收到刚好放下内容，显示列表时撑到 LIST_HEIGHT。
// 只调整扩展自己开的弹出窗口；用户把列表窗口拉得更高时不再缩回。
var LIST_HEIGHT = 760;
var fitFrame = 0;

function scheduleFit() {
  if (!fitFrame) fitFrame = requestAnimationFrame(function () { fitFrame = 0; fitWindow(); });
}

// 窗口外框高度（标题栏等）＋底部声明条：内容高度换算成窗口高度时都要加上。
function frameExtra() {
  var notice = document.querySelector(".notice");
  return (notice ? notice.offsetHeight : 0) + window.outerHeight - window.innerHeight;
}

// 不含文献列表时刚好放下全部内容的窗口高度：底部声明条贴着窗口底边，内容和它之间留 24px。
function contentHeight() {
  var bottom = 0;
  Array.prototype.forEach.call(document.querySelector("section.import").children, function (el) {
    if (el.offsetParent !== null) bottom = Math.max(bottom, el.getBoundingClientRect().bottom);
  });
  return Math.ceil(bottom + 24 + frameExtra());
}

// 改窗口高度；超出屏幕底边时把窗口往上挪。
function setWindowHeight(win, want) {
  var screenTop = screen.availTop || 0;
  want = Math.min(want, screen.availHeight);
  if (Math.abs(win.height - want) < 2) return;
  var update = { height: want };
  if (win.top + want > screenTop + screen.availHeight) update.top = Math.max(screenTop, screenTop + screen.availHeight - want);
  chrome.windows.update(win.id, update);
}

function fitWindow() {
  if (!chrome.windows || !chrome.windows.getCurrent) return;
  var listShown = !tools.hidden;
  var want = listShown ? LIST_HEIGHT : contentHeight();
  chrome.windows.getCurrent(function (win) {
    if (!win || win.type !== "popup" || win.state !== "normal") return;
    if (listShown && win.height >= want) return;
    setWindowHeight(win, want);
  });
}

// 窗口最小尺寸：宽度不小于新开窗口时的宽度（与 background.js 的 openWindow 一致），
// 高度不小于放下全部控件所需；显示列表时列表可以缩到它的最小高度 80px（列表下方 16px 是声明条的上边距）。
// 浏览器不提供最小尺寸设置，只能在用户拖小、停手 300ms 后把窗口改回下限；先改宽度，宽度改好后的 resize 再检查高度。
var MIN_WIDTH = 400;
var minSizeTimer = 0;

function minHeight() {
  if (tools.hidden) return contentHeight();
  return Math.ceil(rowsBox.getBoundingClientRect().top + 80 + 16 + frameExtra());
}

function keepMinSize() {
  if (!chrome.windows || !chrome.windows.getCurrent) return;
  chrome.windows.getCurrent(function (win) {
    if (!win || win.type !== "popup" || win.state !== "normal") return;
    if (win.width < MIN_WIDTH) {
      chrome.windows.update(win.id, { width: MIN_WIDTH });
      return;
    }
    var want = minHeight();
    if (win.height < want - 1) setWindowHeight(win, want);
  });
}

window.addEventListener("resize", function () {
  clearTimeout(minSizeTimer);
  minSizeTimer = setTimeout(keepMinSize, 300);
});

new MutationObserver(scheduleFit).observe(document.querySelector("main"), {
  childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["hidden"]
});
window.addEventListener("load", scheduleFit);

// 列表悬停提示：标题或作者被截断时显示完整内容，样式跟界面一致（不用浏览器自带的 title 提示）。
var tip = document.createElement("div");
tip.className = "tip";
tip.hidden = true;
tip.setAttribute("role", "tooltip");
document.body.appendChild(tip);
var tipTimer = 0;
var tipRow = null;

function isTruncated(el) {
  return !!el && el.scrollWidth > el.clientWidth + 1;
}

function hideTip() {
  clearTimeout(tipTimer);
  tipRow = null;
  tip.hidden = true;
}

function showTip(row) {
  var title = row.querySelector(".title");
  var meta = row.querySelector(".meta");
  tip.textContent = "";
  var head = document.createElement("div");
  head.className = "tip-title";
  head.textContent = title.textContent;
  tip.appendChild(head);
  if (meta && meta.textContent) {
    var line = document.createElement("div");
    line.className = "tip-meta";
    line.textContent = meta.textContent;
    tip.appendChild(line);
  }
  tip.hidden = false;
  var rowBox = row.getBoundingClientRect();
  var textBox = row.querySelector(".text").getBoundingClientRect();
  var left = Math.min(textBox.left, window.innerWidth - tip.offsetWidth - 12);
  var top = rowBox.bottom + 4;
  if (top + tip.offsetHeight > window.innerHeight - 8) top = rowBox.top - tip.offsetHeight - 4;
  tip.style.left = Math.max(12, left) + "px";
  tip.style.top = Math.max(8, top) + "px";
}

rowsBox.addEventListener("mouseover", function (event) {
  var row = event.target.closest("li");
  if (row === tipRow) return;
  hideTip();
  if (!row) return;
  tipRow = row;
  if (!isTruncated(row.querySelector(".title")) && !isTruncated(row.querySelector(".meta"))) return;
  tipTimer = setTimeout(function () { showTip(row); }, 400);
});
rowsBox.addEventListener("mouseleave", hideTip);
rowsBox.addEventListener("scroll", hideTip);

var progressToken = 0;
var progressLabel = "";

// 进度统一显示百分比；还没有完成任何一步时只显示文字。
function showProgress(label, done, total) {
  var percent = total > 0 ? Math.floor(done / total * 100) : 0;
  setStatus(importStatus, label, percent);
}

exportFavorites.addEventListener("change", syncExportButton);
exportReadLater.addEventListener("change", syncExportButton);
exportButton.addEventListener("click", onExport);
fileInput.addEventListener("change", onFile);
pickFileButton.addEventListener("click", function () {
  fileInput.value = "";
  fileInput.click();
});
loadListsButton.addEventListener("click", onLoadLists);
document.getElementById("select-all").addEventListener("click", function () { setImportable(true); });
document.getElementById("select-none").addEventListener("click", function () { setImportable(false); });
importButton.addEventListener("click", onImport);
rowsBox.addEventListener("click", function (event) { if (importing) event.preventDefault(); }, true);
function syncExportButton() {
  exportButton.disabled = !exportFavorites.checked && !exportReadLater.checked;
}

function syncLoadLists() {
  loadListsButton.disabled = importing || selectedSources().length === 0;
}

// 导入、导出进行中不能切换语言（切换会刷新窗口，正在做的事会中断），也不能切换网站版本（导入要一直用新版）。
function syncLangButton() {
  Array.prototype.forEach.call(document.querySelectorAll(".switches button"), function (button) {
    button.disabled = importing || exporting;
  });
}

var exportGeneration = 0;
var exporting = false;

function readingText(source) {
  if (source === "both") return t("export.readingBoth");
  return t("export.reading", { source: source === "favorites" ? "Favorites" : "Read Later" });
}

function finishExport(text, tone) {
  exporting = false;
  setNote(exportStatus, text, tone);
  syncExportButton();
  syncLangButton();
}

function onExport() {
  exportButton.disabled = true;
  exporting = true;
  syncLangButton();
  setStatus(exportStatus, readingText(exportFavorites.checked ? "favorites" : "readLater"), 0);
  chrome.runtime.sendMessage({
    type: "pep-export",
    favorites: exportFavorites.checked,
    readLater: exportReadLater.checked
  }, function (result) {
    var runtimeError = chrome.runtime.lastError;
    if (runtimeError) {
      finishExport(runtimeError.message, "error");
      return;
    }
    if (!result || !result.ok) {
      finishExport(describe(result, "export.failed"), "error");
      return;
    }
    setStatus(exportStatus, t("export.saving"), 0);
    var generation = ++exportGeneration;
    download(result.file, function (outcome) {
      if (generation !== exportGeneration) return;
      if (outcome.state === "complete") finishExport(savedText(result.file), savedCount(result.file) ? "" : "warn");
      else if (outcome.state === "cancelled") finishExport(t("save.cancelled"));
      else if (outcome.state === "unknown") finishExport(t("save.unknown"), "warn");
      else finishExport(t("save.failed", { error: outcome.error }), "error");
    });
  });
}

function savedCount(file) {
  return (file.favorites || []).length + (file.readLater || []).length;
}

function savedText(file) {
    var parts = [];
    if (file.favorites) parts.push(t("save.part", { source: "Favorites", n: file.favorites.length }));
    if (file.readLater) parts.push(t("save.part", { source: "Read Later", n: file.readLater.length }));
    var untitled = (file.favorites || []).concat(file.readLater || []).filter(function (row) {
      return !row.title;
    }).length;
    var total = (file.favorites || []).length + (file.readLater || []).length;
    return t("save.done", { parts: parts.join(t("save.partSep")) })
      + (untitled ? t("save.untitled", { n: untitled }) : "")
      + (total ? "" : t("save.empty"));
}

function downloadName(file) {
  var now = new Date();
  // 文件名带到秒：开着“下载前询问保存位置”时 Chrome 不会自动加 (1) 后缀，同名会提示替换（2026-10-29 用户实测）。
  var stamp = now.getFullYear() + "-" + twoDigits(now.getMonth() + 1) + "-" + twoDigits(now.getDate())
    + "-" + twoDigits(now.getHours()) + twoDigits(now.getMinutes()) + twoDigits(now.getSeconds());
  // 每次只导出一份清单（0.6.4 起单选）；以前导出的合并文件导入时照样能读。
  if (file.favorites) return "pep-favorites-" + stamp + ".json";
  return "pep-readlater-" + stamp + ".json";
}

function twoDigits(value) {
  return value < 10 ? "0" + value : String(value);
}

// 下载用链接点击，再用 downloads 权限监听下载记录，判断保存成功 / 取消 / 失败。
// Chrome 的下载提示每次都会弹出，与下载方式和权限无关（2026-10-29 用户实测，见 NOTES）。
// report 可能被调用两次：5 秒内没看到下载记录先报 unknown，之后若看到结果再报一次。
// 最近一次的原始记录存在 __pepLastDownload，可在扩展窗口的控制台查看。
var UNKNOWN_AFTER_MS = 5000;
var cleanupDownload = null;

function download(file, report) {
  if (cleanupDownload) cleanupDownload();
  var blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var downloadId = null;
  var settled = false;
  var log = { url: url, events: [], at: new Date().toISOString() };
  window.__pepLastDownload = log;

  function cleanup() {
    clearTimeout(timer);
    chrome.downloads.onCreated.removeListener(onCreated);
    chrome.downloads.onChanged.removeListener(onChanged);
    chrome.downloads.onErased.removeListener(onErased);
    URL.revokeObjectURL(url);
    if (cleanupDownload === cleanup) cleanupDownload = null;
  }

  function finish(state, error) {
    if (settled) return;
    settled = true;
    log.state = state;
    log.error = error || "";
    cleanup();
    report({ state: state, error: error || "" });
  }

  function fromState(current, error) {
    if (current === "complete") finish("complete", "");
    else if (current === "interrupted") finish(error === "USER_CANCELED" ? "cancelled" : "failed", error || t("save.interrupted"));
  }

  function onCreated(item) {
    if (downloadId != null || (item.url !== url && item.finalUrl !== url)) return;
    downloadId = item.id;
    log.events.push({ type: "created", state: item.state, error: item.error || "", filename: item.filename || "" });
    fromState(item.state, item.error);
  }

  function onChanged(delta) {
    if (downloadId == null || delta.id !== downloadId) return;
    log.events.push({ type: "changed", delta: delta });
    if (delta.state) fromState(delta.state.current, delta.error && delta.error.current);
  }

  // 下载记录被直接删掉（取消时也可能这样）按取消处理。
  function onErased(id) {
    if (downloadId == null || id !== downloadId) return;
    log.events.push({ type: "erased" });
    finish("cancelled", t("save.erased"));
  }

  chrome.downloads.onCreated.addListener(onCreated);
  chrome.downloads.onChanged.addListener(onChanged);
  chrome.downloads.onErased.addListener(onErased);
  cleanupDownload = cleanup;

  // 一直没看到下载记录（比如保存窗口里点了取消、Chrome 根本没建记录），先报 unknown，但继续监听。
  var timer = setTimeout(function () {
    if (downloadId == null && !settled) {
      log.events.push({ type: "unknown" });
      report({ state: "unknown", error: "" });
    }
  }, UNKNOWN_AFTER_MS);

  var link = document.createElement("a");
  link.href = url;
  link.download = downloadName(file);
  link.click();
}

function onFile() {
  var files = fileInput.files ? Array.prototype.slice.call(fileInput.files) : [];
  parsedFile = null;
  clearImportView();
  sourcesBox.textContent = "";
  loadListsButton.disabled = true;
  if (!files.length) {
    setStatus(importStatus, "");
    return;
  }
  setStatus(importStatus, t("import.readingFiles"), 0);
  readFiles(files).then(function (parsed) {
    parsedFile = parsed;
    renderSources(files.length);
  }).catch(function (error) {
    setNote(importStatus, error.message || String(error), "error");
  });
}

function readFiles(files) {
  return Promise.all(files.map(readFileText)).then(function (texts) {
    var groups = { favorites: [], readLater: [] };
    var seen = { favorites: false, readLater: false };
    texts.forEach(function (text, index) {
      var parsed;
      try {
        parsed = PepImport.parseFile(text);
      } catch (error) {
        throw new Error(t("file.error", { file: files[index].name, error: describe(error) }));
      }
      ["favorites", "readLater"].forEach(function (key) {
        if (!parsed[key]) return;
        seen[key] = true;
        groups[key].push(parsed[key]);
      });
    });
    return {
      favorites: seen.favorites ? PepImport.mergeRows(groups.favorites) : null,
      readLater: seen.readLater ? PepImport.mergeRows(groups.readLater) : null
    };
  });
}

function readFileText(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () { resolve(String(reader.result)); };
    reader.onerror = function () { reject(new Error(t("file.unreadable", { file: file.name }))); };
    reader.readAsText(file);
  });
}

function renderSources(fileCount) {
  sourcesBox.textContent = "";
  var any = false;
  ["favorites", "readLater"].forEach(function (key) {
    var rows = parsedFile[key];
    if (!rows || !rows.length) return;
    any = true;
    var label = document.createElement("label");
    var box = document.createElement("input");
    box.type = "checkbox";
    box.checked = true;
    box.dataset.source = key;
    box.addEventListener("change", function () {
      requestGeneration += 1;
      clearImportView();
      syncLoadLists();
    });
    label.appendChild(box);
    var sourceName = key === "favorites" ? "Favorites" : "Read Later";
    label.appendChild(document.createTextNode(sourceName));
    var count = document.createElement("span");
    count.className = "count";
    count.textContent = t("source.count", { n: rows.length });
    label.appendChild(count);
    sourcesBox.appendChild(label);
  });
  syncLoadLists();
  setNote(importStatus, any ? t(fileCount === 1 ? "files.pickedOne" : "files.picked", { n: fileCount }) : t("files.empty"), any ? "" : "warn");
}

function selectedSources() {
  var groups = [];
  Array.prototype.forEach.call(sourcesBox.querySelectorAll("input"), function (box) {
    if (!box.checked) return;
    groups.push(parsedFile[box.dataset.source]);
  });
  return groups;
}

// 状态行前缀，如“Favorites”“Favorites 和 Read Later”。
function selectedSourceNames() {
  var names = [];
  Array.prototype.forEach.call(sourcesBox.querySelectorAll("input"), function (box) {
    if (box.checked) names.push(box.dataset.source === "favorites" ? "Favorites" : "Read Later");
  });
  return names.join(t("sources.join"));
}

function clearImportView() {
  chosenLists = [];
  selectedListId = "";
  merged = [];
  rowMarks = {};
  listPicker.textContent = "";
  rowsBox.textContent = "";
  tools.hidden = true;
  importButton.disabled = true;
  importButton.textContent = t("tools.import");
}

// 读书单用固定的参考文献（新版 /content/ 已验证能打开），返回空书单才换下一篇；出错直接报错。
var LIST_PROBE_IDS = ["IJP.027.0099A", "PAQ.073.0005A", "IJP.075.0003A"];

function readLists(index, generation) {
  return callAction("getArticleLists", { documentId: LIST_PROBE_IDS[index] }).then(function (result) {
    var lists = (result.lists || PepImport.findLists(result) || []).filter(function (list) {
      return list && list.id != null && list.name;
    });
    if (lists.length || index + 1 >= LIST_PROBE_IDS.length || generation !== requestGeneration) return lists;
    return readLists(index + 1, generation);
  });
}

function onLoadLists() {
  var generation = ++requestGeneration;
  merged = PepImport.mergeRows(selectedSources());
  chosenLists = [];
  selectedListId = "";
  rowMarks = {};
  rowsBox.textContent = "";
  tools.hidden = true;
  importButton.disabled = true;
  listPicker.textContent = "";
  if (!merged.length) {
    setNote(importStatus, t("sources.empty", { sources: selectedSourceNames() }), "warn");
    return;
  }
  loadListsButton.disabled = true;
  setStatus(importStatus, t("lists.loading"), 0);
  readLists(0, generation).then(function (lists) {
    if (generation !== requestGeneration) return;
    syncLoadLists();
    chosenLists = lists;
    if (!chosenLists.length) {
      setNote(importStatus, t("lists.none"), "error");
      return;
    }
    renderListPicker();
  }).catch(function (error) {
    if (generation !== requestGeneration) return;
    syncLoadLists();
    setNote(importStatus, error.message || String(error), "error");
  });
}

function renderListPicker() {
  listPicker.textContent = "";
  var preferred = chosenLists.filter(function (list) { return list.isDefault; })[0] || chosenLists[0];
  if (chosenLists.length === 1) {
    var note = document.createElement("p");
    fillText(note, t("lists.only", { list: preferred.name }));
    listPicker.appendChild(note);
    chooseList(preferred.id, true);
    return;
  }
  var label = document.createElement("label");
  label.appendChild(document.createTextNode(t("lists.label")));
  var select = document.createElement("select");
  chosenLists.forEach(function (list) {
    var option = document.createElement("option");
    option.value = String(list.id);
    option.textContent = list.isDefault ? t("lists.default", { name: list.name }) : list.name;
    if (String(list.id) === String(preferred.id)) option.selected = true;
    select.appendChild(option);
  });
  select.addEventListener("change", function () { chooseList(select.value, true); });
  label.appendChild(select);
  listPicker.appendChild(label);
  chooseList(preferred.id, true);
}

function chooseList(listId, render) {
  selectedListId = listId;
  if (render) renderRows();
  else syncImportButton();
}

function renderRows() {
  rowsBox.textContent = "";
  var marks = rowMarks[selectedListId] || {};
  merged.forEach(function (row) {
    var item = document.createElement("li");
    var label = document.createElement("label");
    var box = document.createElement("input");
    var mark = marks[row.documentId];
    box.type = "checkbox";
    box.dataset.id = row.documentId;
    box.dataset.list = String(selectedListId);
    if (mark && mark.locked) {
      box.disabled = true;
    } else {
      box.checked = !(mark && mark.kind === "pending");
      box.addEventListener("change", syncImportButton);
    }
    label.className = "row";
    label.appendChild(box);
    var text = document.createElement("span");
    text.className = "text";
    var title = document.createElement("span");
    title.className = "title";
    title.textContent = row.title || row.documentId;
    var detail = document.createElement("span");
    detail.className = "detail";
    var meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = [row.author, row.year].filter(Boolean).join(" ");
    detail.appendChild(meta);
    text.appendChild(title);
    text.appendChild(detail);
    label.appendChild(text);
    item.appendChild(label);
    rowsBox.appendChild(item);
    if (mark) showMark(box, mark.kind);
  });
  tools.hidden = merged.length === 0;
  alignButtons(selectButtons);
  var sum = selectedSources().reduce(function (total, rows) { return total + rows.length; }, 0);
  var summaryKey = (sum > merged.length ? "rows.summaryDedup" : "rows.summary") + (merged.length === 1 ? "One" : "");
  setStatus(importStatus, t(summaryKey, { sources: selectedSourceNames(), n: merged.length }));
  syncImportButton();
}

// 行标记按类型记录：done 已导入、present 已在书单中、pending 已提交未核对、failed 导入失败。
// 显示时按当前语言取文字，颜色看 data-kind。
// locked：已导入 / 已在书单中，取消勾选并禁用。状态记在该行所属书单名下。
function markRow(box, kind, locked) {
  if (locked) {
    box.checked = false;
    box.disabled = true;
  }
  var listId = box.dataset.list;
  if (!rowMarks[listId]) rowMarks[listId] = {};
  rowMarks[listId][box.dataset.id] = { kind: kind, locked: !!locked };
  showMark(box, kind);
}

function showMark(box, kind) {
  var detail = box.parentNode.querySelector(".detail");
  if (!detail) return;
  var mark = detail.querySelector(".mark");
  if (!mark) {
    mark = document.createElement("span");
    mark.className = "mark";
    detail.appendChild(mark);
  }
  mark.textContent = t("mark." + kind);
  mark.dataset.kind = kind;
}

function currentList() {
  return chosenLists.filter(function (list) { return String(list.id) === String(selectedListId); })[0] || null;
}

function importableBoxes() {
  return Array.prototype.filter.call(rowsBox.querySelectorAll("input"), function (box) { return !box.disabled; });
}

function setImportable(checked) {
  importableBoxes().forEach(function (box) { box.checked = checked; });
  syncImportButton();
}

function syncImportButton() {
  var list = currentList();
  importButton.disabled = importing || !list || !importableBoxes().some(function (box) { return box.checked; });
}

// 导入期间锁住界面：只禁用控件，不改行勾选框的 disabled（disabled 表示“已导入 / 已在书单中”）。
var importing = false;

function setImporting(on) {
  importing = on;
  document.body.classList.toggle("importing", on);
  pickFileButton.disabled = on;
  Array.prototype.forEach.call(tools.querySelectorAll("button:not(#import)"), function (button) { button.disabled = on; });
  Array.prototype.forEach.call(listPicker.querySelectorAll("select"), function (select) { select.disabled = on; });
  Array.prototype.forEach.call(sourcesBox.querySelectorAll("input"), function (box) { box.disabled = on; });
  syncLoadLists();
  syncImportButton();
  syncLangButton();
}

function onImport() {
  var list = currentList();
  var boxes = importableBoxes().filter(function (box) { return box.checked; });
  if (importing || !list || !boxes.length) return;
  setImporting(true);
  readMembers(list, t("progress.checking")).then(function (members) {
    var present = members.present;
    var job = { list: list, written: 0, unverified: 0, skipped: 0, failed: 0, reason: "", stopped: "", remaining: 0, notes: [] };
    var pending = [];
    boxes.forEach(function (box) {
      if (!present[box.dataset.id]) {
        pending.push(box);
        return;
      }
      job.skipped += 1;
      markRow(box, "present", true);
    });
    writeBatches(pending, job);
  }).catch(function (error) {
    setNote(importStatus, messageOf(error), "error");
    setImporting(false);
  });
}

function readMembers(list, label) {
  var token = ++progressToken;
  progressLabel = label;
  setStatus(importStatus, label, 0);
  return findNextTab().then(function (tab) {
    return send(tab.id, { op: "members", arg: { listId: list.id, token: token } });
  }).then(function (response) {
    progressLabel = "";
    return response;
  }, function (error) {
    progressLabel = "";
    throw error;
  }).then(function (response) {
    if (!response || !response.ok) throw new Error(describe(response, "err.members-unread"));
    if (!response.complete) throw new Error(t("err.members-partial"));
    var present = {};
    var ids = response.documentIds || [];
    ids.forEach(function (id) { present[id] = true; });
    return { present: present, size: ids.length };
  });
}

// 批量写入：网站自己的多选流程用 toggleArticlesInList({ documentIds, listId, shouldContain })，
// 前端一次最多 100 篇。每次写入服务端都会重新渲染整页（约 34 万字节），所以合并请求能明显变快。
// 批量的返回只有 success，没有逐篇结果；写完后重新读书单核对，缺的再逐篇补写。
var BATCH_SIZE = 20;
// 逐篇写入连续失败这么多篇就停，避免同一个原因白发一串请求。
var MAX_FAIL_STREAK = 3;

function chunk(items, size) {
  var out = [];
  for (var i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function writeBatches(boxes, job) {
  if (!boxes.length) {
    done(job);
    return;
  }
  var batches = chunk(boxes, BATCH_SIZE);
  var sent = [];
  var single = [];
  var batchFailed = 0;
  var batchReason = "";
  var missing = 0;

  function step(index) {
    if (index >= batches.length) {
      verify();
      return;
    }
    var batch = batches[index];
    if (batchReason) {
      single = single.concat(batch);
      batchFailed += batch.length;
      step(index + 1);
      return;
    }
    showProgress(t("progress.batch"), Math.min(index * BATCH_SIZE, boxes.length), boxes.length);
    callAction("toggleArticlesInList", {
      documentIds: batch.map(function (box) { return box.dataset.id; }),
      listId: job.list.id,
      shouldContain: true
    }).then(function (result) {
      if (result && result.success === true) {
        sent = sent.concat(batch);
      } else {
        batchReason = failureText(result);
        single = single.concat(batch);
        batchFailed += batch.length;
      }
      step(index + 1);
    }).catch(function (error) {
      if (error && error.fatal) {
        // 页面、登录或网站版本出了问题：后面的请求也会失败，直接停。已提交的批次来不及核对。
        sent.forEach(markSubmitted);
        job.unverified += sent.length;
        job.stopped = messageOf(error);
        job.remaining = boxes.length - sent.length;
        done(job);
        return;
      }
      batchReason = messageOf(error);
      single = single.concat(batch);
      batchFailed += batch.length;
      step(index + 1);
    });
  }

  function verify() {
    if (!sent.length) {
      next();
      return;
    }
    readMembers(job.list, t("progress.verifying")).then(function (members) {
      // 刚写入过还读到空书单，说明这次读到的页面不可信（空书单页面没有 itemCount，和认不出内容的页面分不开）。
      // 这时不逐篇重写，免得白发一串请求。
      if (!members.size) {
        unverifiable(t("err.verify-empty"));
        return;
      }
      var present = members.present;
      sent.forEach(function (box) {
        if (present[box.dataset.id]) {
          markImported(box);
          job.written += 1;
        } else {
          single.push(box);
          missing += 1;
        }
      });
      next();
    }).catch(function (error) {
      unverifiable(messageOf(error));
    });
  }

  // 核对不了时不逐篇重写，免得多发请求；这些篇记为“已提交，未核对”，保留可再勾选。
  function unverifiable(why) {
    sent.forEach(markSubmitted);
    job.unverified += sent.length;
    next();
  }

  function next() {
    if (batchFailed) job.notes.push(t("note.batchFailed", { n: batchFailed, reason: batchReason }));
    if (missing) job.notes.push(t("note.missing", { n: missing }));
    writeNext(single, 0, job, 0);
  }

  step(0);
}

function markSubmitted(box) {
  box.checked = false;
  markRow(box, "pending");
}

function markImported(box) {
  markRow(box, "done", true);
}

function writeNext(boxes, index, job, streak) {
  if (index >= boxes.length) {
    done(job);
    return;
  }
  var box = boxes[index];
  showProgress(t("progress.single"), index, boxes.length);
  callAction("toggleArticleInList", {
    documentId: box.dataset.id,
    listId: job.list.id,
    shouldContain: true
  }).then(function (result) {
    if (result && result.success === true) {
      markImported(box);
      job.written += 1;
      writeNext(boxes, index + 1, job, 0);
      return;
    }
    fail(failureText(result), false);
  }).catch(function (error) {
    fail(messageOf(error), !!(error && error.fatal));
  });

  function fail(why, fatal) {
    markRow(box, "failed");
    job.failed += 1;
    job.reason = why;
    if (fatal || streak + 1 >= MAX_FAIL_STREAK) {
      job.stopped = fatal ? why : t("result.streak", { n: streak + 1 });
      job.remaining = boxes.length - index - 1;
      done(job);
      return;
    }
    writeNext(boxes, index + 1, job, streak + 1);
  }
}

function done(job) {
  setNote(importStatus, importSummary(job), job.stopped ? "error" : job.failed || job.unverified ? "warn" : "");
  setImporting(false);
}

function importSummary(job) {
  var list = job.list.name;
  var parts = [];
  if (job.written) parts.push(t("result.written", { n: job.written, list: list }));
  if (job.unverified) parts.push(t("result.unverified", { n: job.unverified, list: list }));
  if (job.skipped) parts.push(t("result.skipped", { n: job.skipped }));
  if (job.failed) {
    parts.push(job.reason && job.reason !== job.stopped
      ? t("result.failedWhy", { n: job.failed, reason: job.reason })
      : t("result.failed", { n: job.failed }));
  }
  if (job.stopped) {
    parts.push(job.remaining
      ? t("result.stoppedLeft", { why: job.stopped, n: job.remaining })
      : t("result.stopped", { why: job.stopped }));
  }
  if (job.failed || job.remaining) parts.push(t("result.retry"));
  var text = parts.length ? parts.join(t("result.sep")) + t("result.end") : t("result.nothing");
  if (job.notes.length) text += t("result.notes", { notes: job.notes.join(t("result.notesSep")) });
  return text;
}

// 其他部分（background.js、bridge.js、relay.js、import-model.js）只给错误代码，这里按当前语言换成文字；
// 没有代码的（浏览器或网站自己的报错）显示原文；都没有时用 fallbackKey。
function describe(source, fallbackKey) {
  if (source && source.code && hasText("err." + source.code)) return t("err." + source.code, source);
  if (source && source.error) return String(source.error);
  if (source && source.message) return String(source.message);
  return fallbackKey ? t(fallbackKey) : String(source);
}

function messageOf(error) {
  return error && error.message ? error.message : String(error);
}

// 页面、登录、网站版本层面的错误：后面的请求也会同样失败，导入应立即停止。
function fatalError(message) {
  var error = new Error(message);
  error.fatal = true;
  return error;
}

function failureText(result) {
  if (!result) return t("reason.empty");
  if (result.errorCode != null) return t("reason.code", { code: result.errorCode });
  if (result.error) return String(result.error);
  if (result.message) return String(result.message);
  return t("reason.success", { x: String(result.success) });
}

function callAction(name, argument) {
  return findNextTab().then(function (tab) {
    return send(tab.id, { op: "call", arg: { name: name, argument: argument } });
  }).then(function (response) {
    if (!response || !response.ok) throw fatalError(describe(response, "err.request-failed"));
    var result = PepImport.readActionBody(response.body || response.line, name);
    if (!result) throw new Error(t(name === "getArticleLists" ? "err.lists-unknown" : "err.result-unknown"));
    if (result.authRequired) throw fatalError(t("err.sign-in"));
    if (result.success !== true && name === "getArticleLists") {
      throw new Error(result.errorCode ? t("err.lists-failed", { code: result.errorCode }) : t("err.lists-failed-plain"));
    }
    return result;
  });
}

var pinnedTabId = null;

function findNextTab() {
  return new Promise(function (resolve, reject) {
    chrome.tabs.query({ url: "https://pep-web.org/*" }, function (tabs) {
      var runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(fatalError(runtimeError.message));
        return;
      }
      var ordered = (tabs || []).slice().sort(function (a, b) {
        return tabRank(a) - tabRank(b);
      });
      probeTabs(ordered, 0, { next: false, dead: 0 }, function (tab) {
        pinnedTabId = tab.id;
        resolve(tab);
      }, reject);
    });
  });
}

// 优先用文献页：能直接发到当前地址并带路由树。其他新版页面也能用，但要先多读一次目标页面的 HTML 取操作编号。
function tabRank(tab) {
  var isDocument = !!(tab.url && tab.url.indexOf("https://pep-web.org/content/") === 0);
  if (isDocument && tab.id === pinnedTabId) return 0;
  if (isDocument) return 1;
  if (tab.id === pinnedTabId) return 2;
  return 3;
}

function probeTabs(tabs, index, seen, resolve, reject) {
  if (index >= tabs.length) {
    if (seen.next) reject(fatalError(t("err.refresh-document")));
    else if (seen.dead) reject(fatalError(t("err.disconnected")));
    else reject(fatalError(t("err.open-document")));
    return;
  }
  var tab = tabs[index];
  chrome.tabs.sendMessage(tab.id, { type: "pep-bridge", op: "ping" }, function (result) {
    if (chrome.runtime.lastError) {
      seen.dead += 1;
      probeTabs(tabs, index + 1, seen, resolve, reject);
      return;
    }
    var next = !!(result && result.ok && result.next);
    if (next && (result.ready || result.hasTree)) {
      resolve(tab);
      return;
    }
    if (next) seen.next = true;
    probeTabs(tabs, index + 1, seen, resolve, reject);
  });
}

function send(tabId, message) {
  return new Promise(function (resolve, reject) {
    chrome.tabs.sendMessage(tabId, { type: "pep-bridge", op: message.op, arg: message.arg }, function (result) {
      var runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(fatalError(t("err.no-response", { error: runtimeError.message })));
        return;
      }
      resolve(result);
    });
  });
}
