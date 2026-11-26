# ECHO GPUI Workshop 插件协议 1

[公开 SDK](https://github.com/Moekotori/echo-gpui-workshop-sdk) · [下载](https://github.com/Moekotori/echo-gpui-workshop-sdk/releases/latest) · [反馈与讨论](https://github.com/Moekotori/echo-gpui-workshop-sdk/issues) · [English quickstart](README.en.md)

开发自制播放器、歌单工具或音源服务可从[独立应用 SDK](#独立应用-sdk)开始，示例覆盖[注册能力](#独立应用提供音源和服务)和[实时发现](#订阅可用音源和服务命令)。

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
| [`cover-browser`](cover-browser) | 自己编排封面网格、筛选栏和歌单详情，点击曲目播放，并在独立窗口查看和控制播放队列。 |
| [`live-library`](live-library) | 订阅播放、队列和曲库变化，自动刷新页面。示例支持播放、入队和收藏。 |
| [`stream-library`](stream-library) | 「我的音源」支持添加网络电台和音频直链，编辑地址、按分组浏览，并播放其他插件提供的曲目。 |
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

`init` 使用与 GPUI 相同的示例源码和项目布局，可用 `--template stream-library`、`--template live-library` 或 `--template navidrome`。
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
单独走运行器、网络或主题扩展的能力不在匹配结果里。公开清单的 `original.runnerActions` 也列出已登记的运行器本地动作。

在原版插件中，可调用 `echo.host.getCapabilities()` 读取本插件的动作和授权状态，或使用
`echo.host.getFeatureAvailability('library:playlists:delete')` 检查单个动作。结果分别说明宿主是否实现、
作品是否声明权限、以及当前是否可用。只在 `available` 为 `true` 时显示对应功能。动作仍可能因输入或设备状态失败。

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

### 第三方 MV 来源

用 `node sdk.mjs init my-videos community.yourname.videos --template mv-source` 创建项目。安装并启用后，在「设置 → 歌词设置 → 显示与字体 → MV 来源」选它。打开歌词页的 MV 舞台后，切歌会查询选定来源。「MV 设置」里的「自动匹配」可以关闭；也可以输入关键词搜索，点击候选的「切换」。本地 MV 优先。已批准的安装版本可以恢复，开发会话需重新启动。未选择来源时，用户手动启用只有一个 MV 来源的插件会选中该来源。

在 `activate(ctx)` 中调用 `ctx.mv.registerProvider(id, { title }, { search, resolve, match? })`。插件 ID 和来源 ID 一起标识来源，升级时保持稳定。每次回调都有 `signal`，传给异步请求并在取消时停止工作。

| 回调 | 输入与返回 |
| --- | --- |
| `search` | 接收 `{ track, query, automatic, signal }`，返回最多 24 条候选。每条包含稳定的 `id`、`title`，可附 `artist` 和以秒为单位的 `durationSeconds`。空数组表示无结果。手动搜索只更新候选，选中后才替换视频。 |
| `match`（可选） | 接收 `{ track, signal }`，返回一条确定的候选或 `null`。省略时宿主调用 `search`，仅当曲名和非空艺人都一致且只有一个匹配时自动选用。 |
| `resolve` | 接收 `{ track, candidate, signal }`，返回 `{ url, startSeconds?, quality? }`。认证视频可额外提供 `headers`（`Authorization`、`Referer`、`User-Agent`），仅用于当前视频的上游读取。使用最终 HTTPS 视频直链；服务端需支持字节范围请求并回送 HTTP 206。解码、画面与歌曲时钟同步由宿主处理。 |

[开放视频目录示例](mv-source/plugin.mjs) 内置两条演示片记录，可在插件页面填写自己的 HTTPS JSON 地址。目录格式为 `[{"id":"live","title":"曲名","artist":"艺人","url":"https://media.example.org/live.mp4"}]`，时长可选。示例目录最多 1000 条、256 KiB，缓存一分钟。演示素材为 [MDN Flower](https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4) 和 [Blender Foundation 的 Sintel 预告片](https://media.w3.org/2010/05/sintel/trailer.mp4)。

```sh
node sdk.mjs preview mv-source --mv catalog --track '{"title":"Flower","artist":"MDN"}'
node sdk.mjs preview mv-source --mv catalog --track '{"title":"Flower","artist":"MDN"}' --query sintel --candidate sintel
```

预览输出来源、候选与选中项。请在播放器中核对视频解码和实际同步效果。

#### 有登录和后台任务的 MV 来源

在清单中声明 `gpui.requires.features: ["mv.session"]`，然后用 `ctx.mv.registerSessionProvider(id, descriptor, handlers)` 注册。宿主通过 `observe` 告知当前歌曲、播放状态和匹配偏好，通过 `status` 读取当前视频及候选。插件负责登录、搜索、评分、地址解析和过期续流，并通过 `ctx.credentials` 保存自己的账号会话。请求的第二个参数带有取消信号。

注册返回的 `streams.publish({trackId, url, headers?})` 接收该歌曲的最终 HTTPS 地址，返回可放入 `status.video.url` 的临时中继地址。状态只接受该来源为当前歌曲发布的地址；停用时关闭中继。使用 `streams.accessDenied()` 检查当前视频上游是否拒绝读取，`streams.clear()` 终止当前视频。来源自行限制上游域名，API 登录凭据和播放请求头分别处理。

提供 `login`、`closeLogin`、`logout` 可启用账号控件，扫码链接和提示从 `status` 返回。来源还可提供网页搜索、手动链接、忽略候选、画质切换与播放失败恢复回调。画质选项由 `descriptor.qualities` 声明，全部字段和签名见 [SDK 类型](starter/echo-workshop.d.ts)。

### 自动 LRC 歌词源

用 `node sdk.mjs init my-lyrics community.yourname.lyrics --template lrc-source` 创建项目，也可直接运行 [LRCLIB 示例](lrc-source/plugin.mjs)。支持此接口的宿主在「设置 → 歌词 → 显示与字体」中提供「自动歌词源」。先在「插件」中运行并授权项目，再在设置中选择注册的来源。选择即开启自动匹配；已安装且获准的版本会在下次启动时随选择恢复，开发会话需重新运行。

在 `activate(context)` 中调用 `context.lyrics.registerProvider(id, { title }, async ({ track, signal }) => candidates)`。宿主按插件 ID 和来源 ID 区分来源，更新插件时应保持两者稳定。用曲名、艺人查询自己的目录，将 `signal` 传给网络请求。每个候选使用来源记录的 `title` 和 `artist`。主歌词可用 `syncedLyrics`（LRC）、`karaokeLyrics`（逐字）或 `plainLyrics`，也可附带 `translationLyrics` 和 `romanizationLyrics`。纯音乐返回 `instrumental: true`。有专辑和时长时再给出 `album`、`durationSeconds`。回调的 `automatic` 区分切歌自动查询与手动查找。返回空数组表示无匹配。每次最多接收 24 个候选，每个歌词文本字段上限 512 KiB，候选合计上限 768 KiB。

切到带曲名、艺人和时长且缺少歌词的歌曲时，宿主只查询选定的自动源，评分通过后采用 LRC。已有歌词、手动编辑和纯音乐标记优先。关闭自动网络歌词匹配、停用插件或关闭网络后，自动查询停止。可用 `echo-gpui --workshop test my-lyrics` 确认注册，再用桌面版切歌验证匹配。

### 艺术家头像

在清单的 `gpui.requires.features` 中声明 `"artwork.artistProvider"`，然后在 `activate` 里注册来源。用户在「插件」中运行并授权插件后，宿主会在浏览艺术家列表或打开详情时，为缺头像的条目后台查找。停用插件会停止调用该来源，已经下载的头像会留在曲库缓存中。

```js
export function activate({ artwork, network }) {
    artwork.registerArtistProvider('my-catalog', { title: '我的艺术家头像目录' }, async ({ artist, signal }) => {
        signal.throwIfAborted();
        const { status, body } = await network.request(
            `https://catalog.example.org/artist-portrait?name=${encodeURIComponent(artist.name)}`,
        );
        signal.throwIfAborted();
        if (status !== 200) return null;
        const { name, portraitUrl } = JSON.parse(body);
        return name && portraitUrl ? { artistName: name, imageUrl: portraitUrl } : null;
    });
}
```

回调收到 `{ artist: { id, name, source }, signal }`。`source` 为 `Local` 或 `Legacy`。请返回来源记录的实际艺术家名和公共 HTTPS `imageUrl`，或用 `dataUrl` 提供 PNG、JPEG 图片（图片字节最多 256 KiB）。无法确定身份时返回 `null`。宿主比较去掉首尾空白后的名称，忽略大小写。每个插件最多注册 4 个来源，每位艺术家最多查询 4 个正在运行的来源。已有头像优先，插件补图命中后由宿主缓存。

用 `artwork.artist(id, source?)` 读取已有头像缩略图。结果是 `{ width, height, dataUrl }` 或 `null`，单独调用此方法只读取缓存。仅使用读取接口的插件可在 `gpui.requires.commands` 中声明 `"artwork.artist"`。

使用 `artwork.onArtistChanged(listener)` 在手动换图、恢复默认或插件补图后刷新可见缩略图。事件首次订阅时提供当前 `{ revision }`，之后合并短时间内的更新。`revision` 是字符串，适合做缓存失效标记。清单可在 `gpui.requires.events` 声明 `"artwork.artistChanged"`。

### 播放栏与曲目右键动作

在 `gpui.requires.features` 中声明 `"actions.native"`。在 `activate` 中注册动作，插件运行时，动作进入标准桌面播放栏或单曲右键菜单。界面最多同时显示两个插件播放栏动作、十六个插件右键动作。

```js
export function activate({ actions, playback, library }) {
    actions.registerPlayerBar('bookmark', { title: '标记当前进度' }, async ({ track }) => {
        if (!track?.catalog) return { notice: '请选择可添加书签的本机曲目' };
        await playback.bookmarks.add(track.sequence);
        return { notice: '已添加书签' };
    });

    actions.registerTrackMenu('versions', { title: '检查曲目版本' }, async ({ track }) => {
        const { members } = await library.trackVersions(track.id, track.source);
        return { notice: `版本数：${members.length}` };
    });
}
```

回调收到 `track` 与 `signal`。播放栏动作收到当前播放快照中的曲目或 `null`。右键动作收到选中曲目的 `id`、`source`、`title`、`artist`、`album` 和 `durationSeconds`，可用 `localOnly: true` 采用宿主现有的本机曲目过滤。回调可返回 `{ notice }` 显示提示，或返回 `{ page: 'my-page' }` 打开本插件注册的页面。可用 `node sdk.mjs preview my-plugin --player-action bookmark` 或 `--track-action versions` 调用单个动作。离线数据支持读取，包含写入的动作可在实际宿主验证。

### 自定义主窗口底栏

在 `gpui.requires.features` 添加 `"playerBar.layout"`，在 `activate` 中调用 `playerBar.registerLayout(id, { title, items })`。用户启用插件后，可以在 **设置 → 外观 → 底栏布局** 选用该布局。外观样式、进度样式和内置控件继续使用宿主设置及播放状态。带有顶部进度样式的 `seek` 在指定位置显示时间，滑轨仍在底栏上沿。

- 按 `items` 的顺序从左到右放置 `track`、`previous`、`playPause`、`next`、`seek`、`like`、`lyrics`、`queue`、`volume`、`connect` 或 `spacer`。每项写为 `{ type: 'track' }` 这样的对象。每个布局必须包含一个 `playPause`，同一个控件或动作只放一次。每个插件至多注册 4 个布局，每个布局至多放置 12 项。
- 用 `{ type: 'action', id: 'my-action' }` 放置通过 `actions.registerPlayerBar` 注册的本插件动作。动作可指定 `icon` 为 `listMusic`、`bookmark`、`heart`、`radio`、`clock` 或 `star`，也可用 `layoutOnly: true` 只在布局明确引用时显示。自定义布局按声明的位置显示动作。
- 宿主记住选择，下次启动时恢复已授权的已安装插件。窗口空间不足或插件不可用时使用内置布局。歌词舞台、迷你播放器和大屏各自保留自己的底栏。

完整的 [Studio 底栏示例](player-bar/plugin.mjs) 可导入或发布。运行 `node sdk.mjs preview player-bar --player-layout studio` 检查注册结果，或用 `--player-action now-playing` 验证按钮回调。画面与实际控件交互可在 ECHO GPUI 中查看。

### 自由编排原生页面

在「插件 → 创作 → 临时运行开发包」中选择[唱片架清单](cover-browser/echo.workshop.json)。样例从当前曲库读取歌单，使用包内的唱片封套插画。点封面查看曲目，点「播放」向当前队列提交曲目。没有歌单时会显示空状态。

```sh
node sdk.mjs init my-shelf community.my-shelf --template cover-browser
node sdk.mjs preview my-shelf --action page.action.open
```

在清单的 `gpui.requires.features` 中声明 `"pages.layout"`。页面仍由 `pages.register()` 注册，动作仍可返回新页面或用 `pages.invalidate()` 刷新。返回 `layout` 后，插件负责组织整个内容区，宿主提供页面标题、返回入口和滚动。表单定义放在 `fields`，通过 `{ type: 'field', id }` 指定它的位置。省略 `layout` 继续使用原来的页面格式。

- `layout.body` 是可嵌套的节点树。行、列和可点击容器可设置间距、内边距、宽度、伸展、对齐、圆角和背景色。文字支持主题角色，也可指定字号和颜色。按钮与整块封面都能调用插件动作；`pageLink` 打开本插件注册的页面。普通页面进入主窗口的导航历史，独立窗口在桌面打开。
- `layout.grid` 接收 `minItemWidth`（64–1200 逻辑像素）和最多 256 个节点。窗口宽度决定列数，GPUI 按可见行创建控件。插件负责按页向来源取数。在切换筛选、分页或详情时改变 `layout.key` 可回到顶部。
- `layout.images` 按名称复用 PNG、JPEG 的 base64 data URL。图片节点引用名称、指定高度，可选择完整显示或裁切并提供 `alt`。单图边长最多 2048 像素，每页最多 64 张、总计 8,388,608 像素，协议单条消息仍为 1 MiB。使用缩略图，只发送当前页需要的图片。
- 每页最多 2048 个节点、12 层。字段引用须存在且在同一布局里只出现一次。可点击容器的子节点只放展示内容。完整节点和样式类型见 [WorkshopNode](starter/echo-workshop.d.ts)，筛选、翻页、空状态与返回逻辑见[示例源码](cover-browser/plugin.mjs)。

### 打开独立窗口

在清单的 `gpui.requires.features` 中加入 `pages.window`。将 `window` 写进页面描述后，用户可从插件入口或 `pageLink` 打开它。再次打开同一页面会聚焦已有窗口。每个窗口拥有自己的输入框、滚动位置和请求，与主页面共用插件进程及已授权的 SDK。

```js
pages.register('queue', { title: '播放队列', window: { width: 560, height: 460 } },
    async ({ windowId }) => {
        const { total } = await queue.get();
        return { title: '播放队列', description: `共 ${total} 首` };
    });
