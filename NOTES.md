# PEP 阅读清单迁移工具：维护笔记

记录已验证的事实和踩过的坑。凡是标注"未验证"的，都还没有真实样本证明。

## 整体结构

- **导出**（`background.js`）：从 `ember_simple_auth-session` cookie 取旧版 SessionId → 调 `pads.pep-web.org/PEPSecure/api/v1/Users/` 读 `ClientSettings.favorites/readLater` → 用 `api.pep-web.org/v2/Database/Search` 批量补题名 → 生成 JSON。
- **导入**：`popup.js` → `relay.js`（隔离环境的内容脚本）→ `bridge.js`（页面 MAIN 环境）。由新版页面代为调用 Next.js Server Action。
- **解析**（`import-model.js`）：导入文件校验、合并去重、解析 RSC flight 返回。

## 为什么要由页面代发请求

- 新版 PEP 是 Next.js App Router，书单读写走 Server Action。
- 按 Next.js 官方文档，Server Action 会比对 `Origin` 与站点域名，不一致就拒绝执行。扩展页面的 Origin 是 `chrome-extension://...`。**这条在 PEP 上未实测。**
- 页面里自然具备：登录 cookie、当前部署的操作编号、路由树等请求头。

## 新版 Server Action（2026-10-28 验证）

操作编号是 42 位 hex，**每次网站部署都会变**，所以在运行时从页面加载的 `/_next/static/chunks/*.js` 里匹配 `createServerReference)("<id>", ..., "<name>")` 来取。

已发现的书单相关操作：`getArticleLists`、`toggleArticleInList`、`saveArticleToDefault`、`saveArticlesToDefault`、`toggleArticlesInList`、`createResearchListFromForm`、`updateResearchListFromForm`、`deleteResearchList`、`deleteResearchLists`。

请求格式（与网站自己发的一致）：

- `POST` 到当前页面 URL
- 请求头：`Accept: text/x-component`、`next-action`、`next-router-state-tree`、`x-deployment-id`
- **不带 `next-url`**（网站自己的请求不带；0.6.0 前插件会带上从预取请求截到的值）
- 请求体：参数数组的 JSON，比如 `[{"documentId":"IJP.040.0308A"}]`

### getArticleLists

- 参数：`{ documentId }`（已验证，和网站自己的请求一致）
- 返回（RSC flight）：

  ```
  0:{"a":"$@1","q":"...","i":false}
  1:[{"id":1001,"name":"Reading list","isDefault":1,"containsDocument":true},{"id":1002,"name":"test","isDefault":0,"containsDocument":false}]
  ```

- `isDefault` 是 **数字 1/0**，`containsDocument` 是布尔值。
- documentId 不被新版识别时返回 `1:[]`。
- 2026-10-28 测试：导出文件里 37 篇旧 ID 在新版全部可识别。

### toggleArticleInList

- 参数：`{ documentId, listId, shouldContain: true }`。2026-10-28 实际导入到 test 和 Reading list 均成功。
- 返回体的完整格式**没有录样本**，目前只依赖其中 `success === true`。

### saveArticleToDefault

- 在文献页点书签按钮会**直接把文章存进默认书单**，同时弹出书单面板。用探针抓样本时要注意这个副作用。

### toggleArticlesInList / saveArticlesToDefault（只读过前端代码，未实测）

