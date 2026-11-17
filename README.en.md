# ECHO GPUI Workshop SDK

[中文开发指南](README.md) · [Download](https://github.com/Moekotori/echo-gpui-workshop-sdk/releases/latest)

Build plugins for ECHO GPUI with JavaScript and an installed copy of the app. Plugins can add native pages,
search providers, track metadata and cover suggestions, and commands other plugins can call. Use or adapt the
SDK files under the [MIT license](LICENSE).

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
| [Navidrome](navidrome) | OpenSubsonic login, search, pagination and stream resolution. Use your own server to try login and playback. |

## Build and verify

The [SDK ZIP](https://github.com/Moekotori/echo-gpui-workshop-sdk/releases/latest) includes an offline tool.
Run these commands from the extracted SDK with Node.js 18.17 or later. No npm install is needed.

```sh
node sdk.mjs templates
node sdk.mjs init my-plugin community.yourname.my-plugin
node sdk.mjs check my-plugin
node sdk.mjs capabilities
```

Use `--template live-library` or `--template navidrome` to choose another starter. The offline check reads the
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

### Local catalog lookup and rule search

Use `context.library.summary()`, `album(id)`, `albumForTrack(trackId)`, and `artist(id)`
to read local catalog data by ID. `albumFavoriteStates(ids)` accepts up to 200 album IDs
and returns a Boolean for each ID. Missing albums return `false`.

`context.library.searchTracks(rules, { page, pageSize })` searches matching tracks by
smart-playlist rules and returns `{ items, page, pageSize, total, hasMore }`. Pages start at
1 and hold up to 100 tracks. Search covers every matching candidate independently of the
saved playlist limit. Use the installed host to test rule queries with your library.

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
- **Steam Workshop** — In **Plugins → Create**, select the ZIP or manifest and a PNG, JPEG or GIF preview under
  1 MiB. Publish privately first and verify the item in Steam. Reuse the same Steam account and plugin ID to update the item.
- **Independent install link** — Set `gpui.updateFeed` to your public HTTPS release JSON before packing. Keep this
  URL and the plugin ID across versions. Run `echo-gpui --workshop release-feed my-plugin-0.1.0.zip <https-zip-url>`.
  Upload the ZIP first, then publish the generated JSON. Users can paste the JSON URL into **Installed → Install from link**.
  See the [release feed format and update steps](README.md#通过链接分发和更新).

Report bugs or request SDK capabilities in [GitHub Issues](https://github.com/Moekotori/echo-gpui-workshop-sdk/issues).
Include the ECHO GPUI version, platform, a minimal manifest and the relevant log. Remove credentials and private library data.