queue.onChanged(() => pages.invalidate('queue'));
// 在主页面的 layout.body 或其 children 中放置这个节点
const queueLink = { type: 'pageLink', page: 'queue', label: '打开队列窗口' };
```

`window: {}` 的默认初始尺寸为 720 × 520 逻辑像素。宽度范围为 240–1920，高度为 160–1200，每个插件最多注册 16 个窗口页面。打开和动作回调都收到 `windowId`，独立窗口为注册 ID，主页面为 `null`。用 `pages.invalidate(id)` 请求刷新指定页面，用 `pages.invalidate()` 刷新所有打开的页面。用户可单独关闭、重开窗口；停用插件时，宿主关闭其窗口。离线运行 `node sdk.mjs preview my-shelf --page queue --action page.action.toggle` 可检查页面及动作返回值。

### 自定义插件页面和交互

在 `activate` 中用 `context.pages.registerAction(id, handler)` 注册动作。它返回可直接填到按钮、行操作或控件 `commit.method` 的方法名。回调收到当前表单的 `fields`（字符串键值）、按钮的 `data` 和取消信号 `signal`。返回新页面即可更新显示，返回空值可保持当前页面。需要持久化时调用 `context.storage.set`。已有的 `handle(request, context)` 动作仍然可用。

| 页面字段 | 写法与交互 |
| --- | --- |
| `headerActions`、`actions`、`rows[].actions` | 分别在页首、表单下方和列表行放置动作。 |
| `fields[].control.kind: 'choice'` | 设置 1–16 个 `{ value, label }` 选项，字段初始值取其中一个字符串。 |
| `'toggle'` | 初始值为字符串 `'true'` 或 `'false'`。可设 `commit: { method, input? }` 在切换时提交。 |
| `'range'` | 设置 `min`、`max`、`step` 和可选的 `unit`；初始值为范围内的数字字符串。可设 `commit` 在松开滑杆或键盘调整后提交。 |
| `advancedFieldsLabel` | 提供折叠区标题，把对应字段标记为 `advanced: true`。普通文本和密码输入仍使用 `fields`。 |

[LRCLIB 示例](lrc-source/plugin.mjs)用同一套 API 实现查询格式、候选数和纯音乐选项。下面的命令在同一个临时会话里保存设置并实际向 LRCLIB 发起查询，输出包含生效的页面值和候选。省略 `--automatic` 可模拟手动查找。

```sh
node sdk.mjs preview lrc-source --action page.action.save --fields '{"limit":"2","format":"fallback","instrumental":"false"}' --lyrics synced --automatic --track '{"title":"Space Oddity","artist":"David Bowie","durationSeconds":315}'
```

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
- **Steam 创意工坊** · 连接 Steam，打开「插件 → 创作 → 选择项目文件夹」，选中 SDK 项目即可发布。正在调试的项目也可以点项目行的上传按钮。已有 ZIP 或清单可点「选择 ZIP 或清单」。
  首次发布时会读取项目根目录或包内的 `preview.png`、`preview.jpg`、`preview.jpeg` 或 `preview.gif`（小于 1 MiB）。没有预览图时会提示选择，然后确认可见范围。
  更新时递增清单版本并保留插件 ID。在保有发布记录的本机使用同一 Steam 账号，核对弹窗中的作品编号，点「更新内容」即可沿用原预览图和可见范围。也可以在弹窗里更换两者。
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

[原版 API 2 扩展与 osu! 示例](original/README.md)提供可信网页、谱面导入、Steam 状态、PNG 导出、
系统凭据、原生面板与歌曲菜单和底栏入口的类型及打包方式。

原版 API 2 音源包通过 `contributes.sourceProviders` 声明音源，以同一 ID 调用
`echo.sources.registerProvider` 注册搜索和解析。包声明 `sources:provide`、`sources:direct`
和 `system:full` 并提供 `trustedEntry` 时，宿主将解析请求发给可信入口的
`sources:resolve`，输入包含 `providerId`、`providerTrackId` 和 `needArtwork`。
返回值须包含 `url`，可包含 `coverUrl`、`followStreamRate` 和 `lyricsProvider`。插件 ID 可自定。

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

原版插件声明 `library:read` 后，可查询曲目、专辑、艺人和流派，也能通过这些 ID 查询关联曲目或专辑。
查询支持 `page`、`pageSize`、搜索、常用排序与格式筛选。GPUI 返回本机索引的元数据；远端提供器查询和
未映射的筛选选项会报错。收藏的歌曲和专辑可分页读取，`favorites.setTrack` 和 `setAlbum` 使用 `library:control`。
批量读取曲目与收藏状态可用 `getTracksByIds` 和 `getLikedTrackIds`，每次最多传 200 个曲目 ID。

原版插件声明 `queue:read` 后，可读 `queue.get()` 或 `queue.getPage()`。翻页时传入首次读取的
`sessionId` 与 `revision`，队列变化会返回过期错误。`queue:control` 可按条目 ID 点播、移动、移除、
按完整队列重排或清空，也可点播曲目和入队。点播专辑、艺人、流派、歌单或收藏会使用首批最多 100 个条目。

旧插件可用 `echo.events.on(name, handler)` 订阅下列事件，调用返回的函数可取消订阅。
已授权事件可从 `echo.host.getCapabilities().events` 读取（先等待调用结果）。

| 原版事件 | 所需权限 |
| --- | --- |
| `playback:status`、`playback:clock` | `playback:read` |
| `queue:changed` | `queue:read` |
| `library:changed`、`library:liked-changed` | `library:read` |
| `audio:spectrum` | `audio:spectrum` |
| `sleep-timer:tick` | `sleep-timer:control` |

这些状态以 500 毫秒节奏合并。收藏事件报告本机收藏变更，频谱使用 Audio Host 上报的频带。
`library.onChanged` 和 `library.favorites.onChanged` 也可直接使用。

原版插件可用 `library:read` 读取本机普通歌单的 `echo.library.playlists.getItems(id, { page, pageSize })`，
并用 `library:control` 调用 `removeItems`。原版的 `playlists.delete` 需要单独声明
`library:playlist-delete`，删除的歌单保留在 GPUI 恢复列表里。
同一接口组的 `list` 和 `get` 可读取本机歌单资料，`create` 可带简介创建，`update` 可修改普通歌单的名称、
简介和排序。用 `addTracks` 在歌单首部添加原来没有的曲目，返回本次新增条目。旧的顶层方法名也可使用。
手动排序时可用 `moveItem(playlistId, itemId, position)` 移动指定条目，位置从 0 开始。
大量歌单请用 `playlists.list` 分页，条目接口按存储顺序返回。
原版智能歌单可用 `playlists.getRules`、`previewRules`、`createSmart`、`updateRules` 和 `freeze`。
读取和预览需要 `library:read`，创建、更新和固定需要 `library:control`。路径和文件夹规则另需
`library:path`。新版宿主支持本机跳过次数和最后跳过时间。

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

- `context.pages.register(id, {title}, open)` 在侧栏加入独立页面。点击后，宿主调用
  `open({signal})` 获取页面数据，并在主内容区渲染。一个插件可以注册多个不同 ID 的页面，
  用户可在侧栏切换，也可用返回和前进再次打开。
- `context.sources.registerProvider(id, {title}, {search, resolve})` 在全局搜索加入
  一个可选范围。用户选中它后，`search({query, page, pageSize, signal})` 返回
  `{tracks, hasMore}`。每首歌提供 `providerTrackId`、`title`，也可提供 `artist`。
  页码从 1 开始，结果不得超过请求的页大小。
- 用户选择曲目时，`resolve({providerTrackId, signal})` 返回
  `{title, url, artist?, album?, duration?, cover?, lyrics?, bearer?}`。
  宿主用注册源和曲目标识组成队列身份，并交给现有播放链路。
- 把 `signal` 传给网络请求。改写搜索词、切换范围或关闭搜索时，宿主会取消过期请求。
  注册随插件停止而撤销。

### 让其他插件使用你的音源

播放器、歌单工具和独立窗口可以用同一套接口访问已启用的音源。在清单的 `gpui.requires.features` 加入 `"sources.catalog"`。打开「我的音源 → 浏览已启用音源」可以实测提供方和消费方的交互。

```js
async function appendFirstMatch({ sources, queue }, source, query) {
    const page = await sources.search(source, query, { page: 1, pageSize: 12 });
    if (page.tracks.length) {
        await queue.submit({ mode: 'append', tracks: [{ kind: 'source', source, track: page.tracks[0] }] });
    }
}
```

- 用 `await sources.list()` 取得用户已启用的来源。每项含 `plugin`、`provider`、`title` 和 `browse`。用前两个字段定位来源。仅实现搜索的旧提供方仍可被发现和查询。
- 在提供方的 `{search, resolve}` 中加入可选的 `browse({collectionId, page, pageSize, signal})`。首次浏览传入 `null`，后续传入之前返回的集合 ID。返回 `{tracks, collections, hasMore}`，集合形如 `{kind: 'album' | 'playlist' | 'folder', id, title}`。每页曲目与集合共计最多 24 项，按请求的页大小返回。
- 在消费方用 `sources.browse(source, null, options)` 展示根目录，用 `sources.browse(source, collection.id, options)` 打开集合。曲目可提交到 `play`、`append` 或 `playNext`。目录和队列只需稳定 ID、标题及可选的艺人、专辑和时长（秒）。
- 播放会话在需要播放源曲目时调用提供方的 `resolve`。公开目录结果与队列快照都不带播放 URL 或 bearer。将签名地址和鉴权留在 `resolve`，在恢复队列时启用相同提供方并保持曲目 ID 稳定。

### 在独立 Core 播放

桌面连接同版本的本机独立 Core 后，启用音源插件即可共享它的目录和当前登录会话。连接同一个 Core 的其他播放器和歌单工具也能用 `sources.list/search/browse` 发现它，通过 `queue.submit` 向自己连接的播放区点播、插播或追加曲目。桌面退出或插件停用时，该来源撤销注册。重新启用同一来源后可重播队列中原有的曲目。

要关闭桌面后继续播放新曲目，可让 Core 自己运行音源。在 Core 数据库旁的 `workshop` 目录中安装并授权所需版本，先停止桌面中该插件的实例，再启动 Core。例如已录入的「我的音源」可直接使用已安装插件的数据：

```sh
echo-server --local-core --database /path/to/library.sqlite --workshop-source community.stream-library
```

每个音源插件使用一个 `--workshop-source` 参数。Core 核对已安装版本的授权和内容指纹，使用该插件已有的私有数据。需要登录的服务应在启动时恢复自己的凭据；仅存于桌面内存的登录会话随桌面退出而结束。

## 检查和补全本地曲库

[曲库补全插件](library-enrichment/README.md)演示独立页面如何组合分页检查、在线候选、预览与用户确认后的写入。宿主声明 `library.enrichment` 和 `network.request`。

- `library.enrichment.scan(after?)` 按曲目 ID 返回最多 24 首本地曲目，`next` 是下一页的独占游标，`null` 代表结束。结果包含缺项、文件可用性和标签是否可写。扫描支持全库遍历，可在分页间隔停止。
- `library.enrichment.fillTags(trackId, { tags, coverUrl })` 接受 `[字段, 值数组]` 及公共 HTTPS 封面地址。宿主在写入时再核对空字段及现有封面，并与标签编辑器共用文件版本校验和写入队列。返回 `fields`、`cover`、`queued` 和原版同步状态。
- `lyrics.fillMissing(trackId, providerLyrics)` 接受普通歌词、逐行或逐字歌词、翻译、音译及纯音乐标记。宿主只在没有本地歌词或显式覆盖的情况下保存，结果与歌词界面共用。
- `artwork.previewUrl(url)` 把公共 HTTPS 图片转换为页面可用的缩略图。解码失败返回 `null`。
- `network.request(url, { headers, body })` 使用宿主的网络设置。仅接受公共 HTTPS 域名和同域重定向，返回 UTF‑8 `{ status, url, body }`。默认 GET，有文本 `body` 时使用 POST。请求体上限 64 KiB，响应体上限 512 KiB。支持 Accept、Accept-Language、Content-Type、Referer、Origin、User-Agent。

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
接收 `(event, value)` 并返回取消订阅函数。同一个回调串行运行。等待期间，同类状态只保留最新值，曲库变化按来源分别保留。包目录和插件 ID 分别由
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

`library.playlistSummaries({ search, page, pageSize })` 按名称筛选并分页读取本机歌单，
`library.playlistSummary(id)` 读取单个歌单的名称、简介、条目数和排序。
`library.createPlaylistWithDetails({ title, description })` 一次保存名称和简介。
`library.prependPlaylistTracks(id, trackIds)` 将新曲目放在普通歌单首部，保留原有条目相对顺序，
返回本次实际新增的条目。如果某个曲库 ID 无效，整批写入会被拒绝。

`library.updatePlaylist(id, { title, description })` 可只传名称或简介之一。未传字段保持原值，
简介传空字符串可清空。`library.movePlaylistTrack(id, trackId, position)` 将歌曲移到手动排序歌单中的
指定位置，序号从 1 开始。两项操作都使用本机曲库 ID。

`library.playlistItems(id, { page, pageSize })` 按本机普通歌单的存储顺序读条目。
页码从 1 开始，一页最多 100 项。条目的 `position` 从 0 开始，未匹配项的 `track` 为 `null`。
用 `library.movePlaylistItem(id, itemId, position)` 移动手动排序歌单的任意条目，包括待匹配项。
传入 `playlistItems` 给出的条目 ID 和从 0 开始的目标位置。
`library.removePlaylistItems(id, itemIds)` 使用上面返回的条目 ID，每次最多移除 200 项。
任一条目无效时，整批操作会失败。成功时返回 `{ affectedCount, recoveryId }`，可用
`restorePlaylistRecovery({ kind: 'items', id: recoveryId })` 恢复这次移除。

`library.archivePlaylist(id)` 将歌单移入恢复列表。用 `library.playlistRecovery(page)` 分页读取本机
恢复记录，并将选中的记录传给 `library.restorePlaylistRecovery(record)`，记录的 `kind` 和 `id`
共同定位恢复项。桌面端可恢复已归档的歌单、曲目变更或云端快照。离线预览提供一个示例歌单。

### 迁移前检查原版插件

```sh
node sdk.mjs check-original ./my-original-plugin --action library:getTracks --event playback:status
node sdk.mjs check-original ./my-original-plugin/content/community.echo --json
```

可传入原版项目目录、`echo.workshop.json`、内部 API 2 清单或 `.echo` 包。
传工坊清单时会校验入口包的大小和 SHA-256。`--action` 和 `--event` 可重复使用，
用于核对计划保留的调用是否声明了所需权限。清单未收录的名称会显示警告，
有错误时退出码为 1，`--json` 可输出结构化结果供 CI 读取。检查只读取包元数据，
运行行为可用 GPUI 的 `--workshop test` 验证。

### 本机曲库详情与规则搜索

用 `context.library.summary()` 读取本机曲库汇总，用 `album(id)`、`albumForTrack(trackId)`
或 `artist(id)` 按 ID 读详情。`albumFavoriteStates(ids)` 一次查询最多 200 张专辑的收藏状态，
不存在的专辑返回 `false`。

`context.library.searchTracks(rules, { page, pageSize })` 用智能歌单规则查询曲目，返回
`{ items, page, pageSize, total, hasMore }`。页码从 1 开始，每页最多 100 首，范围覆盖规则匹配的全部曲目。
可用已安装的 GPUI 宿主在自己的曲库里验查询。

### 专辑关联和相似曲目

- `library.relatedAlbums(id, source?)` 返回同一专辑艺术家的其他专辑，最多 12 张。
- `library.albumVersions(id, source?)` 返回主版本 ID、已关联的版本、候选版本，以及按专辑 ID 索引的已测响度范围（LU）。两种专辑查询都默认使用 `Local` 曲库，也接受 `Legacy`。
- `library.similarLocalTracks(id)` 返回本机曲库中的相似曲目，最多 24 首。查询使用曲库中的艺术家、流派、速度和发行年代等信息，在本机完成。

插件可在 `gpui.requires.commands` 声明实际使用的命令，例如 `library.albumVersions`。独立应用可通过 `core.describe()` 检查命令，并用 `core.library` 下的同名方法调用。

### 艺人和作品署名

- `library.artistByName(name, source?)` 按宿主曲库的艺人名称和别名规则查找条目。找不到时返回 `null`。
- `library.artistCredits(name, source?)` 按署名读取作曲、指挥、演出等角色及每个角色关联的曲目数。
- `library.albumCredits(id, source?)` 读取专辑中的人员、作品和乐章关系，以及旧库已有的制作人员名单。
- `library.trackArtistCredits(id)` 读取本机曲目的原始艺人署名、解析后的艺人名称、拆分建议及手动覆盖状态。

前三项默认使用 `Local`，也支持 `Legacy`。插件和独立客户端都可以按名称检查对应宿主能力。

### 整理本机歌单

- `library.findTrackInPlaylists(trackId, { page, groupId })` 反查普通歌单中保存的条目。同一首歌在同一歌单出现多次时，每条都返回自己的 `itemId`。页码从 1 开始，每页最多 4 条。
- `library.appendPlaylistTracks(id, trackIds, policy)` 按输入顺序追加。默认 `ask` 遇到重复时返回 `newCount` 和 `duplicateCount`，此时尚未写入。选 `onlyNew` 只追加尚未收录的曲目，选 `keepAll` 保留全部重复项。
- `library.transferPlaylistItems(id, targetId, itemIds, mode)` 用 `playlistItems` 或反查结果的 `itemId` 复制或移动条目。目标中已有的同曲目出现次数会计入选择数量。`move` 返回 `recoveryId`，可用 `library.restorePlaylistRecovery({ kind: 'items', id: recoveryId })` 撤销。
- `library.playlistGroups({ page, playlistId })` 分页读取分组。传入歌单 ID 时，可用 `assigned` 找到它所在的分组。`library.playlistsInGroup(groupId, { page, search })` 浏览分组内歌单，传 `null` 浏览未分组歌单。
- `library.editPlaylistGroup(change)` 支持 `create`、`rename` 和 `assign`。创建时可附 `playlistId`，合并创建与归组为一次操作。归组时传 `groupId: null` 可以移回未分组。

这些接口也可从独立客户端的 `core.library` 调用。追加和转移每次最多处理 1,000 项。未匹配的条目可继续通过 `playlistItems` 查看和处理，转移需要已匹配的条目。

### 原版曲库查询

原版插件声明 `library:read` 后可用 `echo.library.getSummary()`、`getAlbum(id)`、
`getAlbumForTrack(trackId)`、`getArtist(id)`、`favorites.getAlbumStates(ids)`
和 `searchTracks({ rules }, { page, pageSize })`。按文件路径或文件夹筛选额外需要 `library:path`，
返回的曲目字段省略本机路径。

### 曲目版本和连播分组

- `library.trackVersions(id, source?)` 返回版本成员、推荐版本、首选版本、录音版本族和音质字段。`revision` 是原样传回的字符串，用来避免覆盖期间发生的修改。
- `library.editTrackVersions(id, revision, edit)` 修改本机版本组。`edit.action` 支持 `add`、`remove`、`prefer` 和 `useBestQuality`。前三种需传 `trackId`。修改后重新读取版本组获取新 `revision`。
- `library.linkedTracks(id, source?)` 按宿主实际连播顺序返回曲目。结果与当前曲库的自动连播设置一致。

### 读取封面和控制播放队列

| 作者要做的操作 | 公开 SDK |
| --- | --- |
| 读取曲目、专辑、艺术家头像、当前播放封面 | `artwork.track(trackId, source?)`、`artwork.album(albumId, source?)`、`artwork.artist(artistId, source?)`、`artwork.current(sequence?)` |
| 分页读取队列 | `queue.get({ offset, limit, queueId })`。首屏可省略 `queueId`，后续页传回它。每次 1–256 项，默认 256 |
| 在队列里搜索并点播 | `queue.search(query, { source?, remoteId? })` 最多返回 16 个匹配项。将同一结果的 `queueId` 和从 0 开始的 `index` 传给 `queue.playAt(queueId, index)` |
| 管理宿主保存的队列 | `queue.saved.list()` 获取 `{id, name, tracks}[]`，`save(queueId)` 保存，`restore(queueId, snapshotId)` 恢复，`remove(snapshotId)` 删除。后三个方法也属于 `queue.saved` |

封面结果含 `width`、`height`、`dataUrl`，没有可用图片时返回 `null`。曲目、专辑和艺术家缩略图最长边至多 340 像素，当前播放封面至多 512 像素。用当前曲目的 `sequence` 请求封面后，如果歌曲已经切换，宿主返回 `track-changed`。页面只需取可见作品的图片，避免每次播放进度变化时重读。

```js
const track = await playback.getCurrentTrack();
const cover = track && await artwork.current(track.sequence);
return {
    title: track?.title ?? '尚未播放',
    layout: cover
        ? { images: { cover: cover.dataUrl }, body: { type: 'image', image: 'cover', height: 180 } }
        : { body: { type: 'text', text: '暂无封面' } },
};
```

队列分页和点播适用于进程内及独立 Core。读取时可用每一行的 `occurrenceId` 与该页的 `queueId` 调用 `queue.playItem`，同一首歌曲重复入队也能准确选择。页面的 `position` 从 1 开始，`index` 和 `offset` 从 0 开始。队列已更改时重新读取或搜索，再让用户选择。快照与播放器队列页共用，最多保留最近 12 份；空队列和含临时音频流的队列无法保存。快照 ID 是字符串，请原样传回。用 `queue.saved.onChanged(listener)` 订阅已载入的快照列表变化，回调返回 `{ snapshots, undoRemoveId }`。首次打开快照面板时调用 `list()` 读取已保存的记录。删除后可将 `undoRemoveId` 传给 `queue.saved.undoRemove(id)` 撤销最近一次删除。需要这些能力的插件在 `gpui.requires.commands` 中列出实际使用的命令。

用实时曲库示例检查接口联动：

```sh
node sdk.mjs init my-library community.my-library --template live-library
node sdk.mjs preview my-library --command inspect-session --input '{"query":"first"}'
```

### 智能歌单预览

`library.trackSkipStats(id)` 返回本机曲目的 `skipCount` 和最近跳过时间 `lastSkippedAt`。
智能歌单可按 `skipCount`、`lastSkipped` 和 `filters.minSkipCount` 筛选或排序。
跳过统计从新版记录的队列切换事件开始，旧历史保留原有字段。

`library.smart.previewSummary(rules)` 返回候选数、纳入数、请求上限与最多 100 首样本。
需要更多预览曲目时，可用 `library.smart.preview(rules, page)` 翻页。
`library.smart.freeze(id, { title })` 可指定生成的普通歌单名称，省略时沿用默认名称。

### 睡眠定时器与标签

原生插件使用 `context.sleepTimer.getStatus()`、`start({ durationMinutes, action, fadeOut })`、`cancel()`
和 `onTick(({ remainingMs }) => ...)`，与播放器共用定时器。时长接受 1–720 分钟的整数，动作可选
`pause`、`stop`、`quit`。用完监听后调用 `onTick` 返回的取消订阅函数。原版插件使用
`echo.sleepTimer`，需声明 `sleep-timer:control`。离线预览会模拟启动和取消，倒计时可在应用里验证。

`context.library.tags.mixedItems(tagId, page)` 每页返回最多 30 项，可以同时读取专辑、艺人和歌曲。
原版插件可用 `echo.library.tags.list(target?)`、`getItems(tagId, page?)` 和 `change(edit)`。
读取需要 `library:read`，修改需要 `library:personal-write`。

### 收藏

`context.library.toggleTrackLiked(id)` 和 `toggleAlbumLiked(id)` 返回提交后的 `liked` 状态。
`setTracksLiked(ids, liked)` 一次更新最多 256 首曲目，`trackFavoriteStates(ids)` 一次读取最多
200 首曲目的收藏状态。`setArtistFavorite(id, favorite)` 可设置本机艺人收藏。
`moveLikedTrack(id, position)` 使用曲目 ID 和从 0 开始的目标位置。

原版插件声明 `library:control` 后可用 `echo.library.toggleTrackLiked`、`toggleAlbumLiked`
和 `echo.library.favorites.moveTrack(itemId, position)`。排序时用 `favorites.getTracks()`
返回的列表条目 ID。

### 原生工坊歌词页

在 `gpui.requires.features` 声明 `pages.lyricsView`，通过 `pages.register(id, { title, presentation: 'lyrics-view' }, open)` 注册。用户从插件页打开后，宿主把普通 `WorkshopPage` 或声明式 `layout` 放进歌词舞台，保留播放栏和关闭按钮。`Esc` 回到内置歌词页，`F5` 切换当前窗口全屏。宿主在尺寸、焦点或全屏状态变化后重新传入 `lyricsView`。其中 `width`、`height` 是避开宿主控件后的逻辑像素，`minRefreshIntervalMs` 是插件调用 `pages.invalidate(id)` 时的合并间隔。

- `lyrics.onChanged(listener)` 先交付当前曲目的歌词版本，之后在曲目、歌词来源或歌词版本变化时推送。用 `lyrics.getCurrent({ sequence: event.sequence ?? undefined, revision: event.revision })` 读取逐行、逐字、翻译、音译和背景人声。异步读取遇到换歌或版本变化时返回 `lyrics-changed`，可等待下一个事件再读。
- `playback.getClock()` 读取当前播放位置、速率、`sampledAtMs` 和跳转代数。`playback.onClock(listener)` 在有订阅时最多每秒交付 20 次变化。使用同一个时间基准外推播放位置，在暂停、曲目或跳转代数变化时重置。渲染页面时只需在展示内容变化后调用 `pages.invalidate(id)`。
- `artwork.getPalette(sequence)` 返回当前封面的 RGB 均色。`artwork.current(sequence)` 与 `artwork.track(id, source)` 返回宿主生成的缩略图。队列、听歌历史、分页曲库和信号通路可用 `queue.get`、`history.list`、`library.query`、`audio.getSignalPath`。设置可保存到插件自己的 `storage`。
- 原生页面按钮可使用 `{ label: '复制歌词', method: 'lyricsView.copyText', input: text }`。宿主仅在歌词页操作中处理这条动作，纯文本上限为 32 KiB。
- 页面按钮还可调用 `lyricsView.setFullscreen`（`input` 为布尔值）、`lyricsView.back`（恢复内置歌词页）和 `lyricsView.openDsp`（打开宿主 DSP 工作台）。

在清单 `gpui.lyricsViewPermissions` 声明用到的权限。页面需在 `permissions` 中再次声明宿主操作对应的权限。`clipboard:write`、`window:fullscreen`、`audio:dsp-ui` 和 `lyrics:import` 分别控制复制、全屏、DSP 工作台和 `lyricsView.importLyrics`。导入由宿主打开文件选择器并校验曲目序号。`ui:system-fonts` 让页面获得去重的字体族名。`lyricsView.preferences` 和 `appearance` 提供歌词外观与主题颜色，`visible`、`reducedMotion` 和 `frameIntervalMs` 供插件决定刷新节奏。用 `transparent: true` 把页面叠在当前原生歌词背景或 MV 上。

`gpui.lyricsViewFonts` 可声明最多四个包内 TTF、OTF、WOFF 或 WOFF2 字体，单个资源解压后上限为 8 MiB。宿主验证并加载后，`lyricsView.bundledFonts` 返回可用族名。用文本节点的 `fontFamily` 选择包内字体或系统字体。

- 声明 `lyrics:match` 后调用 `lyrics.matchAmll(sequence)`，由已启用的 AMLL 歌词提供器查找并应用通过宿主校验的候选。已有或手动编辑的歌词受保护。`playback.getMusicMetadata(sequence)` 返回可用的 BPM、估算标记、节拍偏移和流派。
- 声明 `audio:canvas` 后调用 `audio.canvas.start({ sequence, buckets: 4096, spectrogram: true })`，用 `status(id)` 读取进度和结果，用 `release(id)` 取消或释放。输入限当前可访问的本地曲目。结果含左右声道极值、峰值、RMS 与可选的双声道频谱图，频谱字节按列排列。
- 声明 `audio:stereo-telemetry` 后调用 `audio.visualization.open(options)`。按返回的 `intervalMs` 调用 `read(id)`，结束时调用 `close(id)`。原生 Audio Host 可提供短窗波形、双声道频谱、声道平衡和相位相关性。设置 `{ measurements: true, loudness: true }` 读取声道峰值、RMS 和可用的响度指标。设备切换、曲目切换和过期时应重新申请订阅。

运行 `node sdk.mjs preview lyrics-view` 查看示例。安装宿主请从「插件」打开示例页面。

#### 在歌词样式里实现播放控件

- `playback.getTransport()` 在同一次读取中返回 `{ state, clock }`。用 `canToggle`、`showPause`、`canPrevious`、`canNext` 和 `canSeek` 显示适合当前来源的按钮。`playback.onTransportChanged()` 推送初始状态、换歌、跳转、播放模式和队列相关变化。逐字动画继续使用 `playback.onClock()`，无需每帧读取队列。
- 把渲染时的 `clock.trackSequence` 原样传给 `playback.seekTrack(sequence, seconds)` 或 `seekTrackBy(sequence, deltaSeconds)`。宿主提交时再次校验曲目，旧歌词行或进度条的点击不会跳转新歌。由歌词行换算目标时，用 `Math.max(0, (line.timeMs - document.offsetMs) / 1000)`。
- 用 `queue.getWindow({ queueId: state.queueId, sequence, before: 2, after: 5 })` 读取当前项附近的队列。前后各最多 16 项。`currentIndex`、`previousIndex`、`nextIndex` 是整个队列的从零开始的索引。随机播放下，`nextIndex` 可能在窗口外，可用相同 `queueId` 通过 `queue.get` 单独读取。曲目或队列变化后重新读取。
- `queue.editItem(queueId, occurrenceId, { action: 'playNext' | 'remove' })` 等宿主处理完成再返回。即使相同曲目出现多次，也能按出现 ID 精确操作。点播继续用 `queue.playItem(queueId, occurrenceId)`。

主歌词页示例组合了播放按钮、可拖动的时间轴、逐行跳转和队列操作。运行 `node sdk.mjs preview lyrics-view --page current-lyrics` 查看可用动作。独立客户端也可通过 `core.playback` 和 `core.queue` 调用这些读写方法。

#### 自绘歌词舞台

声明 `pages.lyricsStage`，在原生主歌词页或桌面歌词页的 `layout` 中使用 `lyricsStage` 节点。作者可以自行排列主歌词、翻译、音译、装饰和进度。舞台以指定的 `sequence` 跟随当前曲目，换歌后旧舞台停绘。`offsetMs` 为舞台时钟补正，通常传当前歌词文档的偏移。

- `layers` 按顺序叠加。`draw.type: 'text'` 支持位置、对齐、字号、包内字体、基础色与高亮色。`lyrics.stageRuns(line)` 把文档转为保留空格和标点的逐字片段。插件也可以自己提供 `runs`。给片段设置 `startMs` 和 `endMs` 可扫过该词，只有 `startMs` 则瞬时点亮。宿主对整行文字统一排版。
- `draw.type: 'shape'` 使用画布的矩形或折线。每层可设置按毫秒排序的 `keyframes`，分别控制相对 X/Y 位移和透明度。关键帧间支持 `linear`、`easeInOut` 和 `easeOut`。暂停保留姿态，跳转重算姿态，减少动态效果打开时按关键帧与词边界更新。
- `hotspots` 定义独立的可点击区域，`click` 处理舞台其余区域。坐标和大小以舞台的 0–1 比例表示。用 `pages.registerAction` 注册回调，`data` 包含 `{ sequence, hotspot, x, y, input }`。`input` 是动作声明中的自定义数据，键盘触发时坐标取区域中心。

舞台高度为 32–1200 逻辑像素，最多 64 层、每层 32 个关键帧和 32 个热点。逐字推进和动画由 GPUI 绘制。仅在切换可见歌词行或换场时调用 `pages.invalidate()` 即可。运行 `node sdk.mjs preview lyrics-view --page designer-stage` 查看示例，也可在已安装的插件中打开「Custom lyric stage」。

#### 桌面歌词、伴侣与设置页

声明 `pages.lyricsTargets` 后可以注册 `desktop-lyrics`、`companion-lyrics` 和 `lyrics-settings`。从插件页打开桌面或伴侣贡献，宿主会使用对应的原生窗口。伴侣需要先连接外部播放器，回调中的 `lyricsView.externalPlayback` 提供外部曲目信息与当前歌词行。桌面与伴侣关闭插件页面后恢复内置歌词。

`settingsPage` 指向同一插件注册的 `lyrics-settings`。宿主在歌词页提供设置按钮，打开独立原生设置窗。返回普通 `WorkshopPage` 的表单和按钮，并通过私有 `storage` 持久化。页面在授权 `audio:dsp-ui` 后可使用 `lyricsView.openVst3Manager`，查看标准目录中的已安装 VST3 插件并在系统文件管理器定位。

#### 原生画布、封面配色和在线缓存

- 在 `WorkshopPage.layout` 中使用 `canvas` 节点。`commands` 接受 `rect` 和 `polyline`，坐标在 0 到 1 之间，线宽使用逻辑像素。单个画布最多 256 条命令，单页最多 16,384 个点，由 GPUI 绘制。
- `artwork.getPalette(sequence)` 同时返回均色和最多四个 `#RRGGBB` 主色。`artwork.onPaletteChanged` 提供曲目序号及相应调色板，可跟踪切歌和封面变化。
- 当前在线音源插件可用 `audio.canvas.registerCachedAsset(sequence, relativePath)` 登记私有数据目录内已经缓存的完整 FLAC、WAV、MP3、Ogg 或 Opus 文件。之后复用 `audio.canvas.start/status/release` 分析。宿主按当前曲目序号和音源归属验证注册，其他插件通过分析结果读取数据。