- 来源：`/_next/static/chunks/3mb31qzgaqo81.js`（2026-10-28），搜索结果页的多选组件。
- 网站流程：搜索结果勾选多篇 → 选择栏点保存 → `saveArticlesToDefault({ documentIds })`（存进默认书单，返回里带 `lists`）→ 弹出书单对话框 → 勾/取消某个书单时 `toggleArticlesInList({ documentIds, listId, shouldContain })`。
- 前端只看返回的 `success`，失败时读 `errorCode`、`authRequired`；没有看到逐篇结果。
- 前端限制一次最多 100 篇（模块里的常量 `Z: 100`）；服务端是否也限制未知。
- **批量操作只有搜索页认**（2026-10-28 读各页面引用的 chunk）：`/content/<id>` 的代码里只有 `getArticleLists`、`toggleArticleInList`、`saveArticleToDefault`；`/search` 另外有 `toggleArticlesInList`、`saveArticlesToDefault`；`/my-research/lists` 只有书单的增删改。所以批量请求发到 `/search?q=<第一篇>`、不带路由树（2026-10-28 用户实测批量导入通过）。
- 0.6.2 起导入先用 `toggleArticlesInList` 每批 20 篇写入，写完重新读书单核对；批量失败或核对时缺的，改用 `toggleArticleInList` 逐篇补写。一批失败后，剩下的都直接逐篇写。
- 单篇写入的返回约 34 万字节（2026-10-28，书单页发到 `/content/IJP.040.0308A`，`toggleArticleInList`），这是逐篇导入慢的主要原因。

## 新版 / 旧版分流：pep_experience cookie（2026-10-28 验证）

- pep-web.org 由 CloudFront 按 `pep_experience` cookie 把请求交给新版（Next.js）或旧版（Ember）。新版的值是 `policy-next`，旧版是 `legacy`。HttpOnly，**有效期 10 分钟**（`Max-Age=600`）。
- 没有这个 cookie 时，**GET** 会先 307 跳回同一地址并设上 cookie（分到哪边由网站决定；不登录时分到 legacy；本账号刷新页面后分到 policy-next）。
- 带着 cookie 的请求**不会续期**：新版返回里只设 `NEXT_LOCALE` 等，不再设 `pep_experience`。所以页面打开 10 分钟后，cookie 就过期了。
- cookie 过期后，**POST 不会被重新分配，直接交给旧版**，返回旧版首页 HTML，状态 200（能看到 `pep/config/environment`）。插件 0.6.0 会把这个报成“书单返回的格式无法识别”。
- 带 `policy-next` 但操作编号不对（比如网站刚部署过）：新版返回 409，正文 `Server Action unavailable.`。
- **新版服务器按请求地址判断认哪些操作**（2026-10-28 在书单页控制台实测，`getArticleLists`）：
  - POST 到 `/my-research/lists`：409 `Server Action unavailable.`。刷新后的书单页代码里也找不到这个操作编号。
  - POST 到 `/content/PAQ.062.0346C`、不带 `next-router-state-tree`：200，正常返回书单。
  - 带书单页的路由树发到文献页地址：**没测到**（当时没抓到路由树）。
- 0.6.1 的做法：在文献页上照旧发到当前地址并带路由树；在其他新版页面上，读一次 `/content/<第一篇文献>` 的 HTML 取操作编号和部署编号，再把请求发到这个文献页地址、不带路由树。`findNextTab()` 仍优先用文献页。
- **写入（toggleArticleInList）走“文献页地址、不带路由树”这条路还没实测**；写入后服务端会重新渲染页面，没有路由树时返回可能更大。
- 0.6.1 的处理（`bridge.js`）：
  - 返回旧版 HTML → GET 一次当前页面让网站重新分配 → 拿到新版页面就把原请求重发一次；仍是旧版则提示切回新版。旧版不会执行 Server Action，所以重发写入请求不会重复写。
  - 409 → 清掉缓存的操作编号；不在文献页时提示改用文献页，在文献页时提示可能网站刚更新过。
  - 其他 HTML 返回 → 提示返回了网页而不是数据。
- `getArticleLists` 没读到书单、但返回里有 `success:false` / `authRequired` 时，原样交给 popup，显示登录或错误码提示。
- 0.6.3 起读书单不再用导入文件里的第一篇，改用固定的 IJP.027.0099A → PAQ.073.0005A → IJP.075.0003A（2026-10-28 验证新版 `/content/` 都能打开）；返回空书单才换下一篇，出错直接报错。

