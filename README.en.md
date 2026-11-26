# ECHO GPUI Workshop SDK

[中文开发指南](README.md) · [Download](https://github.com/Moekotori/echo-gpui-workshop-sdk/releases/latest)

To build a player, playlist tool or music provider, start with the [standalone SDK](#standalone-applications), [provider example](#provide-music-and-commands-from-a-standalone-app) and [live discovery](#watch-available-sources-and-service-commands).

Build plugins for ECHO GPUI with JavaScript and an installed copy of the app. Plugins can add native pages,
search providers, track metadata and cover suggestions, and commands other plugins can call. Use or adapt the
SDK files under the [MIT license](LICENSE).

## Build your own native page

Run `node sdk.mjs init my-shelf community.my-shelf --template cover-browser`. Open its manifest from Plugins → Create → Run development package. The [example](cover-browser/plugin.mjs) reads local playlists, filters them, renders bundled sleeve artwork, opens track details, and plays the selected track. For a fixture-backed check, run `node sdk.mjs preview my-shelf --action page.action.open`.

Declare `pages.layout` in `gpui.requires.features`. Return a `WorkshopPage` with a `layout.body` node and an optional virtualized `layout.grid`. Compose rows, columns, styled text, images, fields, buttons, pressable groups, dividers and links to registered pages. Put field definitions in `fields` and reference each field once by ID. Change `layout.key` when navigating to a new view to reset scrolling. Omitting `layout` uses the existing form renderer.

For a separate desktop window, declare `pages.window` and register a page with `{ title: 'Queue', window: { width: 560, height: 460 } }`. Link to it with a `pageLink` using its registered ID. Opening the same page again focuses its window. Each window owns its fields and scroll position and shares the authorized plugin process. Open and action callbacks receive the page ID as `windowId`, or `null` for main-window pages. Use `pages.invalidate(id)` to refresh a single page. Disabling the plugin closes its windows. The cover browser includes a queue window. Try `node sdk.mjs preview my-shelf --page queue --action page.action.toggle` with the offline fixture.


The [public types](starter/echo-workshop.d.ts) describe style and action options. Supply PNG or JPEG thumbnails as named data URLs in `layout.images`. A page accepts 256 grid items, 2048 nodes, 12 levels, and up to 64 images with a combined 8,388,608 pixels. Each image must fit within 2048 × 2048 and the whole response within 1 MiB. Fetch one page of data at a time.

## Music video providers

Create a plugin with `node sdk.mjs init my-videos community.yourname.videos --template mv-source`. Enable it in Plugins and choose **Settings → Lyrics → Music video source**. With the lyrics MV stage open, track changes query the selected provider. The MV drawer also offers manual search and candidate selection. Local videos take priority. Approved installed providers resume on restart.

Use `ctx.mv.registerProvider(id, { title }, { search, resolve, match? })` during activation. Both plugin and provider IDs identify the source. The track includes its ID, title, artist and duration in seconds. Pass the supplied abort signal to I/O.

- `search({ track, query, automatic, signal })` returns up to 24 candidates with a stable ID, title and optional artist and duration in seconds.
- Optional `match({ track, signal })` returns a confident candidate or null. Without it the host automatically selects only a unique exact title and nonempty artist match.
- `resolve({ track, candidate, signal })` returns a final HTTPS media URL with optional `startSeconds`, `quality`, and per-stream `headers` (Authorization, Referer, User-Agent). The server must support byte ranges and HTTP 206 responses. Manual searches keep the current video until selection.

The [video catalog example](mv-source/plugin.mjs) accepts a configurable HTTPS JSON array of `{ id, title, artist, url, durationSeconds? }`. Its default catalog contains the MDN Flower clip and the Blender Foundation Sintel trailer. Use the public CLI to exercise both paths:

```sh
node sdk.mjs preview mv-source --mv catalog --track '{"title":"Flower","artist":"MDN"}'
node sdk.mjs preview mv-source --mv catalog --track '{"title":"Flower","artist":"MDN"}' --query sintel --candidate sintel
```

### Stateful MV providers

Declare `gpui.requires.features: ["mv.session"]` and use `ctx.mv.registerSessionProvider(id, descriptor, handlers)` for providers that manage authentication, background matching, or stream renewal. The host calls `observe` and polls `status` while the MV stage is active. Implement search and selection in the plugin, respect the request signal, and use `ctx.credentials` for session storage. Publish a final HTTPS stream with the returned `streams.publish({trackId, url, headers?})`, then return that relay URL in the video status for the same track. Expose QR sign-in controls by providing login, closeLogin and logout callbacks. Additional capabilities include link loading, external search, quality selection, exclusions and recovery. See the [public types](starter/echo-workshop.d.ts).

## Automatic LRC providers

Create a project with `node sdk.mjs init my-lyrics community.yourname.lyrics --template lrc-source`, or use the [LRCLIB example](lrc-source/plugin.mjs). Run and approve it in Plugins, then select it under **Settings → Lyrics → Automatic lyrics source**. Selecting a provider enables automatic matching. Approved installed plugins resume on restart; development sessions must be started again.

During activation call `context.lyrics.registerProvider(id, { title }, async ({ track, signal }) => candidates)`. Keep both plugin and provider IDs stable. Pass the abort signal to your request. Return up to 24 candidates with the catalog record’s title, artist and one of `syncedLyrics`, `karaokeLyrics`, or `plainLyrics`. Optional fields include `translationLyrics`, `romanizationLyrics`, album and duration in seconds. Instrumental records may return `instrumental: true`. The callback also receives `automatic` for automatic versus manual lookups. Return an empty array for a miss. The host scores results for tracks with a title, artist and duration, preserves existing lyrics and does not try another provider if the selected one is unavailable. Each lyric text field is limited to 512 KiB and the candidate list to 768 KiB.

## Artist portraits

Declare `"artwork.artistProvider"` in `gpui.requires.features`. During activation call
`context.artwork.registerArtistProvider(id, { title }, async ({ artist, signal }) => candidate)`.
`artist` contains `{ id, name, source }`, with `source` set to `Local` or `Legacy`.
Return the source's `artistName` with either a public HTTPS `imageUrl` or a PNG/JPEG `dataUrl`
carrying up to 256 KiB of image bytes. Return `null` if the identity is uncertain.
The host compares the trimmed names case-insensitively.

After the user runs and approves the plugin, ECHO requests missing portraits in the background as the user browses the artist wall or opens an artist. It preserves existing portraits and caches successful downloads. Stopping the plugin stops lookups and preserves cached images. Each plugin can register up to four providers, and each artist lookup tries up to four active providers.

Use `artwork.artist(id, source?)` to read the saved portrait as `{ width, height, dataUrl }`, or `null` when missing. The read method does not start a lookup. Plugins that only read portraits can declare `"artwork.artist"` in `gpui.requires.commands`.

Subscribe with `artwork.onArtistChanged(listener)` to invalidate visible thumbnails after a manual change or an automatic download. The `artwork.artistChanged` event carries a string `revision` and coalesces changes.

## Customize playback and track menus

Declare `"actions.native"` in `gpui.requires.features`. During activation use `actions.registerPlayerBar(id, { title }, run)` and `actions.registerTrackMenu(id, { title, localOnly? }, run)`. A player bar callback receives the current `track` or `null`. A track menu callback receives the selected catalog track with its ID and source. Both callbacks receive `signal` and can return `{ notice, page }` to display a message or open a page registered by the same plugin. Run `node sdk.mjs preview my-plugin --player-action my-id` or `--track-action my-id` with fixture data.

### Custom main player bars

Add `"playerBar.layout"` to `gpui.requires.features` and call `playerBar.registerLayout(id, { title, items })` during activation. After enabling the plugin, users can choose its layout under **Settings → Appearance → Player bar layout**. The selected layout uses the host's appearance, progress style and playback state.

Items appear left to right. Use objects such as `{ type: 'track' }` for `track`, `previous`, `playPause`, `next`, `seek`, `like`, `lyrics`, `queue`, `volume`, `connect` or `spacer`. Include `playPause` and place each control or action at most once. Each plugin can register up to 4 layouts of 12 items each. For top-edge progress styles, `seek` places the time readout and keeps the slider along the top of the bar.

Use `{ type: 'action', id: 'my-action' }` to place a player-bar action registered by the same plugin. Its optional `icon` can be `listMusic`, `bookmark`, `heart`, `radio`, `clock` or `star`. Set `layoutOnly: true` to show it only in layouts that reference it. The host restores the selected layout from an approved installed plugin at startup and falls back to the built-in layout when space is limited or the plugin is unavailable. Lyrics, mini players and big-screen modes have their own bars.

Import the [Studio example](player-bar/plugin.mjs), or run `node sdk.mjs preview player-bar --player-layout studio` to inspect its registered layout and `--player-action now-playing` to try its callback.

| API | Customize |
| --- | --- |
| `playback.bookmarks` | List, add, jump to, rename and remove track bookmarks. Use the current track's `sequence` for `add` and `jump`. |
| `playback.savedSegments` | List, save, rename, relink, remove and play saved segments for local tracks. |
| `library.trackVersions` / `library.editTrackVersions` | Read members, suggestions and recording families. Use the original string `revision` for local version edits. |
| `library.linkedTracks` | Read tracks in their linked playback order. |

## Audio signal path

Use `audio.getSignalPath()` to display the current input format, output, DSP state, ReplayGain, resampling, buffering and underruns. Unavailable measurements are `null`. `trackSequence` identifies the same playback item as `playback.getCurrentTrack().sequence`. `audio.onSignalPathChanged(listener)` emits the initial snapshot and subsequent changes. Discover the command `audio.getSignalPath` and event `audio.signalPathChanged` in the host capabilities.

## Custom pages and actions

Call `context.pages.register(id, { title }, open)` during activation to add a sidebar page. Selecting it opens the returned native UI in the main content area. Register each page with its own ID so users can switch between pages and revisit them with Back and Forward.

Call `context.pages.registerAction(id, ({ fields, data, signal }) => ...)` during activation. Use the returned method on header buttons (`headerActions`), page buttons, row actions or a field commit. Fields are submitted as strings. Return a new page to update the view. Persist changes with `context.storage`. Existing `handle` methods keep working.

Set `field.control.kind` to `choice` (1–16 labeled options), `toggle` (string value `true` or `false`) or `range` (min, max, step, optional unit). Toggle and range controls accept an optional `commit: { method, input? }`. Mark fields `advanced: true` and set the page's `advancedFieldsLabel` to group them under a disclosure. See the [LRCLIB settings page](lrc-source/plugin.mjs) and [public types](starter/echo-workshop.d.ts).

Run a settings action and query the provider in the same temporary session. This example contacts LRCLIB; omit `--automatic` for a manual lookup.

```sh
node sdk.mjs preview lrc-source --action page.action.save --fields '{"limit":"2","format":"fallback","instrumental":"false"}' --lyrics synced --automatic --track '{"title":"Space Oddity","artist":"David Bowie","durationSeconds":315}'
```

## Run your first plugin

1. Copy [starter](starter) from the SDK, or open **Plugins → Create → Create plugin example** in ECHO GPUI.
2. In **Plugins → Create → Run development package**, select the example's `echo.workshop.json`.
   In an app-generated project, find it in `content/`.
3. Approve the development session and open the example page. Edit `plugin.mjs` beside the manifest and save.
   ECHO reloads the example. Open the session log to see console output and startup errors.

Each development session runs trusted Node.js code with your OS account permissions. Its temporary plugin storage
survives reloads and is discarded when the session stops. A desktop session can access your current ECHO library and
playback state. CLI `test` and `dev` use a temporary library.

| Example | What to try |
| --- | --- |
| [Starter](starter) | Native page actions and private JSON storage |
| [Live library](live-library) | Library, playback and queue events that refresh a page |
| [My streams](stream-library) | Save HTTP(S) audio URLs, browse groups, and play tracks from other enabled plugins. |
| [Navidrome](navidrome) | OpenSubsonic login, search, pagination and stream resolution. Use your own server to try login and playback. |

## Share a music source with other plugins

Declare `"sources.catalog"` in `gpui.requires.features`. Register a provider with `sources.registerProvider(id, {title}, {search, resolve, browse})`. The optional `browse({collectionId, page, pageSize, signal})` receives `null` for the root or a previously returned collection ID. Return `{tracks, collections, hasMore}`. Each collection has a stable ID, title and kind (`album`, `playlist` or `folder`). Return at most the requested number of entries in total. Pages start at 1 and hold up to 24 entries.

Use `await sources.list()` to discover enabled providers. Each descriptor contains `plugin`, `provider`, `title` and a `browse` flag. Pass a descriptor to `sources.search(source, query, {page, pageSize})` or `sources.browse(source, collectionId)`. Search-only providers remain discoverable. To queue a result, call `queue.submit({mode: 'append', tracks: [{kind: 'source', source, track}]})`. Use `play` or `playNext` for immediate or next playback.

The player resolves the stream when it needs to play. Use a stable `providerTrackId` and return playable URLs and credentials only from `resolve`. Queue snapshots persist the reference and display metadata. Restored entries need the provider enabled and signed in when applicable. When connected to a matching local Core, an enabled desktop provider shares its catalog and live login session with other controllers. Queue commands target the controller’s selected zone. Stopping the provider withdraws it. Restarting it with the same IDs makes queued references playable again.

For playback with the desktop closed, run `echo-server --local-core --database /path/to/library.sqlite --workshop-source community.stream-library`. Repeat the flag for additional providers. Install and approve the exact package in the workshop store beside the Core database, then stop its desktop instance before starting the Core. The Core opens the installed revision and its plugin data. Providers that need a login must restore their credentials when starting headless.

## Build and verify

The [SDK ZIP](https://github.com/Moekotori/echo-gpui-workshop-sdk/releases/latest) includes an offline tool.
Run these commands from the extracted SDK with Node.js 18.17 or later. No npm install is needed.

```sh
node sdk.mjs templates
node sdk.mjs init my-plugin community.yourname.my-plugin
node sdk.mjs check my-plugin
node sdk.mjs capabilities
```

Use `--template stream-library`, `--template live-library` or `--template navidrome` to choose another starter. The offline check reads the
native GPUI manifest, validates the entry path, and checks entry syntax without running the plugin.
Use `--workshop test` in ECHO GPUI to validate the runtime and `--workshop pack` to create the install ZIP.

### Discover and require host APIs

`node sdk.mjs capabilities` prints the SDK snapshot. `echo-gpui --workshop capabilities` prints the installed
build's native API, matching its `host.describe` response. In a native manifest, set
`gpui.requires` to `{ "commands": ["library.playlistItems"], "events": ["library.changed"] }`
when those APIs are required for startup. New hosts check this declaration when opening the package.
Older builds may ignore it. Use `host.describe` for features that have a fallback.
Device availability and permission checks still apply when a command runs.

`node sdk.mjs capabilities --original-catalog path/to/capability-catalog.json` compares original API 2
action names against the GPUI legacy Bridge dispatcher. The comparison covers direct dispatch.
Runner-local, network-routed, and theme actions are outside its scope. The snapshot lists registered
runner-local actions under `original.runnerActions`.

Original API 2 plugins can call `echo.host.getCapabilities()` and `echo.host.getFeatureAvailability(actionId)`
for support, permission and availability in their current session. Check `available` before enabling a control.
Legacy event handlers can subscribe with `echo.events.on(name, handler)`. The runtime `getCapabilities().events` lists subscribed-eligible events for the current permissions.
Native plugins can use `library.onFavoritesChanged(handler)` when only local favorite changes matter.

### Check an original ECHO plugin before migrating

The [original API 2 extensions and osu! example](original/README.md) cover trusted web sessions, beatmap imports,
Steam presence, PNG export, secure storage, native pages, and player and track menu actions.

```sh
node sdk.mjs check-original ./my-original-plugin --action library:getTracks --event playback:status
node sdk.mjs check-original ./my-original-plugin/content/community.echo --json
```

Pass an original project directory, its `echo.workshop.json`, an inner API 2 manifest, or a `.echo` package.
When you pass the outer Workshop manifest, the check verifies its embedded package size and SHA-256.
Use repeatable `--action` and `--event` flags to check permissions for the calls you plan to retain.
An unlisted name gets a warning. Errors return exit status 1, and `--json` exposes structured issues for CI.
The checker reads package metadata without executing the entry. Run GPUI's `--workshop test` for runtime validation.

### Local catalog lookup and rule search

Use `context.library.summary()`, `album(id)`, `albumForTrack(trackId)`, and `artist(id)`
to read local catalog data by ID. `albumFavoriteStates(ids)` accepts up to 200 album IDs
and returns a Boolean for each ID. Missing albums return `false`.

`context.library.searchTracks(rules, { page, pageSize })` searches matching tracks by
smart-playlist rules and returns `{ items, page, pageSize, total, hasMore }`. Pages start at
1 and hold up to 100 tracks. Search covers every matching candidate independently of the
saved playlist limit. Use the installed host to test rule queries with your library.

### Related albums, editions, and similar tracks

- `library.relatedAlbums(id, source?)` returns up to 12 other albums by the album artist.
- `library.albumVersions(id, source?)` returns the primary edition ID, linked editions, suggested editions, and measured loudness ranges in LU by album ID. Both album queries default to `Local` and accept `Legacy`.
- `library.similarLocalTracks(id)` returns up to 24 similar tracks from the local catalog. Matching uses catalog data such as artist, genre, tempo, and release year and runs locally.

Declare each command your plugin needs in `gpui.requires.commands`, for example `library.albumVersions`. Standalone apps can check support with `core.describe()` and call the same methods on `core.library`.

### Original API 2 catalog lookup

API 2 plugins use `echo.library.getSummary()`, `getAlbum(id)`, `getAlbumForTrack(trackId)`,
`getArtist(id)`, `favorites.getAlbumStates(ids)`, and `searchTracks({ rules }, { page, pageSize })`
with `library:read`. Searching by file path or folder requires `library:path`.
The search response omits local file paths.

### Favorites

`context.library.toggleTrackLiked(id)` and `toggleAlbumLiked(id)` return the committed `liked` state.
Use `setTracksLiked(ids, liked)` to update up to 256 tracks together and `trackFavoriteStates(ids)`
to read up to 200 states. `setArtistFavorite(id, favorite)` sets the local artist's favorite state.
Use a track ID and a zero-based position with `moveLikedTrack(id, position)`.

Original API 2 plugins use `echo.library.toggleTrackLiked` and `toggleAlbumLiked` or
`echo.library.favorites.moveTrack(itemId, position)` with `library:control`.
For `moveTrack`, pass the list item ID from `favorites.getTracks()`.

### Edit local track lyrics

Read the current track or a local track with `context.lyrics.get(trackId?)`. Apply an LRC, TTML, or
plain-text document with `applyCustom(trackId, text, format)`. Use `setOffset(trackId, offsetMs)`
or `setCurrentOffset(offsetMs)` for track timing. The host clamps the stored offset to ±10 seconds
and returns it separately from the lyric timestamps. `markInstrumental(trackId)` suppresses lyrics.

`clearOverride(trackId)` restores the normal lyric source lookup and preserves the saved offset.
These edits update the GPUI library override and retain the original media file tags.
Original API 2 plugins use the same operations through `echo.lyrics`, with `clearCache(trackId)`
for reset. A plugin declares `lyrics:read` for reads and `lyrics:write` for edits.
Use the installed host to test edits with a local track.

### Private records and cache

Use `context.storage.records` for durable JSON records. `set(bucket, key, value, summary, budget, expectedRevision?)`
returns the new revision. Pass `null` to create only, the current revision for a conditional update, or omit it
to write unconditionally. Conditional writes and deletes can return `record-conflict`. Each budget has
`maxEntries` and `maxBytes`. `list(bucket, { limit, before })` returns at most 50 summaries per page.
Pass the prior `nextCursor` as `before`. Summaries accept up to 2 KiB.

Use `context.storage.cache` for reusable results. `cache.set(bucket, key, value, { maxEntries, maxBytes, expiresAt })`
takes an absolute Unix timestamp in milliseconds. Adding a value removes expired entries and evicts least recently
used entries to meet both budgets. Add `ifAbsent: true` to preserve an existing unexpired value.

Original API 2 plugins use `echo.storage.records` and `echo.storage.cache` with `fs:plugin`. The
`echo.storage.files` namespace also provides private get, set, remove, records and cache within the
GPUI-managed plugin directory. Existing GPUI key-value entries keep their previous storage.
For secrets, use `context.credentials`. Verify persistence across restarts in the installed host.

### Playback controls and DSP

`context.playback.getSpeed()` and `setSpeed(rate, mode)` read and update the speed and mode
together. Rates are 0.5–2 and modes are `Speed`, `Nightcore`, and `Daycore`.
`getSegmentLoop()` returns the available A/B marks and the current `trackInstance`.
Pass that ID to `editSegmentLoop(trackInstance, edit)` to mark, move, toggle, jump to A, or clear.
Stale track instances are rejected. Looping is available on suitable seekable playback routes.

`context.audio.getAnalysis()` reads the current output spectrum and available peak/RMS levels.
It returns `null` when no fresh frame is available. Use `onAnalysis` for continuous updates.
Original API 2 plugins can read the spectrum with `echo.audio.getSpectrum()` and `audio:spectrum`.

With ECHO Pro DSP, native and original plugins can use `audio.dsp.getGraph()`, `applyGraph(graph)`,
`getRackOrder()`, and `setRackOrder(order)`. Read the graph revision, edit that snapshot, and
submit it with the same revision. On `dsp-graph-conflict`, fetch the current graph before retrying.
Rack orders preserve filter instances. Importing or editing convolution bank references uses the app.
API 2 uses `audio:dsp-read` for reads, `audio:dsp-read` and `audio:dsp-graph-write` for graph updates,
and `audio:dsp-write` for order changes. `listModules()` lists built-in modules this host can read.

### Sleep timer and tags

Native plugins can call `context.sleepTimer.getStatus()`, `start({ durationMinutes, action, fadeOut })`,
`cancel()`, and `onTick(({ remainingMs }) => ...)`. The timer is shared with the player. Start accepts
1–720 whole minutes and `pause`, `stop`, or `quit`. Call the unsubscribe function returned by `onTick`
when the listener is no longer needed. API 2 plugins use `echo.sleepTimer` with `sleep-timer:control`.
Offline preview updates its timer fixture on start and cancel. Verify the countdown in the app.

`context.library.tags.mixedItems(tagId, page)` returns a 30-item page across albums, artists, and tracks.
API 2 plugins can use `echo.library.tags.list(target?)`, `getItems(tagId, page?)`, and `change(edit)`.
Reads require `library:read` and changes require `library:personal-write`.

### Preview with example data

```sh
node sdk.mjs preview starter --action demo.remember
node sdk.mjs preview starter --command now-playing
node sdk.mjs preview live-library --action play --input '"demo-2"'
```

The SDK runs the plugin with the GPUI JavaScript runner and prints contributions and the page or command result as JSON.
Pass `--page` to select a page, `--action` to invoke a button, or `--command` to run a registered command.
`--input` supplies JSON action or command data. `--fields` takes a JSON object of string form values.
Each run starts with a temporary data directory and example library and queue. Preview only trusted code, since the
plugin runs with your OS account permissions. Use ECHO GPUI for real library, device, and layout checks.

### Verify in ECHO GPUI

In the commands below, replace `echo-gpui` with the executable from your ECHO GPUI installation.
For a standalone Windows build use `echo-gpui.exe`. If you installed GPUI through Steam, choose
**Manage → Browse local files** from your Steam Library and use `EchoZankyo.exe` in the install folder.
On macOS look in the app bundle's `Contents/MacOS` folder.

```sh
echo-gpui --workshop doctor
echo-gpui --workshop templates
echo-gpui --workshop init my-plugin community.yourname.my-plugin
cd my-plugin
echo-gpui --workshop check
echo-gpui --workshop test
echo-gpui --workshop test . now-playing
echo-gpui --workshop pack my-plugin-0.1.0.zip
echo-gpui --workshop test my-plugin-0.1.0.zip
```

The starter registers `now-playing`. Passing its ID to `test` prints the command's JSON result.
Native commands can also take a JSON argument after the command ID.

Use [the manifest schema](schemas/manifest.schema.json) for editor validation and
[`echo-workshop.d.ts`](starter/echo-workshop.d.ts) for API signatures. A GPUI plugin sets `gpui.protocol`
to `1` and points `gpui.entry` to a package-relative `.mjs` file. Register contributions in `activate(context)`,
handle custom page actions in `handle(request, context)`, and release resources in `dispose(context)`.
Use `await context.hostInvoke('host.describe')` to discover the running host's commands and events.

The [API reference and recipes](README.md#调用-echo) cover library paging, playback, queue edits, plugin storage,
credentials and events. Test on the ECHO GPUI build your users will run. The [original ECHO SDK](https://github.com/Moekotori/echo-workshop-sdk)
uses plugin API 2. For an existing original ECHO plugin, see the [GPUI migration notes](README.md#从原版-echo-迁移).
GPUI supports the original `echo.audio.output` status and device-list calls with `audio:output-read`.
With `audio:output-write`, `setOutput(settings)` can change automatic output, the selected device,
available modes and latency profiles. Pass the index and name from the latest device list when selecting a device.

### Playlist editing and recovery

Original API 2 plugins with `library:read` can browse tracks, albums, artists, genres, their related collections,
and favorites in the local index. Common search, sort, and format filters are supported. Unmapped filters and
remote-provider queries report an error. Use `library:control` to set track or album favorites.

Use `library.playlistSummaries({ search, page, pageSize })` and `library.playlistSummary(id)` to read local playlist metadata.
`library.createPlaylistWithDetails({ title, description })` saves both fields together.
`library.prependPlaylistTracks(id, trackIds)` inserts new tracks at the beginning and returns the added entries.
Original API 2 aliases also support listing, reading, creating, editing, and adding tracks to local manual playlists.

`library.updatePlaylist(id, { title, description })` accepts either field. An empty description clears it.
`library.movePlaylistTrack(id, trackId, position)` uses a one-based destination in a manually ordered local playlist.
Use `library.playlistItems(id, { page, pageSize })` to get playlist entry IDs, including unmatched entries.
`library.movePlaylistItem(id, itemId, position)` moves an entry to a zero-based position in a manually ordered playlist.
Original API 2 plugins can use `echo.library.playlists.moveItem` with the same position convention.
`library.removePlaylistItems(id, itemIds)` removes up to 200 entries atomically and returns a recovery ID.
Restore the batch with `library.restorePlaylistRecovery({ kind: 'items', id: recoveryId })`.
Use `library.archivePlaylist(id)` for recoverable removal. Page through `library.playlistRecovery(page)`
and pass the selected record to `library.restorePlaylistRecovery(record)`. See the [playlist guide](README.md#编辑与恢复歌单)
for the scope of offline fixtures and the live host.

`library.smart.previewSummary(rules)` returns candidate and included counts with up to 100 preview tracks.
Pass `{ title }` to `library.smart.freeze(id, options)` to name the resulting manual playlist.
Original API 2 plugins can also read, preview, create, update, and freeze smart playlists.
Path and folder predicates require `library:path`. Local skip predicates use queue changes recorded by the newer host.
`library.trackSkipStats(id)` returns the recorded count and latest skip time.

### Playback and output

Use `library.tracksByIds(ids)` to look up a batch of local tracks. To play a particular queue occurrence,
pass its `occurrenceId` and the page's `queueId` to `queue.playItem`.
`queue.submit` accepts up to 1,000 tracks per call on the current host, subject to message size limits. Read `maxQueueItems` from `host.describe` for compatibility with older hosts.
Read thumbnails with `artwork.track(id, source?)`, `artwork.album(id, source?)`, or `artwork.current(sequence?)`. Each resolves to `{width, height, dataUrl}` or `null`. Assign `dataUrl` to a key in `layout.images`. Passing the current track sequence rejects a late image after a track change.

Use `queue.get({offset, limit, queueId})` to read 1–256 entries on the local or independent Core. Search with `queue.search(query, {source?, remoteId?})` and pass a hit’s queue ID and zero-based index to `queue.playAt(queueId, index)`. `queue.saved.list()` returns saved queue summaries with string IDs. Save, restore or remove using `queue.saved.save(queueId)`, `queue.saved.restore(queueId, snapshotId)` and `queue.saved.remove(snapshotId)`. Call `list()` on first open and subscribe with `queue.saved.onChanged(listener)` for later changes. The event supplies `snapshots` and `undoRemoveId`. Pass that ID to `queue.saved.undoRemove(id)` to undo the last deletion. For a runnable example, preview the live-library template with `--command inspect-session --input '{"query":"first"}'`.

Original API 2 queue reads use `queue:read`; editing, enqueueing and playing use `queue:control`.
Reuse the latest page's `sessionId` and `revision` to detect changes across pages.

`playback.getRate()` and `setRate(rate)` read and change speed from 0.5× to 2× in hundredth steps.
Use `seekBy(seconds)` for signed offsets. Shuffle and repeat commands select GPUI's active playback mode.
See the [playback guide](README.md#播放输出) for the mode and output behavior.

Use `playback.getCurrentTrack()` to read the current track and its catalog ID, and `playback.onChanged(listener)`
to receive playback snapshots. The subscription returns a function that stops delivery.
`audio.output.getStatus()` reports the selected route, configured local output, and the active local Audio Host format,
when available. Use `audio.output.listDevices()` when opening or refreshing a local device list.
Use `audio.output.setOutput({ target: { kind: 'device', id } })` when the user selects a device.
The accepted local configuration is returned. See the [output guide](README.md#播放输出) for system defaults,
automatic output, mode, and latency settings.
Check `host.describe` for the corresponding commands when targeting older hosts.

## Publish

- **ZIP** — Share the packed ZIP. Users can drop it into Plugins or select it under **Installed → Install or import file**.
- **Steam Workshop** — Connect Steam, open **Plugins → Create → Choose project folder** and select your SDK project. You can also use the upload button on an open development project, or choose a ZIP or manifest.
  For the first upload, ECHO looks for `preview.png`, `preview.jpg`, `preview.jpeg` or `preview.gif` (under 1 MiB) in the project root or package. If none is found, choose an image. Confirm visibility to publish.
  For an update, bump the manifest version and keep the plugin ID. Use the same Steam account on the machine holding the publication receipt. Check the item number and choose **Update content** to keep its Steam preview and visibility, or change both in the dialog.
- **Independent install link** — Set `gpui.updateFeed` to your public HTTPS release JSON before packing. Keep this
  URL and the plugin ID across versions. Run `echo-gpui --workshop release-feed my-plugin-0.1.0.zip <https-zip-url>`.
  Upload the ZIP first, then publish the generated JSON. Users can paste the JSON URL into **Installed → Install from link**.
  See the [release feed format and update steps](README.md#通过链接分发和更新).

Report bugs or request SDK capabilities in [GitHub Issues](https://github.com/Moekotori/echo-gpui-workshop-sdk/issues).
Include the ECHO GPUI version, platform, a minimal manifest and the relevant log. Remove credentials and private library data.

### Expose a service to other players

Start an installed plugin whose current version has been approved with
`echo-server --local-core --database /path/to/library.sqlite --workshop-plugin community.playlist-service`.
Repeat the option for additional services. Plugins start in argument order. The existing
`--workshop-source` option also checks that the plugin registered a music provider.

Register your own JSON commands using `context.commands.register`. Other plugins can call
`context.commands.core.list()` to discover them and `context.commands.core.invoke(pluginId, commandId, input)`
to run them. The handler receives the caller's plugin ID and runs in the service's playback zone.
These APIs also work in single-process mode. The existing `commands.list/invoke` address the caller's host.

The `playlist-service` template stores ordered playlists of up to 256 reusable references in plugin records.
Send `save` a payload such as `{id, title, tracks}`. Read back `{value, summary, revision}` with
`get({id})` and submit `value.tracks` to the client's own queue. Pass the revision to replace or
remove a playlist. The `list` command accepts `{limit, before?}` and returns `items` and `nextCursor`.
Read references from `queue.get().items`, `playback.getCurrentTrack()` or a track-change event.
A row's `reference` is a catalog or registered-source item ready for `queue.submit`. Transient
rows return null and older hosts may omit the field. Preserve order and duplicates when saving.

A native app can use the workspace's Rust `echo-client` crate directly. Construct
`echo_client::Client::new(database_path)` with the local Core's database path, then call
`list_workshop_commands().await` and `invoke_workshop_command(caller_id, plugin_id, command_id, input).await`
over same-user IPC. Give your app its own stable caller ID.

Shell scripts can discover and invoke services with `echo-corectl`. Both commands print JSON.

```sh
echo-corectl /path/to/library.sqlite workshop list
echo-corectl /path/to/library.sqlite workshop invoke community.playlist-service list '{"limit":25}'
```

### Standalone applications

Import `createCoreClient` from `./standalone/core.mjs` in a Node application. TypeScript declarations ship alongside it. Provide `{database, appId, zone}` and use the controller in the platform SDK archive, put the matching `echo-corectl` on PATH, or pass its path as `executable` or `ECHO_CORECTL`. Build the native programs with `cargo build --release -p echo-server -p echo-client --bins`.

Call `await core.describe()` for the running Core's command list and limits. The typed client covers source browsing and search, queue editing and saved snapshots, playback control and speed, bookmarks and saved segments, track versions and ordered links, artwork, lyrics, history, timers, signal path, output and DSP. Use `core.invoke(method, input)` for any advertised command. Calls use the existing Workshop input schemas and entitlement checks. Plugin handlers see the caller as `app/<appId>`. Plugin-private credentials and storage belong to the plugin runtime.

`core.forZone(2)` creates an independent client for the second playback zone. Each client sends commands to its own `zone` and has its own lifetime. `for await (const snapshot of core.watch({signal}))` delivers an initial state followed by updates for that zone. Breaking out or aborting releases the subscription. Open a new subscription after a disconnect. Subsequent calls rediscover the Core. Check the resulting state before retrying an interrupted write. Close each client when finished.

Run `node standalone/player.mjs DATABASE` to list sources. Use `node standalone/player.mjs DATABASE PLUGIN PROVIDER "query" --zone 2` to search. Add `--append 1` or `--play 1` to select the first result.

Rust clients call `Client::workshop_host` and `Client::subscribe`. Any language can use `echo-corectl DATABASE --zone 2 sdk APP_ID session`. Send one UTF-8 JSON object per line, such as `{"method":"queue.get","input":{"limit":10}}`. Read one ordered response per request, with a `value` or an `error`. Use `sdk APP_ID watch` for a stream of snapshots or `sdk APP_ID call METHOD '[JSON]'` for a single call.

### Watch available sources and service commands

Use `for await (const {revision, sources, commands} of core.watchDiscovery({signal, reconnect: true}))` to replace your menus with the initial directory and each updated directory. Sources and commands from one registration appear together across zones. A provider leaving or disconnecting removes its entries. Slow readers receive the latest snapshot. Compare revisions within a single Core run. Break, abort, or close the client to unsubscribe. With `reconnect: true`, the reader can start before the Core or stay open across restarts. It retries transient connection failures with backoff from 200 ms to 5 s and delivers a full snapshot on reconnection, even for the same revision number. Aborting also stops pending retries. The default reports a disconnect to the caller.

Run `node standalone/player.mjs DATABASE --watch` while starting or stopping the station example. Rust clients can use `Client::watch_workshop_discovery(true)` and `next().await` to reconnect. With `echo-corectl DATABASE sdk APP_ID watch-discovery`, write and flush one newline per requested JSON line. Keep stdin open while waiting. Close it to unsubscribe. Add `--reconnect` to keep reading across Core restarts.

### Provide music and commands from a standalone app

Use `await core.provide({sources, commands})` to publish an application's contributions together to the local Core. Each source has an ID, title, search and resolve handlers, and optional browse handler. Commands have an ID, title and `run(input, {callerPluginId, signal})`. Other clients discover the app ID in `sources.list()` and `commands.list()`, then use their existing source and command APIs. Workshop plugins discover service commands via `context.commands.core`. Queues remain zone-specific.

Run `ECHO_STATION_URL='https://your-server.example/live.mp3' node standalone/station.mjs DATABASE 'My station'` for an example that publishes both a music source and a playlist service. From another client, call `const list = await player.commands.invoke('example.station', 'playlist')` and `await player.queue.submit({mode:'append', tracks:list.tracks})`.

The promise resolves after the Core acknowledges registration. Use stable IDs and resolve stream URLs at playback. Handle cancellation via the supplied signal. A second live instance using the same ID is rejected. Await `registration.close()` to stop serving, or close the client. Exiting the app releases its registrations. Observe `registration.closed` for disconnects and register again after the Core returns.

Rust exposes `Client::register_workshop_app` with separate event and reply halves. Other languages can use `echo-corectl DATABASE sdk APP_ID provide` with newline-delimited JSON. Send a manifest with `sources: [{id,title,browse}]` and `commands: [{id,title}]`, then await `{"type":"ready"}`. For each `{type:"call", id, method, input}` reply once with `{id, value}` or `{id, error}`. On `{type:"cancel",id}`, abort and reply unless the terminal response was already sent. Close stdin to unregister. For acknowledged release and immediate ID reuse, send `{"type":"release"}` and wait for `{"type":"released"}`.


## Library enrichment

[Library enrichment](library-enrichment/README.md) scans local tracks in cursor-paged batches using `library.enrichment.scan`. It reviews online candidates before calling `library.enrichment.fillTags` or `lyrics.fillMissing`. The host checks that the data is still missing before saving. Use `network.request` for bounded HTTPS requests that respect the host network settings and `artwork.previewUrl` for image previews.