示例可分别用 `--page desktop-lyrics`、`--page companion-lyrics` 和 `--page lyrics-settings` 预览。

#### 自定义 WGSL

先检查 `host.describe` 是否包含 `pages.wgsl`。Windows、macOS 和 Linux 宿主通过原生 GPU 合成 `shader` 布局节点。macOS 在后台将验证后的 WGSL 转为 MSL，经 Metal 绘制并以 Core Video 曲面交给 GPUI。每页支持一个节点，`height` 为 16–720 逻辑像素。源码上限为 8 KiB，仅声明一个 `fn echoColor(uv: vec2<f32>, time: f32) -> vec3<f32>`，宿主传入归一化坐标和节点的可选 `time`。节点支持纯数学表达式和条件分支，资源绑定、循环和自定义入口由宿主限制。可用 `--page shader` 查看示例文档结构，再用宿主 `--workshop test` 编译验证。

#### VST3 音效与厂商编辑器

授权 `audio:dsp-ui` 的页面可通过宿主按钮 `lyricsView.openVst3Manager` 打开管理器。配套 Windows、macOS 和 Linux Audio Host 支持本地 ECHO Pro 单声道或立体声 PCM 中的一个 VST3 音效插槽。开始播放后，从已安装清单手动加载，再打开厂商编辑器、旁通或卸载。macOS 编辑器使用 AppKit 窗口，Linux 编辑器需要 X11 或 XWayland，支持提供 X11 嵌入视图的音效。`audio.vst3.getStatus()` 可读当前插槽状态。输出格式改变后，在管理器中重新加载。VST3 加载路径与界面由宿主管理，插件本身无需提供二进制或路径。