## 书单已有文献

- 读取 `/my-research/lists/<listId>?page=N` 页面，在 `citationMeta` 前后找文献 ID，并读 `itemCount` 判断是否读全。
- 0.6.4 起：书单页返回旧版时先重新分配再读一次；不是新版页面时报错。空书单页面**没有** `itemCount`、也没有 `citationMeta`（2026-10-28 用户在控制台实测），和认不出内容的页面分不开，所以第一页什么都没有仍按空书单处理；但核对时若刚写入过还读到空书单，按“已提交，未核对”处理，不逐篇重写。
- 0.6.4 起导入出错会止损：页面断开、没登录、409、被分到旧版等错误立即停止；逐篇写入连续 3 篇失败也停止。没导入的保留勾选，重新点导入即可（已写入的会被导入前检查跳过）。导入期间界面锁定。
- 0.6.4 起每行的“已导入 / 已在书单中 / 已提交，未核对 / 导入失败”按书单分别记录（popup.js `rowMarks`）。切换书单时按新书单重画列表，切回原书单时恢复它的标记；手动改过的勾选不保留。0.6.4 之前切书单不重画，前一个书单的“已导入”会让这些文献没法再勾选。
- 0.6.4 起导出改为单选，每次只导出一份清单（`pep-favorites-日期-时分秒.json` 或 `pep-readlater-日期-时分秒.json`；带到秒是因为开着“下载前询问保存位置”时 Chrome 不会自动加后缀），不再生成合并文件；以前的合并文件导入时照样能读。
- 0.6.4 起新增 downloads 权限：下载仍用链接点击，但监听 `chrome.downloads` 的下载记录（按 blob 地址认），区分保存成功 / 取消 / 失败；5 秒内没看到记录先显示“未检测到保存结果”。此前用户在保存窗口点取消也会显示“已导出”。Chrome 的下载提示（下载气泡）现在每次保存都会弹出，覆盖在扩展窗口上：用 `chrome.downloads.download`、链接点击加监听、退回 0.6.3 的纯链接点击且去掉 downloads 权限，三种都会弹（2026-10-29 用户实测），说明与权限和下载方式无关，较早几次导出没弹的原因未查明。取消时 Chrome 是否建下载记录**待实测**，过程记录在扩展窗口的 `__pepLastDownload`。
- 0.6.4 起进度统一显示百分比。读书单的逐页进度由 bridge 发 `pep-bridge-progress` 窗口消息，relay 转成 `pep-members-progress` 给扩展页面；总页数按 `itemCount` ÷ 第 1 页篇数估算，只有多于 1 页时显示。
- 网站书单页每页显示 20 篇（2026-10-28 用户在网页上看到；插件后台读的 `?page=N` 是否同样 20 篇未单独确认）。所以导入前检查和导入后核对，各发“书单总篇数 ÷ 20，向上取整”个请求。
- 2026-10-28 验证：test 和 Reading list 上"已在书单中则跳过"都工作正常。
- 文献 ID 可能带连字符，比如 `RPP-CS.022.0024A`，正则必须允许。
- 这个页面的结构**没有录成测试样本**。

## 界面与语言（0.7.0 起）

- 界面文字都在 `i18n.js` 的 `I18N.zh` / `I18N.en` 里，两份词条必须一一对应（`test/i18n.test.cjs` 会检查）。其他文件（`background.js`、`bridge.js`、`relay.js`、`import-model.js`）只返回错误代码，由 `popup.js` 的 `describe()` 换成当前语言的文字；没有代码的（浏览器或网站自己的报错）显示原文。
- 默认语言：用户在右上角选过就用 localStorage 里的 `pepLang`；否则浏览器界面语言以 zh 开头（含繁体）用中文，其余用英文。切换后直接刷新扩展窗口；导入、导出进行中不能切换。
- 扩展名称和描述在 `_locales/`，跟随浏览器语言，和界面里选的语言无关（zh_TW 也用简体）。
- 英文里旧网站叫 previous site、新网站叫 new site，和官网公告的叫法一致；Favorites、Read Later、Reading list 用官网原词，不翻译。
- 状态行：普通消息用正文色，提醒（`warn`）用橙色，出错（`error`）用红色，由 `setNote(status, text, tone)` 设置；传了百分比的 `setStatus` 显示进度条。
- 扩展窗口新开时宽 400；用户拖得更窄或矮到放不下控件时，停手 300ms 后弹回下限（浏览器不提供最小尺寸设置）。

