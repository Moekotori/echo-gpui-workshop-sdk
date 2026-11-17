# ECHO GPUI Workshop 插件协议 1

[公开 SDK](https://github.com/Moekotori/echo-gpui-workshop-sdk) · [下载](https://github.com/Moekotori/echo-gpui-workshop-sdk/releases/latest) · [反馈与讨论](https://github.com/Moekotori/echo-gpui-workshop-sdk/issues) · [English quickstart](README.en.md)

已安装的 ECHO GPUI 和一个文本编辑器就可以创建、调试和分发 JavaScript 插件。
插件可以注册原生页面、全局搜索音源、标签和封面候选，以及供其他插件调用的命令。
SDK 中的文档、类型声明、清单 schema 和示例采用 [MIT 许可](LICENSE)，可直接复制和修改。分发时保留许可和版权声明。
新建 GPUI 插件使用 `gpui.protocol: 1`；已有原版 ECHO 插件见[迁移说明](#从原版-echo-迁移)。

## 作者入口

1. 打开 **插件 → 创作 → 创建插件示例**，或从公开 SDK 复制 [starter](starter) 到自己的目录。
2. 在 **插件 → 创作 → 临时运行开发包** 选择 `echo.workshop.json`。应用生成的项目中，
   清单和入口位于 `content/`；下载的示例可直接选示例目录内的清单。
3. 确认授权后，打开示例页面。编辑同目录的 `plugin.mjs` 并保存，看页面自动更新。

授权时会显示监听目录。也可以点「重载」手动重试。重载后恢复当前插件页面
及同名非密码字段，启动失败时可以改好再保存。用「查看日志」看最近的 Node 输出和错误栈，
用「查看源码」回到项目目录。

桌面开发会话的 `context.dataRoot` 是独立的临时目录，保存重载时保留，停止会话后清理。
`context.contentRoot` 仍指向源码，开发会话可使用桌面当前的曲库和播放功能。

想用终端时，可直接调用已安装应用里的 `echo-gpui`。下面的命令用 `echo-gpui` 代表程序路径。
Windows 独立构建使用 `echo-gpui.exe`。通过 Steam 安装 GPUI 时，在游戏库中打开「管理 → 浏览本地文件」，
使用安装目录里的 `EchoZankyo.exe`。macOS 应用包中的程序位于 `Contents/MacOS`。

```sh
echo-gpui --workshop doctor
echo-gpui --workshop templates
echo-gpui --workshop init my-plugin --template live-library
cd my-plugin
echo-gpui --workshop check
echo-gpui --workshop test
echo-gpui --workshop dev
```

| 模板 | 适用场景 |
| --- | --- |
| [`page`](starter)（默认） | 从原生页面、按钮和私有存储开始。 |
| [`live-library`](live-library) | 订阅播放、队列和曲库变化，自动刷新页面。示例支持播放、入队和收藏。 |
| [`navidrome`](navidrome) | 接入 OpenSubsonic 服务，展示登录、搜索、翻页、歌词查询和播放。在插件页填写账号后，用 F4 选择这个搜索源。 |

- `doctor` 显示 ECHO 当前选用的 Node.js 路径和版本，并验证工坊所需的运行时能力。
- `init` 生成清单、可直接运行的 JavaScript、类型声明和项目内的上手说明。省略 ID 时，
  `My Plugin` 这样的目录名会生成 `community.my-plugin`。也可以在目录名后显式指定 ID。
- `check`、`test`、`dev` 默认使用当前目录，也可以传入项目目录、包目录或清单文件。
  项目目录本身含有清单时优先使用该清单，否则查找 `content/echo.workshop.json`。
- `check` 校验清单、协议和入口路径。`test` 在临时曲库中用与桌面端相同的宿主启动插件，
  列出已注册贡献并校验页面。Node 的日志和错误堆栈直接显示在终端。
- 用 `echo-gpui --workshop test . now-playing` 运行 starter 注册的命令并打印 JSON 结果。
  可在命令 ID 后传一个 JSON 参数，例如 `'{"title":"Echo"}'`。省略时传入 `null`。
  原版命令仍用 `test . <命令 ID>` 和原版动作表单的默认值。
- `dev` 监听包目录，每次保存后启动新进程重跑 `test`，同一会话内保留临时插件数据。
  用 Ctrl+C 退出。
- `test` 和 `dev` 会执行插件代码，只对自己信任的包运行。打包版使用随附的 Node.js。
  未随附运行时的开发构建可用系统 Node.js 18.17 或更新版本，也可用 `ECHO_GPUI_NODE` 指定。

### 离线创建与检查

下载并解压 [SDK ZIP](https://github.com/Moekotori/echo-gpui-workshop-sdk/releases/latest) 后，在 SDK 目录中运行。
这组命令使用 Node.js 18.17 或更新版本。适合没有安装 GPUI 的开发机和 CI，无需 npm 安装依赖。

```sh
node sdk.mjs templates
node sdk.mjs init my-plugin community.yourname.my-plugin
node sdk.mjs check my-plugin
node sdk.mjs capabilities
```

`init` 使用与 GPUI 相同的示例源码和项目布局，可加 `--template live-library` 或 `--template navidrome`。
`check` 读取原生 GPUI 清单，检查入口文件位置和 JavaScript 语法，无需执行插件。
支持传入项目目录、包目录或清单。使用目标版本的 `echo-gpui --workshop test my-plugin`
验证依赖、页面和宿主调用，用 `--workshop pack` 生成安装包。

### 声明宿主能力

`node sdk.mjs capabilities` 显示 SDK 对应宿主的命令、事件、队列上限，以及原版适配器接受的权限和 Bridge 直接分发的动作。
安装版的 `echo-gpui --workshop capabilities` 显示当前构建提供的原生接口，输出和插件内的 `host.describe` 一致。

如果插件启动必须依赖某个命令或事件，可在清单的 `gpui` 中添加 `requires`：

```json
"requires": {
  "commands": ["library.playlistItems"],
  "events": ["library.changed"]
}
```

新版宿主读包时会检查这些名称，并报告缺失的接口。旧版宿主可能忽略这个字段。
有降级路径的功能可继续通过 `host.describe` 在运行时判断。接口出现在清单中仍需检查实际设备和运行条件。

迁移原版脚本时，可运行 `node sdk.mjs capabilities --original-catalog path/to/capability-catalog.json`，
将原版 SDK 的公开动作 ID 与 GPUI 原版 Bridge 分发器做对照。结果只统计直接分发，
单独走运行器、网络或主题扩展的能力不在匹配结果里。权限被接受后，仍需逐项核对用到的动作。

### 离线运行预览

```sh
node sdk.mjs preview starter --action demo.remember
node sdk.mjs preview starter --command now-playing
node sdk.mjs preview live-library --action play --input '"demo-2"'
```

`preview` 用 GPUI 的插件运行器启动原生插件，以 JSON 打印注册项、页面或命令结果。
默认打开第一个页面，也可用 `--page` 指定页面 ID。用 `--action` 执行该页面上的按钮，
`--input` 传入按钮数据或命令参数，`--fields` 可传入字符串字段值，如 `'{"query":"Echo"}'`。
当多个行按钮共用一个方法时，用 `--input` 区分目标。

预览内置示例曲库、歌单、收藏、播放和队列事件，宿主支持的命令可用 `host.describe` 查询。
每次启动创建独立数据目录，不连接用户曲库、音频设备或系统凭据。
预览会以当前用户权限执行插件代码，只预览信任的插件。正式发布前用目标版本的
`--workshop test` 和桌面开发会话检查实际宿主行为及页面布局。

### 清单和类型

在插件包里放一份 `echo.workshop.json` 和它指向的 JavaScript 入口。可以从 [starter 清单](starter/echo.workshop.json) 开始。

- `type` 使用 `echo-workshop-item`，`schemaVersion` 使用 `1`，`content.kind` 使用 `plugin-package`。
- `id` 使用 1–80 位 ASCII 字母、数字、点、下划线或连字符。建议使用自己的命名空间，例如 `community.yourname.my-plugin`。
- 设置 `title` 和 `version`，发布更新时沿用插件 ID。建议从 SemVer `0.1.0` 起步。
- `gpui.protocol` 使用 `1`，`gpui.entry` 填包内的相对 `.mjs` 路径。
  通过自己的 HTTPS 地址分发时，再设置 `gpui.updateFeed`。

编辑器可通过 `$schema` 使用[清单 schema](schemas/manifest.schema.json)，并用
[`echo-workshop.d.ts`](starter/echo-workshop.d.ts)查看 `WorkshopContext` 和页面、事件、搜索等接口。
`--workshop check` 还会核对入口文件和发行地址。宿主新增能力可通过
`await context.hostInvoke('host.describe')` 查询，返回值中的 `commands` 和 `events` 是当前运行版本实际提供的能力。
分享前用准备支持的 ECHO GPUI 版本运行 `--workshop test`。

## 打包与分发

```sh
echo-gpui --workshop pack my-plugin-0.1.0.zip
echo-gpui --workshop test my-plugin-0.1.0.zip
```

`pack` 复制清单所在目录的完整内容。可用 `pack <项目或包路径> <输出>` 从其他目录打包。
把源码仓库、账号配置、构建缓存和其他私有文件留在
`content` 之外。可以用 npm、TypeScript 或打包器开发，入口 `gpui.entry` 填最终的相对
`.mjs` 路径。将运行时依赖打进产物或复制实际文件到包中。直接带上 npm 依赖时，可用
`npm ci --omit=dev --no-bin-links`，避免把平台相关的符号链接带进发布包。原生 npm 扩展
需要分别准备对应系统和架构的依赖，并实测启动。修改版本后保持插件 ID 不变，用户可以更新原来的安装。

- **独立分发** · 把 ZIP 放在 GitHub Releases、个人网站或其他渠道。用户把 ZIP 拖进插件页，
  或在「插件 → 已安装 → 安装 / 导入文件」选择 ZIP，然后启用。也可以直接压缩插件目录。
  ZIP 里只放一个插件，`echo.workshop.json` 可以位于 ZIP 根目录或目录内。ZIP 上限为
  256 MiB，插件解压后上限为 512 MiB。文件夹和清单也能照常安装。
- **Steam 创意工坊** · 连接 Steam 后，在「插件 → 创作」选择作品 ZIP 或清单，以及小于 1 MiB 的 PNG、
  JPEG 或 GIF 预览图。首次可选「私密」发布，再从作品页确认预览和安装流程。更新时使用同一 Steam 账号和插件 ID，
  应用会提交到原有作品。准备公开时选择相应可见性并确认 Steam 所需的工坊协议。
- **Steam 测试** · 将 `pack` 的输出名改成无 `.zip` 后缀的新目录，再用
  `echo-gpui --workshop steam-vdf my-plugin-0.1.0 preview.png my-plugin.vdf` 生成私密测试 VDF。使用 Valve 的
  `workshop_build_item` 上传时，SteamCMD 会在成功后回填作品 ID。保留该 ID，更新时可复用
  原 VDF（若打包路径变化，修改其中的路径），也可以将 ID 作为新 VDF 命令的最后一个参数。
  [Steam 创意工坊实现指南](https://partner.steamgames.com/doc/features/workshop/implementation?language=schinese)

## 通过链接分发和更新

作者可以把 ZIP 放在任意公开 HTTPS 下载地址，把一份发布 JSON 放在自己长期维护的地址。
在 `echo.workshop.json` 的 `gpui` 中添加 `"updateFeed": "https://plugins.example.com/my-plugin/latest.json"`，
并使用 `1.2.0` 这样的 SemVer 版本号。以后每个发布包继续使用同一个插件 ID 和更新地址。

```sh
echo-gpui --workshop pack my-plugin/content my-plugin-1.2.0.zip
echo-gpui --workshop release-feed my-plugin-1.2.0.zip https://plugins.example.com/my-plugin/1.2.0.zip > latest.json
```

先上传 ZIP，再用新生成的 `latest.json` 更新发布地址。这个 JSON 可以静态托管，也可以由你自己的发布流程生成。
格式如下，`sha256` 由命令按 ZIP 的实际内容生成。

```json
{
  "schemaVersion": 1,
  "id": "community.my-plugin",
  "version": "1.2.0",
  "zipUrl": "https://plugins.example.com/my-plugin/1.2.0.zip",
  "sha256": "生成命令写入 64 位十六进制 SHA-256"
}
```

在「插件 → 已安装」中，声明了更新源的插件会显示「检查更新」。用户点检查后，
可以选择安装找到的版本。若插件正在运行，先停止再更新。ECHO 核对 ZIP 的 SHA-256、插件 ID、
版本和更新地址，安装完成后由用户启用并授权。未设置更新源的旧包仍可手动更新。
要更换更新地址，请向用户提供一份可以手动安装的新 ZIP。

首次安装也可以直接分享 `latest.json` 的 HTTPS 链接。用户在「插件 → 已安装」选择 **从链接安装**，
粘贴链接，查看插件 ID、版本和来源，再点「安装」。ZIP 中的 `gpui.updateFeed` 必须与用户输入的
发布清单地址一致，安装后同一链接也用于检查更新。链接安装用于添加新插件。已有相同 ID 的插件时，
通过已安装列表检查更新。插件在用户单独启用和授权后才会运行。

## 从原版 ECHO 迁移

原版 Workshop 插件可先用 `echo-gpui --workshop check <作品目录或 ZIP>` 检查兼容性。
原版包保留 `echo.workshop.json` 和清单中指向的 `.echo`，无需添加 `gpui` 字段或改写入口。
通过检查后，可用 `--workshop test` 启动并列出命令，或从「插件 → 已安装 → 安装 / 导入文件」
安装 ZIP 或选择清单。Steam 下载的兼容包也可从「我的订阅」安装。启用后在插件页点击命令，
`echo.ui.notify` 的消息显示在当前页面。改写 `.echo` 后需用原版 SDK 同步清单中的大小和 SHA-256。

原版 SDK API 2 插件可用经典 `.js` 脚本注册 `contributes.commands` 中的命令，默认限时五秒。
可用 `echo-gpui --workshop test <作品目录或 ZIP> <命令 ID>` 在临时曲库中执行命令。

| 原版插件 | 已接入的入口 |
| --- | --- |
| Hello Plugin | 读取播放状态，在插件页显示提示。 |
| SDK Full Trust Plugin | `system:full` 授权后加载包内 `trustedEntry`，执行 `activate`、`handle` 和 `dispose`。 |
| ECHO 8-BIT | 从插件页切换音效、应用 NES / Game Boy / Arcade 预设，并在「音色细节」调整声部、硬度、位深和采样保持。 |
| ECHO VOCAL CUT | 从插件页调整消除强度和低频保护。启用时同步调整到 Audio Host，关闭后恢复启用前的音效。 |

`playback:control` 覆盖播放、暂停、停止、跳转、上一首、下一首、音量、速度、随机和循环。
原版插件通过 `playback:read` 读取 `getRate()`。GPUI 会话用一个模式表示顺序、随机、单曲循环和列表循环，
开启随机或循环会选择相应模式。关闭循环会保留已有的随机模式。
`fs:plugin` 提供按插件隔离的 JSON 键值存储。8-BIT 和 VOCAL CUT 的命令需原版 Audio Host
支持 Workshop DSP，且 GPUI 已具备 ECHO Pro DSP 权限。

声明 `audio:output-read` 后，可使用原版 `echo.audio.output.getStatus()`、`listDevices()` 和
`refreshDevices()`。设备索引按每次枚举结果分配。在选取设备时，传入该结果里的 `index` 和
`name`，宿主会一起校验。声明 `audio:output-write` 后可用 `setOutput(settings)` 切换自动输出、
默认或指定设备、可用的输出模式及延迟档位。手动指定采样率、缓冲帧数和设备音量控制仍需适配。

原版插件可用 `library:read` 读取本机普通歌单的 `echo.library.playlists.getItems(id, { page, pageSize })`，
并用 `library:control` 调用 `removeItems`。原版的 `playlists.delete` 需要单独声明
`library:playlist-delete`，删除的歌单保留在 GPUI 恢复列表里。

原版包沿用 GPUI 的安装版本授权。经典脚本与原生插件在相同权限的 Node 子进程中运行，
只启用自己信任的来源。

原版音源插件可通过 `sources:provide` 和 `contributes.sourceProviders` 声明提供器。启用后在 F4
全局搜索中选择音源，输入关键词、翻页并播放单曲。播放前调用插件的 `resolve`，使用返回的 HTTP(S)
地址。声明 `network:request` 后可用 `echo.network.get(url)` 请求清单 `networkHosts` 中列出的
公共 HTTPS 域名。集合浏览、批量播放、自定义网络请求头和平台登录尚未接入。

原版 `lyrics-style` 包可通过插件页导入 ZIP、清单或目录，也可从 Steam 订阅应用。
GPUI 应用包内可映射的布局、字号、行距、上下文透明度、颜色、背景和逐字高亮设置。
导入会保存当前歌词外观。自定义场景、动效和其他尚未映射的参数会提示为部分应用。

原版「ECHO 网络歌词匹配」可直接安装它的 `content` 目录或工坊下载包，启用后在单曲标签编辑器的
**歌词 → 网络匹配** 查看候选，并选一条应用到当前曲目的曲库歌词。插件页可开关 AMLL TTML、
网易云、QQ 音乐与 LRCLIB。匹配由用户主动触发，提交给插件的是歌曲名、艺人、专辑和时长。
应用候选复用原版歌词解析和现有曲库覆盖，保留原始逐字时间轴及可用的翻译和罗马音。

8-BIT 和 VOCAL CUT 的调参由 GPUI 原生呈现。其他 HTML 面板、播放器栏动作、
命令表单和可信运行时中的专用宿主方法仍需移植。
可以在同一个发行目录中保留原版入口，并添加 `gpui` 字段指向 GPUI 入口。

| 原版入口 | GPUI 对应入口 |
| --- | --- |
| 可信 Node 入口、服务登录和协议解析 | 复用 Node 业务模块，由 `gpui.entry` 接入 `activate`、`handle` 和 `dispose` |
| `panel.html` / `__bridge__.js` | 用 `pages.register` 返回页面数据，用 `handle` 处理按钮和表单动作 |
| `echo.commands.register` | 在 `activate` 中调用 `context.commands.register` |
| 原版宿主命令和事件 | 通过 `context.hostInvoke('host.describe')` 获取能力，按下表迁移调用 |
| 曲库搜索、标签或封面候选 | 按职责使用 `context.sources`、`context.metadata` 或 `context.covers` |

随附的类型声明包含页面、搜索、元数据、封面和跨插件命令的接口。

## 运行与授权

所有可执行插件都需要完整权限授权，包括未声明 `system:full` 的原版经典脚本。
插件以当前用户身份运行，可以访问文件、网络和本机程序。独立进程、环境变量过滤、
内容哈希及 Node `vm` 都不构成系统沙箱。原版 `system:full` 决定是否加载独立的可信入口；
其他原版权限约束宿主 API，不限制进程的系统权限。
安装时 ECHO 将整个包复制到受管理的目录，安装记录和授权可跨重启保留。
再次启用同一份内容会沿用授权。手动导入相同 ID、不同内容的本地包会替换旧版本，
新内容在启用前需要确认。停用后可以撤销授权或移除插件。
可以同时启用多个插件。每个插件的「停止插件」只结束该插件的进程。开发期间可用「临时运行开发包」，
直接从源码目录运行，每次开发会话单独授权；同一会话会自动运行该目录中的后续修改。

入口沿用原版可信插件的生命周期。自定义页面动作由 `handle(request, context)` 处理（也可用默认导出），另可导出 `activate(context)` 和 `dispose(context)`。宿主停止插件时给 `dispose` 最多两秒关闭连接、释放资源或保存插件自己的状态，随后结束进程。
注册了页面时，宿主默认打开第一个页面。旧插件仍可接收 `{method: "page.open", input: null}`。后续的
`request.method` 由插件页面中的动作定义。动作输入包含 `fields`（当前表单值）
和 `data`（动作声明的自定义 JSON）。返回新的页面数据可更新界面，返回
`null` 保留当前页面。异常显示在插件页面。

页面支持 `title`、`description`、`fields`、`actions` 和 `rows`。
字段包含 `id`、`label`、可选的 `value` 和 `secret`。行包含 `title`、
可选的 `detail` 和 `actions`。动作包含 `label`、`method` 和可选的
`input`。所有控件由 GPUI 渲染。结果页最多返回 100 行，单条消息最多 1 MiB。

## 注册页面和搜索源

在 `activate(context)` 注册一次，清单只需提供包和入口信息。

- `context.pages.register(id, {title}, open)` 在侧栏加入页面。宿主调用
  `open({signal})` 获取 GPUI 页面数据。
- `context.sources.registerProvider(id, {title}, {search, resolve})` 在全局搜索加入
  一个可选范围。用户选中它后，`search({query, page, pageSize, signal})` 返回
  `{tracks, hasMore}`。每首歌提供 `providerTrackId`、`title`，也可提供 `artist`。
  页码从 1 开始，结果不得超过请求的页大小。
- 用户选择曲目时，`resolve({providerTrackId, signal})` 返回
  `{title, url, artist?, album?, duration?, cover?, lyrics?, bearer?}`。
  宿主用注册源和曲目标识组成队列身份，并交给现有播放链路。
- 把 `signal` 传给网络请求。改写搜索词、切换范围或关闭搜索时，宿主会取消过期请求。
  注册随插件停止而撤销。

## 注册标签与封面候选

在 `activate` 中用 `context.metadata.registerProvider(id, {title}, lookup)` 或
`context.covers.registerProvider(id, {title}, lookup)` 注册。曲目编辑器查询工坊候选时，
宿主传入 `{track, provider, signal}`，提供者返回 `{candidates}`。元数据候选可包含
`title`、`artist`、`album`、`albumArtist`、`genre`、`year` 等标签字段。
封面候选提供 HTTPS 的 `imageUrl`。每个提供者有 2.5 秒响应时间，最多提交 12 个候选。

## 跨插件命令

插件在 `activate({commands})` 中用 `commands.register(id, {title}, handler)`
注册可供其他已启用插件调用的命令。命令用插件 ID 和命令 ID 定位，
所以不同插件可以使用相同的命令 ID。清单中无需再声明一次。

```js
export function activate({ commands }) {
    commands.register('format-title', { title: 'Format title' }, (input, { callerPluginId }) => ({
        title: String(input.title).toUpperCase(),
        callerPluginId,
    }));
}
```

其他插件通过 `await context.commands.list()` 查看当前可用的
`{pluginId, commandId, title}`，再调用
`await context.commands.invoke('community.formatter', 'format-title', {title: 'Echo'})`。
参数和返回值是 JSON。处理器会收到宿主提供的 `callerPluginId` 和用于取消的 `signal`。
插件停止后，其命令随页面和搜索源一起撤下。跨插件调用超时为八秒；
循环依赖会返回 `workshop-command-cycle`，目标不可用会返回 `workshop-command-unavailable`。

## 调用 ECHO

`context.hostInvoke(method, input)` 返回 Promise。`context.onEvent(handler)`
接收 `(event, value)` 并返回取消订阅函数。包目录和插件 ID 分别由
`context.contentRoot` 和 `context.pluginId` 提供。将账号配置和缓存写到
`context.dataRoot`。已安装包的内容在启动前会校验，插件数据目录则按 ID 保留，
包括更新和卸载后重新安装。开发会话的临时数据跨重载保留。

新项目可以直接使用生成的 `echo-workshop.d.ts`。下面的调用会读取本地歌单第一页，并保存最近选中的歌单。

```js
const { entries, hasNext } = await context.library.playlists({ page: 1 });
const playlist = entries[0];
if (playlist) {
    const { entries: tracks } = await context.library.playlistTracks(playlist.id);
    await context.storage.set('last-playlist', playlist.id);
    await context.library.playPlaylist(playlist.id, { trackId: tracks.find(track => track.playable)?.id });
}
```

| SDK 接口 | 用途 |
| --- | --- |
| `context.library` | `query` 分页浏览曲库，`track` 按 ID 读取曲目，`playlists` 和 `playlistTracks` 读取歌单。`playPlaylist` 可从指定曲目播放，`queuePlaylist` 将歌单追加到队列。`createPlaylist`、`setPlaylistTracks` 和 `setLiked` 编辑本机歌单与收藏。 |
| `context.playback` | `get` 读取播放状态，`getCurrentTrack` 读取当前曲目标识，`onChanged` 订阅播放状态。用 `control` 控制播放，`setMode` 设置播放模式，`getLyrics` 读取当前歌词。 |
| `context.audio` | `onAnalysis` 订阅本机播放输出的频谱和电平，`output.getStatus` 读取输出状态，`output.listDevices` 枚举本机输出设备。 |
| `context.queue` | `get` 分页读队列，`edit` 调整队列，`submit` 播放或加入曲库曲目与在线流。 |
| `context.storage` | `get`、`set`、`remove` 读写插件自己的 JSON 数据，总容量 512 KiB，适合设置与小型缓存。 |
| `context.credentials` | `get`、`set`、`remove` 使用系统凭据存储保存令牌等字符串，每项最多 4 KiB。已安装插件按数据目录和键隔离凭据。 |

插件可以用专辑、艺人和收藏列表构建自己的曲库页面。列表和详情使用同一个分页格式，
页码从 1 开始，按 `hasNext` 读取后续页。用列表返回的 `id` 打开对应详情，并在每次调用中传入相同的 `source`。

```js
const source = 'Local';
const { entries: [artist] } = await context.library.artists({ source, search: 'Echo' });
if (artist) {
    const { entries: [album] } = await context.library.artistAlbums(artist.id, { source });
    if (album) {
        const tracks = await context.library.albumTracks(album.id, { source, page: 1 });
        // 用 tracks.entries 渲染曲目，按 tracks.hasNext 决定是否显示下一页。
    }
}
```

`albums`、`artists`、`likedTracks` 和 `likedAlbums` 接受可选的 `source`、`page` 和 `search`。
`albumTracks`、`artistTracks` 和 `artistAlbums` 还需要父条目 ID。用 `setAlbumLiked(id, liked, source)`
设置专辑收藏，`source` 默认是 `Local`。`renamePlaylist(id, title)` 使用本机歌单 ID。
为旧版宿主分发时，可用 `context.library?.albumTracks` 检查 SDK 入口，或用 `host.describe` 检查新增命令。

### 听歌历史、个人标签和智能歌单

- `context.history.list({ page, search, range, category, counted })` 分页返回历史条目，可按日期范围、名称或类别筛选。继续翻页时传入上次返回的 `snapshot`，避免新播放记录把前一页的条目推到下一页。切换筛选条件时从第一页读取新快照。`Day` 使用 `from`，`Custom` 使用 `from` 和 `to`，日期格式为 `YYYY-MM-DD`。有 `trackId` 的记录可用同一个 `source` 调用 `library.track`，或交给 `queue.submit`。
- `context.library.tags.list({ page, target })` 返回本机个人标签。传入 `{ kind, id }` 则同时返回该条目是否已贴标签。`tags.items(tagId, 'track' | 'album' | 'artist', page)` 按条目类型分页。`tags.change` 支持 `create`、`rename`、`assign` 和 `delete`。创建返回 `{ id }`，重命名保留 ID，删除同时移除该标签的所有关联。已有专辑标签可直接读写。也可在 `library.query` 中传入 `options: { filters: [{ PersonalTag: tagId }] }`，并选择对应的曲库分类。
- `context.library.smart.preview(rules, page)` 按 GPUI 的规则引擎分页预览本机曲目。`smart.create(title, rules)`、`smart.update(id, title, rules)` 和 `smart.rules(id)` 保存或读取规则。保存后可用 `library.playlistTracks` 浏览，用 `playPlaylist` 或 `queuePlaylist` 播放。`smart.freeze(id)` 把当前规则结果复制到一个普通歌单。`smart.rules` 还可传入 `'Legacy'` 读取原 ECHO 歌单规则。

```js
const { history, library } = context;
const recent = await history.list({ range: 'Week', counted: true });
const next = recent.hasNext
    ? await history.list({ range: 'Week', counted: true, page: recent.page + 1, snapshot: recent.snapshot })
    : null;

const rules = { filters: { liked: true, unplayed: true }, match: 'all', sort: 'recentlyAdded', limit: 50 };
const preview = await library.smart.preview(rules);
// 用 recent.entries 和 preview.entries 渲染页面。用户确认后再调用 library.smart.create(title, rules)。
```

这些入口可通过 `host.describe` 查询。命令前缀分别是 `history.list`、`library.tags.*` 和 `library.smart.*`。

### 流派、曲库详情和听歌回顾

- `library.genres({ source, parent, search, page, pageSize, sort, chinese })` 返回流派和曲目、专辑数量，每页最多 24 项。传入流派 ID 作为 `parent` 可浏览其子流派，并通过 `summary` 读取当前流派。用 `genreTracks(id, { source, page, search })` 或 `genreAlbums(id, { source, page, search })` 打开对应的曲库列表。
- `library.facets(facet, source)` 提供曲库筛选器的年、年代、原始流派标签、作曲、指挥和演奏选项。返回的年份和年代是字符串，用于 `library.query` 的 `Year` 和 `Decade` 筛选时转成数字。
- `library.albumDetails(id, source)` 提供碟号、时长、年份、流派、收藏和评分等信息。`library.artistDetails(id, source)` 提供艺人曲数、专辑数、听歌统计、人气曲目和相关艺人。
- `history.review({ source, range, from, to, counted, search, snapshot })` 返回当前周期与上一周期统计、活动序列和曲目、艺人、专辑榜。对照周期在指定时间范围时可用。活动较长时按月聚合，`date` 会返回 `YYYY-MM`。

```js
const { library, history } = context;
const { entries: [genre] } = await library.genres();
const albums = genre ? await library.genreAlbums(genre.id) : null;
const review = await history.review({ range: 'Month' });
```

### 订阅变化与刷新页面

- `library.onChanged(handler)` 接收 `{ source, revision }`。本机和已配置的原版曲库分别报告 SQLite 提交版本，适合用作重新读取的信号。
- `playback.onTrackChanged(handler)` 接收当前曲目的标题、艺人和可用的曲库 ID。每次开始新的播放实例都会更新 `sequence`，即使再次播放同一首。没有选中的曲目时会收到 `null`。
- `queue.onChanged(handler)` 接收 `{ queueId, position, total }`。队列内容、顺序或当前位置变化时，可以用收到的 `queueId` 调用 `queue.get`。

订阅会收到初始状态，后续变化约每 500 毫秒合并一次。每个订阅返回取消函数。通用的 `context.onEvent` 继续支持 `playback.changed`，也会收到通过上述方法开启的事件。用 `host.describe` 可以查询事件名称。

```js
const stops = [];

export function activate({ library, playback, queue, pages }) {
    const refresh = () => pages.invalidate();
    stops.push(
        library.onChanged(({ source }) => { if (source === 'Local') refresh(); }),
        playback.onTrackChanged(refresh),
        queue.onChanged(refresh),
    );
    pages.register('library', { title: '我的曲库' }, async () => {
        const { entries } = await library.query();
        return { title: '我的曲库', rows: entries.map(track => ({ title: track.title, detail: track.subtitle })) };
    });
}

export function dispose() {
    for (const stop of stops) stop();
}
```

`pages.invalidate()` 请求重新读取这个插件当前打开的页面。宿主合并短时间内的请求，等现有页面操作完成后再读取。在事件回调中调用它，并让页面读取函数直接返回当前数据。

### 编辑与恢复歌单

`library.updatePlaylist(id, { title, description })` 可只传名称或简介之一。未传字段保持原值，
简介传空字符串可清空。`library.movePlaylistTrack(id, trackId, position)` 将歌曲移到手动排序歌单中的
指定位置，序号从 1 开始。两项操作都使用本机曲库 ID。

`library.playlistItems(id, { page, pageSize })` 按本机普通歌单的存储顺序读条目。
页码从 1 开始，一页最多 100 项。条目的 `position` 从 0 开始，未匹配项的 `track` 为 `null`。
`library.removePlaylistItems(id, itemIds)` 使用上面返回的条目 ID，每次最多移除 200 项。
任一条目无效时，整批操作会失败。成功时返回 `{ affectedCount, recoveryId }`，可用
`restorePlaylistRecovery({ kind: 'items', id: recoveryId })` 恢复这次移除。

`library.archivePlaylist(id)` 将歌单移入恢复列表。用 `library.playlistRecovery(page)` 分页读取本机
恢复记录，并将选中的记录传给 `library.restorePlaylistRecovery(record)`，记录的 `kind` 和 `id`
共同定位恢复项。桌面端可恢复已归档的歌单、曲目变更或云端快照。离线预览提供一个示例歌单。

### 播放输出

`context.playback.getRate()` 读取当前速度。`setRate(rate)` 接受 0.5 到 2 倍，并返回应用的速度，
以百分之一倍为单位。`seekBy(seconds)` 可传正数快进或负数快退。
`setShuffle(enabled)`、`toggleShuffle()`、`setRepeat('off' | 'one' | 'all')` 和 `cycleRepeat()`
可修改当前播放模式，重复切换顺序为关闭、列表循环、单曲循环。音频输出对速度的限制沿用播放会话。

`await context.playback.getCurrentTrack()` 与 `onTrackChanged` 返回相同结构。没有当前曲目时返回
`null`。曲库歌曲带有 `catalog.source` 和 `catalog.id`，可用来查询曲库详情。临时文件和直链播放
可直接显示 `title` 和 `artist`。

`context.playback.onChanged(listener)` 先提供当前快照，后续变化最多每 500 毫秒上报一次。
用返回的取消订阅函数结束监听。只需要知道曲目是否切换时，订阅 `onTrackChanged`。

`context.audio.output.getStatus()` 返回 `route`（本机、DLNA 或 HQPlayer）、配置 `configured`
和 Audio Host 实际报告的本机输出 `active`。例如用户配置的是系统默认设备，实际打开的设备名称
可从 `active.name` 读取。没有本机输出读数时，`active` 为 `null`。
`context.audio.output.listDevices()` 在后台探测本机设备，适合在用户打开设备列表或点刷新时调用。
专用后端设备附带 `dedicatedMode`，设备探测失败时调用会抛错。

在用户主动选择输出时，可调用 `context.audio.output.setOutput(change)`。传
`{target: {kind: 'device', id}}` 选择设备，`{target: {kind: 'systemDefault'}}` 使用系统默认设备，
或传 `{target: {kind: 'automatic'}}` 恢复自动输出。手动设置可附带 `mode` 和 `latencyProfile`。
只设置模式或延迟时会沿用当前设备并切换到手动配置。宿主会核对设备和后端，
成功后返回应用的配置。DLNA 和 HQPlayer 播放期间，修改的是之后使用的本机输出配置。

```js
const { commands } = await context.hostInvoke('host.describe');
if (commands.includes('audio.output.getStatus')) {
    const { configured, active } = await context.audio.output.getStatus();
    console.info(configured.mode, active?.name, active?.hardwareSampleRate);
}
```

### 播放频谱和电平

GPUI 原生 JavaScript 插件可以用 `context.audio.onAnalysis(listener)` 订阅现有 Audio Host 播放输出的分析数据。
通过 `host.describe` 的 `events` 检查 `audio.analysis`，或使用可选链兼容旧版 GPUI。

```js
let stopAnalysis;
let reading = null;

export function activate({ audio, pages }) {
    pages.register('meter', { title: '播放电平' }, () => ({
        title: '播放电平',
        rows: [
            { title: 'Peak', detail: dbfs(reading?.peakDbfs) },
            { title: 'RMS', detail: dbfs(reading?.rmsDbfs) },
        ],
    }));
    stopAnalysis = audio?.onAnalysis(frame => {
        reading = frame;
        pages.invalidate();
    });
}

export function dispose() {
    stopAnalysis?.();
}

function dbfs(value) {
    return value == null ? '—' : `${value.toFixed(1)} dBFS`;
}
```

每个订阅先收到当前读数，变化时最多每 500 毫秒更新一次。`sequence` 与 `playback.onTrackChanged` 的播放序号一致。
`spectrum` 以从低到高的顺序提供 0 到 1 的可视化频带，数量随宿主输出而定，可以为空。
`peakDbfs` 和 `rmsDbfs` 分别取各声道中最高的读数，缺少电平数据时为 `null`。
暂停、待播、读数过期或输出未提供分析数据时，整个帧为 `null`。该接口提供现有的播放测量和可视化值，供低频刷新页面使用。
调用返回的取消函数、停用插件或运行进程退出时会释放订阅。多个插件共享同一份宿主读数。

可直接安装[实时曲库示例](live-library/echo.workshop.json)。用「插件 → 已安装 → 安装」选择清单，启用后打开「实时曲库示例」。页面显示当前曲目、队列长度和本机曲库版本，并提供播放、加入队列与收藏操作。切歌或改变队列、收藏状态后，页面会重新读取和显示最新数据。

| 命令 | 输入与行为 |
| --- | --- |
| `host.describe` | 查询协议版本、当前支持的命令和事件、队列容量 `queueCapacity` 和单次提交上限 `maxQueueItems`。 |
| `library.query` | 使用 `source`（`Local` 或 `Legacy`）、`category`（如 `Songs`）、`search`、`page` 查询曲库。页码从 1 开始，结果包含 `entries` 和 `hasNext`。 |
| `library.albumTracks`、`library.artistTracks`、`library.artistAlbums` | 传入父条目 `id` 和可选的 `source`、`search`、`page`，返回曲目或专辑页。 |
| `library.track`、`library.playlistTracks`、`library.playPlaylist`、`library.queuePlaylist` | 传入 `id` 和可选的 `source`。读取歌单曲目可传 `page`，播放歌单可传 `trackId`。 |
| `library.createPlaylist`、`library.setPlaylistTracks`、`library.setLiked` | 本机曲库写入。创建传入 `title` 和可选的 `tracks`，返回 `{id}`。更新歌单成员传入 `id`、`tracks` 和 `present`，更新收藏传入 `id` 和 `liked`。一次最多处理 256 首曲目。 |
| `library.renamePlaylist`、`library.setAlbumLiked` | 重命名传入本机歌单 `id` 和 `title`。设置专辑收藏传入专辑 `id`、`liked` 和可选的 `source`。 |
| `playback.get` | 查询播放状态、曲目、位置、时长、音量和队列位置。订阅 `playback.changed` 接收同结构的更新。 |
| `playback.control` | 使用 `action` 选择 `toggle`、`pause`、`resume`、`previous`、`next`、`stop`、`seek`（加 `seconds`）、`setVolume`（加 0–100 的 `volume`）、`setMode`（加 `mode`，取 `Sequential`、`Shuffle`、`RepeatOne` 或 `RepeatAll`）。 |
| `credentials.get`、`credentials.set`、`credentials.remove` | 传入 `key`，保存时同时传入 `value`。 |
| `queue.get` | 分页查询队列，每页最多 256 首。结果含 `queueId`、`position`、`offset`、`total`、`hasNext` 和 `items`。后续页可传入 `offset`（上一页的 `offset` 加上 `items.length`）和 `queueId`；若队列已更改则重新从第 0 项读取。曲库曲目含 `catalog.source` 和 `catalog.id`。 |
| `queue.edit` | 使用 `queue.get` 返回的 `queueId`，传入 `edit: {action, input}`。动作包括 `remove`、`moveAfterCurrent`（索引数组）、`move`（`{from, to}`）、`setRemoveAfterPlay`（`{indices, enabled}`）、`clear`、`undo`。编辑索引从 0 开始。 |
| `lyrics.get` | 查询正在播放的曲目的歌词行和 `trackOffsetMs`。 |
| `queue.submit` | 使用 `mode`（`play`、`append` 或 `playNext`）和 `tracks` 提交曲目。播放时可用从 0 开始的 `index` 选择起始曲目。 |

`queue.submit` 接受两类曲目：

- `{kind: "catalog", source, id}` 引用宿主曲库。
- `{kind: "stream", id, title, url, artist?, album?, duration?, cover?, lyrics?, bearer?}`
  传入 HTTP(S) 音频流。时长单位为秒，歌词支持 LRC 和纯文本。
  插件内自行完成服务登录与流地址解析。临时 URL 和凭据留在内存中，含临时流的队列
  需要先移除这些流才能保存为队列快照。

播放命令提交到 ECHO 的现有队列。用 `playback.get` 或 `playback.changed`
观察播放结果。