### 编辑本机曲目歌词

用 `context.lyrics.get(trackId?)` 读取当前曲目或指定本机曲目的歌词。
`applyCustom(trackId, text, format)` 支持 LRC、TTML 和纯文本，`markInstrumental(trackId)` 可标记纯音乐。
用 `setOffset(trackId, offsetMs)` 或 `setCurrentOffset(offsetMs)` 调整时序。保存范围为 ±10 秒，
返回值把偏移量与原始歌词时间分开。`clearOverride(trackId)` 恢复默认取词并保留偏移，
编辑保存到 GPUI 曲库歌词覆盖，音频文件标签保持原样。

原版插件用 `echo.lyrics` 调用同一组能力，其中恢复默认取词用 `clearCache(trackId)`。
读取需 `lyrics:read`，编辑需 `lyrics:write`。歌词写入可用已安装宿主与本机曲目验证。

### 插件记录和缓存

`context.storage.records` 按 bucket 保存 JSON。`set(bucket, key, value, summary, budget, expectedRevision?)`
返回新版本号。传 `null` 只允许新建，传已有版本号可做条件更新，省略版本号则直接写入。
版本冲突返回 `record-conflict`。`budget` 包含 `maxEntries` 与 `maxBytes`。
`list(bucket, { limit, before })` 每页最多读 50 条摘要，下一页的 `before` 用上一页的 `nextCursor`。
每条摘要最多 2 KiB。