## 网站切换按钮（0.7.4 起）

- 扩展右上角的胶囊按钮显示“点了会去哪一版”：`pep_experience` 是 `policy-next` 时显示“切换到旧版”，是 `legacy` 或没有这个 cookie 时显示“切换到新版”。悬停提示写当前是哪一版。popup 监听 `chrome.cookies.onChanged`，网站自己改了 cookie 按钮也会跟着变。
- 点击后由 `background.js` 的 `switchSite()` 处理：用 `chrome.cookies.set` 写 `pep_experience`（HttpOnly、Secure、SameSite=Lax、**30 天**；网站自己设的是 10 分钟），然后找最后聚焦的普通浏览器窗口的当前标签页：是 pep-web.org 就换成另一版的地址或直接刷新，不是就新开 `https://pep-web.org/`。失败时按钮恢复原样，导出状态行显示红色报错（`err.switch-failed`）。
- 地址换算 `siteUrl()`（`test/site-url.test.cjs`）：新版文献页 `/content/<ID>`（可能带 `/en` 这类语言段）↔ 旧版 `/search/document/<ID>`（旧版也有 `/browse/document/<ID>`）；切到旧版时 `/my-research/...` 换成首页（旧版没有这个页面），其他地址不变。**两版文献页互相跳转未实测。**
- 导入、导出进行中，切换按钮和语言切换一起禁用。
- 写 HttpOnly cookie 只要 `cookies` 权限和 pep-web.org 的主机权限，不需要额外权限。

## 标签页与内容脚本

- 重新加载扩展后，**已打开的页面不会自动注入新的内容脚本**，会报 `Receiving end does not exist`，必须刷新页面。
- `findNextTab()` 会依次询问所有 pep-web 标签页：上次用过的文献页 → 其他 `/content/` 文献页 → 上次用过的非文献页 → 其他。断开的标签页会跳过。
- 写入需要的操作在文献页的代码里能找到；`/my-research/lists` 页上不一定有。
- 可选改进（未做）：加 `scripting` 权限，扩展重载时给已打开的页面补注入脚本。

## 排查工具

- `tools/pep-action-sample.js`：粘到新版文献页的控制台运行。会记录网站自己发出的 Server Action 请求与完整返回，可以用 `__pepSample.asPlugin(id)` 按插件写法重放，用 `__pepSample.download()` 导出 JSON。
- `window.__pepBridgeLast`：插件每次通过 bridge 发请求后，会把请求与完整返回存在这里；`kind` 是返回类型（ok / legacy / stale / html / rejected / empty），`retried` 表示是否经过重新分配后重发。在页面控制台运行 `copy(JSON.stringify(__pepBridgeLast))` 即可复制。
- `chrome.tabs` 只在扩展页面可用（插件小窗口的 DevTools 或 service worker），网页控制台里没有。

## 测试

```
node --test test/*.test.cjs
```

- 测试文件用 `.cjs`，并用 `vm` 加载插件代码：上层目录的 `package.json` 即使声明了 `"type": "module"`，插件文件也不会被当成 ESM。
- `test/fixtures/` 里是 2026-10-28 录到的真实返回，其中 `q` 字段已清空，书单编号换成了假值。网站改版后，先用探针录新样本、更新样本文件、跑测试，再改代码。
