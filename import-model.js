var PepImport = (function () {
  // 报错只给代码，文字由 popup 按当前语言生成（i18n.js 的 err.*）。
  function codedError(code) {
    var error = new Error(code);
    error.code = code;
    return error;
  }

  function parseFile(text) {
    var data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw codedError("not-json");
    }
    if (!data || data.source !== "pep-web" || typeof data !== "object") {
      throw codedError("not-ours");
    }
    var hasFavorites = Object.prototype.hasOwnProperty.call(data, "favorites");
    var hasReadLater = Object.prototype.hasOwnProperty.call(data, "readLater");
    if (!hasFavorites && !hasReadLater) throw codedError("not-ours");
    if (hasFavorites && !Array.isArray(data.favorites)) throw codedError("favorites-not-array");
    if (hasReadLater && !Array.isArray(data.readLater)) throw codedError("readlater-not-array");
    return {
      favorites: hasFavorites ? cleanRows(data.favorites) : null,
      readLater: hasReadLater ? cleanRows(data.readLater) : null
    };
  }

  function cleanRows(rows) {
    var seen = {};
    var clean = [];
    rows.forEach(function (row) {
      if (!row || typeof row.documentId !== "string" || !row.documentId || seen[row.documentId]) return;
      seen[row.documentId] = true;
      clean.push({
        documentId: row.documentId,
        title: textOf(row.title),
        author: textOf(row.author),
        year: textOf(row.year)
      });
    });
    return clean;
  }

  function mergeRows(groups) {
    var map = {};
    var order = [];
    groups.forEach(function (rows) {
      rows.forEach(function (row) {
        var existing = map[row.documentId];
        if (!existing) {
          map[row.documentId] = {
            documentId: row.documentId,
            title: row.title || "",
            author: row.author || "",
            year: row.year || ""
          };
          order.push(row.documentId);
          return;
        }
        if (!existing.title && row.title) existing.title = row.title;
        if (!existing.author && row.author) existing.author = row.author;
        if (!existing.year && row.year) existing.year = row.year;
      });
    });
    return order.map(function (id) { return map[id]; });
  }

  function readActionResult(line) {
    if (!line) return null;
    var colon = line.indexOf(":");
    if (colon < 1) return null;
    var payload;
    try {
      payload = JSON.parse(line.slice(colon + 1));
    } catch (error) {
      return null;
    }
    if (Array.isArray(payload)) return { success: true, lists: payload };
    var hit = walk(payload, 0);
    if (hit) return hit;
    var lists = findLists(payload);
    if (lists) return { success: true, lists: lists };
    return null;
  }

  function walk(value, depth) {
    if (depth > 6 || value == null || typeof value !== "object") return null;
    if (!Array.isArray(value) && typeof value.success === "boolean") return value;
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) {
        var hit = walk(value[i], depth + 1);
        if (hit) return hit;
      }
      return null;
    }
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k++) {
      var nested = walk(value[keys[k]], depth + 1);
      if (nested) return nested;
    }
    return null;
  }

  function isListItem(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    var id = item.id != null ? item.id : item.listId;
    if (id == null || typeof id === "object") return false;
    return typeof item.containsDocument === "boolean" || isFlag(item.isDefault);
  }

  function isFlag(value) {
    return value === true || value === false || value === 1 || value === 0;
  }

  function normalizeList(item) {
    var id = item.id != null ? item.id : item.listId;
    var name = textOf(item.name || item.title || item.label || item.listName);
    return {
      id: id,
      name: name || textOf(id),
      isDefault: item.isDefault === true || item.isDefault === 1,
      containsDocument: item.containsDocument === true
    };
  }

  function findLists(value, depth) {
    if (depth > 8 || value == null || typeof value !== "object") return null;
    if (Array.isArray(value)) {
      if (value.length && value[0] === "$") {
        for (var j = 0; j < value.length; j++) {
          var child = findLists(value[j], depth + 1);
          if (child) return child;
        }
        return null;
      }
      if (value.some(isListItem)) return value.filter(isListItem).map(normalizeList);
      for (var i = 0; i < value.length; i++) {
        var nested = findLists(value[i], depth + 1);
        if (nested) return nested;
      }
      return null;
    }
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k++) {
      var found = findLists(value[keys[k]], depth + 1);
      if (found) return found;
    }
    return null;
  }

  function flightRows(text) {
    var rows = {};
    String(text || "").split("\n").forEach(function (line) {
      var colon = line.indexOf(":");
      if (colon < 1 || colon > 8) return;
      var id = line.slice(0, colon);
      if (!/^[0-9a-f]+$/i.test(id)) return;
      var rest = line.slice(colon + 1);
      var first = rest.charAt(0);
      if (first !== "{" && first !== "[" && first !== "\"" && first !== "-" && (first < "0" || first > "9")) return;
      try {
        rows[id] = JSON.parse(rest);
      } catch (error) {}
    });
    return rows;
  }

  function deref(value, rows, depth) {
    if (depth > 6 || value == null) return value;
    if (typeof value === "string") {
      var match = /^\$@?([0-9a-f]+)$/i.exec(value);
      if (!match || rows[match[1]] === undefined) return value;
      return deref(rows[match[1]], rows, depth + 1);
    }
    if (Array.isArray(value)) {
      if (value.length && value[0] === "$") return value;
      return value.map(function (item) { return deref(item, rows, depth + 1); });
    }
    if (typeof value === "object") {
      var out = {};
      Object.keys(value).forEach(function (key) {
        out[key] = deref(value[key], rows, depth + 1);
      });
      return out;
    }
    return value;
  }

  function readActionBody(text, actionName) {
    var rows = flightRows(text);
    var lists = null;
    var action = null;
    Object.keys(rows).forEach(function (id) {
      var value = deref(rows[id], rows, 0);
      var found = findLists(value, 0);
      if (found && (!lists || found.length > lists.length)) lists = found;
      var hit = walk(value, 0);
      if (!hit || typeof hit.success !== "boolean") return;
      var keys = Object.keys(hit).length;
      var score = (hit.errorCode != null ? 5 : 0) + (hit.authRequired != null ? 5 : 0) + (keys <= 4 ? 3 : 0);
      if (!action || score > action.score) action = { score: score, value: hit };
    });
    if (actionName === "getArticleLists") {
      if (lists && lists.length) return { success: true, lists: lists };
      if (actionResultIsEmptyList(rows)) return { success: true, lists: [] };
      if (action && (action.value.success === false || action.value.authRequired)) return action.value;
      return null;
    }
    return action ? action.value : null;
  }

  function actionResultIsEmptyList(rows) {
    var head = rows["0"];
    if (!head || typeof head.a !== "string") return false;
    var value = deref(head.a, rows, 0);
    return Array.isArray(value) && value.length === 0;
  }

  function textOf(value) {
    if (value == null) return "";
    return typeof value === "string" ? value : String(value);
  }

  return {
    parseFile: parseFile,
    mergeRows: mergeRows,
    readActionResult: readActionResult,
    readActionBody: readActionBody,
    findLists: findLists
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = PepImport;