`context.storage.cache` 用于保存可重算的结果。写入时指定 `maxEntries`、`maxBytes` 与
`expiresAt`，过期时间使用 Unix 毫秒时间戳。写入会清理过期项，并按最近使用顺序淘汰旧数据。
用 `ifAbsent: true` 保留已有的未过期项。

原版插件声明 `fs:plugin` 后可使用 `echo.storage.records`、`echo.storage.cache` 和
`echo.storage.files`。`files` 使用 GPUI 管理的插件私有目录，提供键值、记录与缓存接口。
已有 GPUI 键值数据沿用原位置。敏感凭据用 `context.credentials`，跨重启持久化可在应用内验证。

### 播放控制、频谱与 DSP

`context.playback.getSpeed()` 和 `setSpeed(rate, mode)` 一起读取和设置播放速度与模式。
速度范围为 0.5–2，模式为 `Speed`、`Nightcore`、`Daycore`。`getSegmentLoop()` 返回
A/B 循环状态与当前 `trackInstance`，传给 `editSegmentLoop(trackInstance, edit)` 可打点、
移动、开关、跳到 A 点或清空。切歌后旧标识会失效，循环只在可用的播放链路上启用。

`context.audio.getAnalysis()` 读取输出频谱以及可用的峰值和 RMS 电平，无新鲜数据时返回 `null`。
持续刷新用 `onAnalysis`。原版插件可用 `echo.audio.getSpectrum()`，需要 `audio:spectrum`。

