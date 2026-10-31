# PEP List Migrator (Unofficial)

[中文说明](#中文说明)

A browser extension that copies your saved articles from the **previous** PEP-Web site to the **new** one.

PEP launches its new website on November 2, 2026. According to PEP's announcement, "saved articles from the previous website will not be transferred." This extension exports your **Favorites** and **Read Later** lists from the previous site to JSON files, then imports them into any list on the new site.

> **Export while the previous site is still available.** Export reads your lists from the previous site; once PEP retires it, export stops working. Import only needs the new site.

## Features

- Export Favorites or Read Later from the previous site to a JSON file, with titles, authors and years.
- Import one or both files into any list on the new site: the default *Reading list* or one you created.
- Articles already in the target list are skipped. After writing, the extension reads the list again to check that every article arrived.
- A button to switch pep-web.org between the previous and the new site.
- Chinese and English interface.

## Install

The extension is not in the Chrome Web Store. Works in Chromium-based browsers (Chrome, Brave, Edge).

**Video walkthrough** (about 3 minutes, Chinese and English captions): [watch online](https://www.wolai.com/3zHf5yU1kg5x8gn6TP8yQ8)

1. Go to [Releases](https://github.com/JiuLiangG/pep-list-migrator/releases/latest), download `pep-list-migrator-<version>.zip` and unzip it. On Windows, right-click the zip and choose **Extract All**; double-clicking only opens it.
2. Open `chrome://extensions` (Brave: `brave://extensions`, Edge: `edge://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose the unzipped `pep-list-migrator` folder (the one that contains `manifest.json`). On Windows, Extract All adds an outer folder, so the path looks like `pep-list-migrator-<version>\pep-list-migrator`: choose the inner one.
5. Optional: pin the extension to the toolbar from the puzzle-piece menu.

Keep the folder: the browser loads the extension from it.

## Use

**Export** (on the previous site)

1. Open pep-web.org and sign in on the previous site. If you land on the new site, click the extension icon, then **Previous site** at the top right.
2. Choose Favorites or Read Later and click **Export**.
3. Repeat for the other list. Keep the JSON files.

**Import** (on the new site)

1. Click **New site** at the top right of the extension and sign in on the new site. Keep a pep-web.org tab open; an article page works best.
2. Click **Open files** and choose one or both exported files.
3. Click **Load lists**, choose the target list, and click **Import**.

If the extension was reloaded or updated, refresh your pep-web.org tab before importing.

### Switching between the sites

pep-web.org decides which site you see with a cookie named `pep_experience` (`legacy` = previous site, `policy-next` = new site). The **Previous site / New site** button sets this cookie for 30 days and reloads the current pep-web.org tab; on an article page it opens the same article on the other site. If the current tab is not on pep-web.org, it opens a new one.

This relies on how the site works today and may stop working at any time, for example when PEP retires the previous site. To switch by hand: open DevTools on pep-web.org → Application → Cookies → `https://pep-web.org`, change `pep_experience`, and reload.

## Privacy

- Everything runs in your browser. The extension talks only to PEP's own servers (`pep-web.org`, `pads.pep-web.org`, `api.pep-web.org`). It has no analytics and sends nothing anywhere else.
- Permissions:
  - `cookies`: read your previous-site sign-in to read your lists, and set `pep_experience` when you click the switch button.
  - `downloads`: tell whether the export file was saved or the save was canceled.
  - `storage`: remember the extension window so that clicking the icon reuses it.

## Limitations

- The extension relies on how PEP-Web works internally, which is not documented and can change with any site update. If something breaks, see [NOTES.md](NOTES.md) (Chinese) for how each part works.
- Only Favorites and Read Later are exported.

## Development

```
node --test test/*.test.cjs
```

No build step and no dependencies. `tools/pep-action-sample.js` is a console script for recording the new site's requests when the site changes.

## Disclaimer

Not an official PEP product and not affiliated with Psychoanalytic Electronic Publishing. Made by GJL for study and research.

## License

[MIT](LICENSE). You are free to use, copy, modify and share it.

---

## 中文说明

把 PEP-Web **旧版**网站里收藏的文章搬到**新版**网站的浏览器扩展。

PEP 新网站于 2026 年 11 月 2 日上线。官网公告说，旧网站收藏的文章“不会转移”（saved articles from the previous website will not be transferred）。本扩展把旧版的 **Favorites** 和 **Read Later** 导出成 JSON 文件，再导入到新版的任意书单。

> **请趁旧版还能访问时导出。** 导出要从旧版读取清单，旧版下线后就不能导出了；导入只需要新版。

### 功能

- 把旧版的 Favorites 或 Read Later 导出成 JSON 文件，含标题、作者和年份。
- 把一份或两份文件导入新版的任意书单：默认的 Reading list 或你自建的书单。
- 已在目标书单里的文章会跳过；写入后重新读一遍书单，核对是否都已写入。
- 一键切换 pep-web.org 显示旧版还是新版。
- 中英文界面。

### 安装

本扩展没有上架 Chrome 应用商店，适用于 Chromium 内核的浏览器（Chrome、Brave、Edge）。

**讲解视频**（约 3 分钟，中英文字幕）：[在线观看](https://www.wolai.com/3zHf5yU1kg5x8gn6TP8yQ8)

1. 打开 [Releases](https://github.com/JiuLiangG/pep-list-migrator/releases/latest)，下载 `pep-list-migrator-<版本号>.zip` 并解压。Windows 上请右键 zip 选**全部解压缩**，双击只是打开、没有解压。
2. 打开 `chrome://extensions`（Brave 为 `brave://extensions`，Edge 为 `edge://extensions`）。
3. 打开**开发者模式**。
4. 点**加载已解压的扩展程序**，选择解压出来的 `pep-list-migrator` 文件夹（里面有 `manifest.json`）。Windows 的“全部解压缩”会多套一层文件夹，路径类似 `pep-list-migrator-<版本号>\pep-list-migrator`，请选里面那层。
5. 可选：在工具栏的拼图图标里把扩展固定到工具栏。

请保留这个文件夹，浏览器是从这里加载扩展的。

### 使用

**导出**（在旧版）

1. 打开 pep-web.org，在旧版登录。如果进到的是新版，点扩展图标，再点右上角的**切换到旧版**。
2. 选 Favorites 或 Read Later，点**导出**。
3. 另一份同样操作一次，保存好 JSON 文件。

**导入**（在新版）

1. 点扩展右上角的**切换到新版**，在新版登录，并保持一个 pep-web.org 标签页打开，最好是文献页。
2. 点**选择文件**，选一份或两份导出的文件。
3. 点**读取书单**，选目标书单，点**导入**。

如果刚重新加载或更新过扩展，导入前请先刷新 pep-web.org 页面。

#### 切换旧版和新版

pep-web.org 用名为 `pep_experience` 的 cookie 决定显示哪个版本（`legacy` 为旧版，`policy-next` 为新版）。**切换到旧版 / 切换到新版**按钮会把这个 cookie 设为 30 天有效，并刷新当前的 pep-web.org 页面；在文献页上会打开另一版的同一篇文献。当前页不是 pep-web.org 时，会新开一个页面。

这依赖网站当前的做法，随时可能失效，比如 PEP 下线旧版之后。也可以手动切换：在 pep-web.org 打开开发者工具 → Application → Cookies → `https://pep-web.org`，修改 `pep_experience` 后刷新。

### 隐私

- 所有操作都在你的浏览器里完成。扩展只和 PEP 自己的服务器（`pep-web.org`、`pads.pep-web.org`、`api.pep-web.org`）通信，没有统计，也不向其他地方发送任何数据。
- 权限用途：
  - `cookies`：读取旧版的登录信息来读取你的清单；点切换按钮时设置 `pep_experience`。
  - `downloads`：判断导出文件是保存成功还是被取消。
  - `storage`：记住扩展窗口，点图标时复用同一个窗口。

### 局限

- 扩展依赖 PEP-Web 内部未公开的做法，网站任何一次更新都可能让它失效。各部分的原理见 [NOTES.md](NOTES.md)。
- 只导出 Favorites 和 Read Later。

### 开发

```
node --test test/*.test.cjs
```

无需构建，没有依赖。`tools/pep-action-sample.js` 是网站改版后用来录新版请求的控制台脚本。

### 声明

本扩展非 PEP 官方产品，与 Psychoanalytic Electronic Publishing 无关，由 GJL 个人开发，供学习研究使用。

### 许可

[MIT](LICENSE)。可以自由使用、复制、修改和分发。
