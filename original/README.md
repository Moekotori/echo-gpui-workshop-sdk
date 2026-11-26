# 原版 ECHO API 2 在 GPUI 中的扩展

[TypeScript 接口](echo-workshop.d.ts)覆盖原版包接入 GPUI 原生面板、网页登录和谱面下载时使用的能力。通过 `echo.host.getCapabilities()` 检查当前宿主和已授权能力。权限、下载目录选择与文件保存继续沿用工坊授权流程。

| 接口 | 清单授权 |
| --- | --- |
| `echo.network.request`、`cancel` | `network:request` + 外层清单 `networkHosts`，支持 GET、HEAD、POST，使用 Range 或图片 Accept 请求二进制 |
| 可信入口 `context.hostInvoke("web.*")`、`"mediaImport.*"` | `system:full`、`fs:plugin`、`network:request`；下载端口由可信入口声明 |
| `echo.storage.isSecure/get/set/remove` | `system:full`、`fs:plugin`、`credentials.keys`；声明键交给系统凭据存储 |
| `echo.files.export` | `fs:export`；PNG 上限 32 MiB，由用户在系统对话框选择保存位置 |
| `echo.presence.steam` | `presence:control` 和用户的 Steam 状态设置；停用插件清除它持有的状态 |
| `echo.events.on("playback:status")`、播放与队列操作 | `playback:read`、`playback:control`、`queue:control` 分别授权 |
| `echo.audio.output.getSignalPath()` 和 `onSignalPathChanged()` | `audio:output-read` |
| `echo.library.getArtistArtwork()`、`getTrackVersions()`、`getLinkedTracks()` | `library:read`；读取本机曲库 |
| 本地中继音频和封面 | `sources:relay`、`sources:direct`、`sources:provide` 和 `system:full` |
| 播放插件自己的歌单 | `sources:provide`、`playback:control` |
| 离线脚本求值 | `system:full`、`network:request`，脚本来源域名列入 `networkHosts` |
| 插件后台运行 | `background:run` 和 `system:full`；启用插件后随应用恢复 |
| 歌曲菜单和底栏 | `contributes.trackContextMenus` 和 `contributes.playerBarActions` 引用已注册的命令，歌曲菜单支持单曲选择 |

## 信号路径和本机曲库详情

这组接口是 GPUI 的 API 2 兼容扩展。通过 `echo.host.getCapabilities()` 确认可用性。信号路径和订阅分别对应 `audio:output:getSignalPath`、`audio:signal-path:changed`，返回同一份 [AudioSignalPath](../starter/echo-workshop.d.ts) 快照。`library:getArtistArtwork` 返回头像缩略图或 `null`，`library:getTrackVersions` 返回曲目版本组，`library:getLinkedTracks` 返回连播顺序。

## GPUI 原生面板

在内层 `.echo` 清单的 `gpuiPageEntry` 声明包内 `.mjs`。该入口获得与可信入口相同的授权，导出 `activate(echo)`，返回 `open(panelId, signal)` 和 `action({ data, fields }, signal)`。返回值使用 [WorkshopPage](../starter/echo-workshop.d.ts) 声明。面板 ID 来自 `contributes.panels`，动作的方法使用 `original.panel`。原版 ECHO 仍使用清单中的 HTML 面板。GPUI 使用原生控件渲染。

异步内容更新后，可用 `echo.ui.invalidatePage(panelId)` 通知当前面板重新加载。只可刷新本插件声明的原生面板。文本字段可使用 `placeholder` 和 `submit` 指定提示与回车动作。声明 `rhythmStage` 节点可在自定义布局内放置下文的音符轨道。

登录窗口通过临时 Chromium 配置目录打开，支持 Chrome、Edge、Chromium 或 Brave。插件的可信入口可读取授权域名的页面和 JSON，宿主只向登录站点发送该站点的 Cookie。会话由系统凭据存储保存。镜像下载传 `credentials: "omit"`，下载的 OSZ 和导入回执保存在用户选定的目录。回执记录曲库曲目 ID、音频路径及其关联谱面路径。

`WorkshopPage.rhythmPreview` 可显示与播放位置同步的音符轨道。传入本地曲目 ID、1–18 轨、200–5000 毫秒提前量及 Base64 编码的音符。每条音符由三个字段连续组成，分别为相对上一条音符的开始时间差（无符号 LEB128，起点为 0）、从零计数的轨道（单字节），以及持续时间（无符号 LEB128，点按为 0）。时间单位是毫秒，最多 120000 条，编码长度上限 850000 字符。原版包声明 `playback:read` 后使用宿主播放时钟。

## 来源歌单

在 `contributes.sourceProviders` 的来源条目声明 `placement: "playlists"`，并用同一个 ID 注册 `browse` 和 `listCollection`。前者返回歌单记录，后者按歌单 ID 分页返回曲目。歌单记录使用 `kind: "collection"`，`providerTrackId` 保存稳定的歌单 ID。宿主在「收藏与歌单 → 来源歌单」展示这些记录，并通过音源解析接口提交播放。插件可通过原生面板自行呈现歌单墙和账号状态。

### 从插件页面播放

`echo.sources.playCollection(providerId, collectionId, { startTrackId })` 接收当前插件注册的来源和稳定的歌单 ID。指定 `startTrackId` 可以从所选曲目起播。返回 `preparing` 后应让当前面板动作结束，宿主才会回调来源分页。播放器负责按需续页，可通过 `collectionStatus()` 查询准备结果，通过 `cancelCollection()` 取消此插件尚在准备的请求。原生面板的取消按钮可直接使用 `method: "sources.cancelCollection"`，即使正在等待歌单分页，也会立即通知宿主取消。

可信解析入口 `sources:resolve` 返回 `url` 和可选的 `coverUrl`、`lyrics`、`lyricsProvider`、`followStreamRate`。只有 `needArtwork` 为真时需要补查封面。返回 `lyricsProvider` 时使用本插件已注册的歌词 ID，宿主会把稳定的音源和曲目 ID 传给该来源做精确查找。启用 `sources:relay` 后，可返回 `http://127.0.0.1:<port>/<tokenized-path>` 的音频及封面地址。插件创建、鉴权和释放自己的中继，宿主按返回的本机地址读取，播放时保留 Range。面板图片继续用 `WorkshopPage.layout.images` 的 PNG 或 JPEG data URL，适用于扫码和封面预览。

### 离线脚本求值

可信入口可调用 `context.hostInvoke("sandbox.evaluate", { origin, code })`。填入外层清单声明的 HTTPS 来源，代码在隔离、离线的浏览器页面执行，返回 JSON 值。可用 `sandbox.destroy` 释放会话。登录使用独立的 `web.*` 会话，保存凭据通过清单声明的 `credentials.keys`。

## osu! 1.8.0

从 ECHO GPUI 仓库运行以下命令，产物目录可由 GPUI 的「插件 → 从文件安装」选择：

```sh
node examples/workshop/osu/adapt.mjs /path/to/echo/workshop/osu/content/echo.workshop.json /path/to/osu-gpui
```

适配器保留原插件的可信入口、账号逻辑、下载源和段位算法，为 GPUI 增加原生面板入口，重新生成外层文件校验值。