ECHO Pro DSP 提供 `audio.dsp.getGraph()`、`applyGraph(graph)`、`getRackOrder()` 和
`setRackOrder(order)`。先读取处理链，再带原版本号提交编辑。遇到 `dsp-graph-conflict` 时
重新读取后再编辑。排序保留已有滤波器实例，卷积库引用通过应用管理。
原版读取需 `audio:dsp-read`，修改处理链需同时声明 `audio:dsp-read` 和 `audio:dsp-graph-write`，
改顺序需 `audio:dsp-write`。`listModules()` 返回宿主可读的内置模块。

### 播放书签和保存片段

`playback.bookmarks.list(trackId, source?)` 读取指定曲目的书签。`add(sequence)` 在当前位置建书签，`jump(sequence, bookmarkId)` 跳到已有书签。使用 `playback.getCurrentTrack()` 返回的 `sequence`，切歌后宿主会拒绝过期请求。`rename({ id, source? }, bookmarkId, label)` 和 `remove({ id, source? }, bookmarkId)` 编辑指定曲目的书签。所有书签方法都返回当前列表，`position` 以秒为单位。

`playback.savedSegments.list({ page, search })` 搜索本机收藏片段，每页最多 50 条，默认第 1 页。`edit({ action: 'save', trackId, name, start, end })` 保存以秒为单位的区间。也支持 `rename`、`relink` 和 `remove`。`play(id)` 根据保存的区间开始播放。书签和片段与 ECHO 原生界面使用同一份记录。

