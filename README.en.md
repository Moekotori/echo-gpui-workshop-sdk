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

`library.updatePlaylist(id, { title, description })` accepts either field. An empty description clears it.
`library.movePlaylistTrack(id, trackId, position)` uses a one-based destination in a manually ordered local playlist.
Use `library.playlistItems(id, { page, pageSize })` to get playlist entry IDs, including unmatched entries.
`library.removePlaylistItems(id, itemIds)` removes up to 200 entries atomically and returns a recovery ID.
Restore the batch with `library.restorePlaylistRecovery({ kind: 'items', id: recoveryId })`.
Use `library.archivePlaylist(id)` for recoverable removal. Page through `library.playlistRecovery(page)`
and pass the selected record to `library.restorePlaylistRecovery(record)`. See the [playlist guide](README.md#编辑与恢复歌单)
for the scope of offline fixtures and the live host.

### Playback and output

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
