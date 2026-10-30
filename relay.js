chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || message.type !== "pep-bridge") return;
  var requestId = String(Date.now()) + "-" + Math.random();
  var timer = setTimeout(function () {
    window.removeEventListener("message", onResult);
    sendResponse({ ok: false, code: "page-timeout" });
  }, 30000);

  function onResult(event) {
    if (event.source !== window || event.origin !== location.origin) return;
    var data = event.data;
    if (!data || data.source !== "pep-bridge-result" || data.requestId !== requestId) return;
    clearTimeout(timer);
    window.removeEventListener("message", onResult);
    sendResponse(data.result || { ok: false, code: "page-no-result" });
  }

  window.addEventListener("message", onResult);
  window.postMessage({
    source: "pep-relay",
    requestId: requestId,
    op: message.op,
    arg: message.arg || null
  }, location.origin);
  return true;
});

// 把 bridge 读书单时的逐页进度转给扩展页面。
window.addEventListener("message", function (event) {
  if (event.source !== window || event.origin !== location.origin) return;
  var data = event.data;
  if (!data || data.source !== "pep-bridge-progress") return;
  try {
    var pending = chrome.runtime.sendMessage({ type: "pep-members-progress", token: data.token, done: data.done, total: data.total });
    if (pending && typeof pending.catch === "function") pending.catch(function () {});
  } catch (error) {}
});