### 音频信号路径

`audio.getSignalPath()` 读取当前播放的输入来源、编解码格式、源采样率、实际输出、DSP、ReplayGain、重采样、缓冲和欠载计数。`trackSequence` 对应 `playback.getCurrentTrack()` 的 `sequence`，可以用来丢弃切歌期间过期的面板结果。数值不可用时返回 `null`，例如设备尚未打开或硬件采样率未能回读。

原生插件可用 `audio.onSignalPathChanged(listener)` 订阅，先收到当前快照，此后只接收变化的技术状态。检查 `gpui.requires.commands` 中的 `"audio.getSignalPath"` 和 `gpui.requires.events` 中的 `"audio.signalPathChanged"`。同一个读取方法也可通过独立 Core SDK 的 `core.audio.getSignalPath()` 调用，并随客户端所选播放区读取状态。

### 播放输出

`library.onFavoritesChanged(handler)` 订阅本机歌曲和专辑的收藏变更，返回取消订阅函数。

`library.tracksByIds(ids)` 一次读取最多 200 个本机曲目，按输入顺序返回找到的曲目并去重。
`queue.get()` 的条目可带 `occurrenceId`，将它与该页的 `queueId` 一起传给 `queue.playItem`
可点播指定队列条目。同一首歌在队列中有多条记录时，各条记录的 ID 各自独立。

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
| `queue.submit` | 使用 `mode`（`play`、`append` 或 `playNext`）和 `tracks` 提交曲目。当前宿主单次最多接受 1,000 首，并受消息大小限制。用 `host.describe` 的 `maxQueueItems` 兼容旧宿主。播放时可用从 0 开始的 `index` 选择起始曲目。 |

`queue.submit` 接受三类曲目。

- `{kind: "catalog", source, id}` 引用宿主曲库。
- `{kind: "source", source: {plugin, provider}, track}` 引用插件目录曲目，播放时由音源解析。
- `{kind: "stream", id, title, url, artist?, album?, duration?, cover?, lyrics?, bearer?}`
  传入 HTTP(S) 音频流。时长单位为秒，歌词支持 LRC 和纯文本。
  插件内自行完成服务登录与流地址解析。临时 URL 和凭据留在内存中，含临时流的队列
  需要先移除这些流才能保存为队列快照。

播放命令提交到 ECHO 的现有队列。用 `playback.get` 或 `playback.changed`
观察播放结果。

### 本地相似歌曲

独立插件可通过 `commands.register('similar-recordings', {title}, handler)` 提供相似录音。用户从歌曲菜单发起查询时，宿主传入 `{ title, artist, limit }`，接收按相关性排序的 `[{title, artist}]`（最多 64 条），再与本机可见录音匹配。没有可用提供方时使用曲库中的艺人、流派、年代和速度。多个提供方运行时按插件 ID 排序选首个。`similar-recordings/` 是 Last.fm 的可安装示例，启动后在插件设置页填写自己的 API Key。

### 给其他播放器提供 Core 服务

独立 Core 可以按 ID 启动已安装、已批准当前版本的插件。作者通过 `commands.register` 自行定义命令和 JSON 参数，播放器、歌单编辑器及其他插件通过 `commands.core.list()` 发现服务，用 `commands.core.invoke(pluginId, commandId, input)` 调用。命令处理器可读取 `callerPluginId`。服务在自己的播放区运行，客户端拿回曲目后可以提交到自己控制的播放区。单进程模式也支持同一组调用。

```sh
echo-server --local-core --database /path/to/library.sqlite --workshop-plugin community.playlist-service
```

`--workshop-plugin` 和 `--workshop-source` 均可重复，按参数顺序启动。后者还会检查插件确实注册了音源。桌面插件的 `commands.list()` 和 `commands.invoke()` 继续访问当前宿主的插件。

`playlist-service` 模板公开保存、分页列举、读取、删除四个命令。歌单存入该插件自己的持久化记录。下面把当前队列存成歌单，再从服务取回并追加到播放器。示例每张歌单最多 256 首，保留重复曲目及其顺序。

```js
const service = 'community.playlist-service';
const call = (id, input) => context.commands.core.invoke(service, id, input);
let page = await context.queue.get({ limit: 256 });
if (page.total > 256) throw new Error('请选择要保存的 256 首以内的曲目');
const tracks = page.items.map(row => row.reference);
while (page.hasNext) {
    page = await context.queue.get({ queueId: page.queueId, offset: tracks.length });
    tracks.push(...page.items.map(row => row.reference));
}
if (tracks.some(track => !track)) throw new Error('所选曲目中有临时流或无持久标识的文件');
await call('save', { id: 'my-mix', title: '我的混合歌单', tracks });
const saved = await call('get', { id: 'my-mix' });
if (saved.value.tracks.length) await context.queue.submit({ mode: 'append', tracks: saved.value.tracks });
```

再次保存同一 ID 时传入 `revision: saved.revision`，删除也使用读取时的版本。列举时传 `{limit, before?}`，下一页使用返回的 `nextCursor`。`queue.get()`、`playback.getCurrentTrack()` 和换歌事件中的 `reference` 可直接回传给 `queue.submit`。临时流的引用为 `null`，旧宿主可能省略该字段。音源离线时仍能读写歌单。入队和播放时需启用对应音源。


自制原生应用可直接依赖本仓库的 `echo-client`，通过同一用户的本地 IPC 调用服务。传入独立 Core 使用的数据库路径即可定位连接。

```rust
let core = echo_client::Client::new(database_path);
let commands = core.list_workshop_commands().await?;
let playlists = core.invoke_workshop_command(
    "my.playlist-editor", "community.playlist-service", "list", serde_json::json!({"limit": 25}),
).await?;
```

终端脚本也能直接枚举命令和调用插件服务。结果输出为 JSON。

```sh
echo-corectl /path/to/library.sqlite workshop list
echo-corectl /path/to/library.sqlite workshop invoke community.playlist-service list '{"limit":25}'
```

### 独立应用 SDK

桌面窗口关闭后，自制播放器、歌单编辑器和后台脚本仍可控制同一用户运行的独立 Core。Node 应用导入 `standalone/core.mjs`，TypeScript 声明随包提供。客户端通过 `echo-corectl` 连接 Core，首次调用时启动一个辅助进程并复用于后续请求。带有本平台辅助程序的 SDK 压缩包解压后可直接使用。其他情况下，把同版本的 `echo-corectl` 放入 PATH，也可以用 `executable` 或环境变量 `ECHO_CORECTL` 指定它的路径。源码构建使用 `cargo build --release -p echo-server -p echo-client --bins`。

```js
import { createCoreClient } from './standalone/core.mjs';

const core = createCoreClient({ database: '/path/to/library.sqlite', appId: 'studio.my-player', zone: 2 });
try {
    const { commands } = await core.describe();  // 当前 Core 实际支持的宿主命令
    const sources = await core.sources.list();
    if (sources.length) {
        const source = sources[0];
        const result = await core.sources.search(source, 'live', { page: 1, pageSize: 12 });
        const track = result.tracks[0];
        if (track) await core.queue.submit({ mode: 'append', tracks: [{ kind: 'source', source, track }] });
    }
    console.log(await core.queue.get({ limit: 10 }));
} finally {
    core.close();
}
```

- `core.audio` 可读信号路径、频谱与输出，并可调用宿主的输出和 DSP 设置。`core.playback` 支持速度、循环、书签和保存片段。`core.queue` 支持分页、搜索、编辑及队列快照。`core.library`、`core.artwork`、`core.history`、`core.lyrics` 和 `core.sleepTimer` 提供相应的类型化调用。
- `core.forZone(2)` 创建连接同一个 Core 第 2 播放区的新客户端。每个客户端有自己的会话和 `close()`，操作与订阅使用各自所选播放区。`core.invoke(method, input)` 仍可调用能力清单里的其他宿主命令。插件服务使用 `core.commands.invoke(pluginId, commandId, input)`。
- `for await (const state of core.watch({ signal }))` 先收到当前快照，随后接收所选播放区的状态变化。可读取 `state.playback.track`、`state.playback.positionMs` 和 `state.queue_position`。退出循环或取消信号即可释放订阅。Core 重启后重新建立订阅。命令会话会为后续调用重新发现 Core，发生中断的写入应先读回状态再决定是否重试。
- `node standalone/player.mjs DATABASE` 列出已启用音源。`node standalone/player.mjs DATABASE PLUGIN PROVIDER "关键词" --zone 2` 显示搜索结果，加 `--append 1` 或 `--play 1` 可选择第一首。
- Rust 使用 `Client::workshop_host(app_id, method, input)`，状态订阅使用 `Client::subscribe()`。Python、Go 等语言可启动 `echo-corectl DATABASE --zone 2 sdk APP_ID session`，按行发送 `{"method":"queue.get","input":{"limit":10}}`，逐行读取 `{"value":...}` 或 `{"error":"..."}`。一行一个 UTF-8 JSON 对象，按提交顺序应答。一次性调用可用 `sdk APP_ID describe`、`sdk APP_ID call METHOD '[JSON]'`，持续订阅可用 `sdk APP_ID watch`。

外部应用拥有自己的调用标识，插件服务会收到 `app/<appId>`。插件的私有凭据与存储仍由插件通过自己的运行时管理。

### 订阅可用音源和服务命令

播放器和歌单工具连接本机 Core 后，可以用一个订阅维护两份菜单。首次读取立即返回完整目录，之后提供方上线、注销或断开连接时返回新的完整目录。同一批注册的音源和命令一起出现，两者都可以直接传给相应的 SDK 接口。两个播放区看到相同的目录。

```js
for await (const { sources, commands } of core.watchDiscovery({ signal, reconnect: true })) {
    updateSourceMenu(sources);  // 每项包含 plugin、provider、title、browse
    updateServiceMenu(commands); // 每项包含 pluginId、commandId、title
}
```

在一个终端运行 `node standalone/player.mjs DATABASE --watch`，在另一个终端启动或退出下面的电台示例，即可看到变化。慢速读者会合并中间变化，直接收到最新目录。每个快照的 `revision` 只在同一次 Core 运行内可比较。退出循环、触发 `AbortSignal` 或关闭客户端会释放订阅。启用 `reconnect: true` 后，可以先于 Core 启动播放器。Core 暂时不可用时，订阅会以 200 毫秒到 5 秒的退避间隔重试；Core 恢复后，同一个循环会收到新实例的完整目录，即使版本号与上次相同。等待期间也可以随时取消。默认设置会在断开时向调用方返回错误。

Rust 可用 `Client::watch_workshop_discovery(true)` 和 `next().await` 自动续接，也可用 `Client::subscribe_workshop_discovery()` 建立单次连接。其他语言可启动 `echo-corectl DATABASE sdk APP_ID watch-discovery`，每次向 stdin 写入一个换行并刷新，再从 stdout 读取一行快照 JSON。追加 `--reconnect` 可跨 Core 重启继续读取。保持 stdin 打开，关闭它即可退订。

### 独立应用提供音源和服务

独立应用在同一用户的本机 Core 上可同时注册多个音源和服务命令。运行 `standalone/station.mjs` 可以把自己的 HTTP(S) 音频流作为音源提供给其他播放器，同时提供一条返回歌单的服务命令。

```sh
ECHO_STATION_URL='https://your-server.example/live.mp3' node standalone/station.mjs /path/to/library.sqlite '我的电台'
```

提供方保持运行时，其他播放器用 `sources.list()` 可以看到 `{plugin: "example.station", provider: "radio"}`，搜索、浏览、入队与播放沿用原有接口。歌单工具可调用 `commands.list()` 发现 `playlist` 命令。下面的代码在另一个独立应用中运行。

```js
const playlist = await player.commands.invoke('example.station', 'playlist');
await player.queue.submit({ mode: 'append', tracks: playlist.tracks });
```

作者使用 `await core.provide({ sources, commands })` 发布整组能力。每项提供 `id` 和 `title`。音源实现 `search`、`resolve` 和可选的 `browse`，命令实现 `run(input, {callerPluginId, signal})`。各播放器共享注册表，队列操作作用于调用者选择的播放区。请用稳定的应用、音源与曲目标识，播放时在 `resolve` 中返回最新的流地址。工坊插件也可以通过 `context.sources.list()` 和 `context.commands.core.list()/invoke()` 使用这些能力。

注册成功后返回的 `registration.close()` 可主动撤销整组能力，`core.close()` 或提供方进程退出也会释放注册。相同 ID 的第二个活动实例会收到冲突错误。一个注册连接上逐个分发回调，回调可用独立的控制连接调用其他服务。用 `signal` 中止已取消的异步工作。Core 断开时 `registration.closed` 会拒绝，应用可在 Core 恢复后重新调用 `provide`。

其他语言可运行 `echo-corectl DATABASE sdk APP_ID provide`。stdin 首行写入 `{"sources":[{"id":"radio","title":"Radio","browse":true}],"commands":[{"id":"playlist","title":"Playlist"}]}`，stdout 收到 `{"type":"ready"}` 后开始接收 `{"type":"call","id":1,"method":"command","input":{"id":"playlist","input":null,"callerPluginId":"app/player"}}`。每次回调按原编号回复 `{"id":1,"value":...}` 或 `{"id":1,"error":"..."}`。收到 `{"type":"cancel","id":1}` 时停止该项工作并回复一次，已经回复的编号直接忽略。方法有 `search`、`browse`、`resolve`、`command`。关闭 stdin 即注销。需要立即复用同一 ID 时，发送 `{"type":"release"}` 并等待 `{"type":"released"}`。Rust 提供方使用 `Client::register_workshop_app`，分别通过 `ProviderEvents::next` 与 `ProviderReplies::send` 收发。

### 电台已播曲目

`radio-song-history/` 是可安装的 AzuraCast 提供方。导入工坊并启用插件后，在播放栏或电台界面打开「刚才播了什么」。兼容电台的 `/listen/<station>/` 和 `/hls/<station>/` 地址可读取同一站点的公开历史。插件只在打开历史时访问电台。实时流发来的曲名由 ECHO 在本次运行中单独记录。

其他提供方可以注册 `radio-song-history` 命令。输入为 `{url, limit}`，返回 `[{title, artist, played_at}]`。时间使用 Unix 秒，最多返回 40 首。不支持该地址时返回空数组。
