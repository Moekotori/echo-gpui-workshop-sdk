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
echo-gpui --workshop pack my-plugin-0.1.0.zip
echo-gpui --workshop test my-plugin-0.1.0.zip
```

Use [the manifest schema](schemas/manifest.schema.json) for editor validation and
[`echo-workshop.d.ts`](starter/echo-workshop.d.ts) for API signatures. A GPUI plugin sets `gpui.protocol`
to `1` and points `gpui.entry` to a package-relative `.mjs` file. Register contributions in `activate(context)`,
handle custom page actions in `handle(request, context)`, and release resources in `dispose(context)`.
Use `await context.hostInvoke('host.describe')` to discover the running host's commands and events.

The [API reference and recipes](README.md#调用-echo) cover library paging, playback, queue edits, plugin storage,
credentials and events. Test on the ECHO GPUI build your users will run. The [original ECHO SDK](https://github.com/Moekotori/echo-workshop-sdk)
uses plugin API 2. For an existing original ECHO plugin, see the [GPUI migration notes](README.md#从原版-echo-迁移).

### Playback and output

Use `playback.getCurrentTrack()` to read the current track and its catalog ID, and `playback.onChanged(listener)`
to receive playback snapshots. The subscription returns a function that stops delivery.
`audio.output.getStatus()` reports the selected route, configured local output, and the active local Audio Host format,
when available. Use `audio.output.listDevices()` when opening or refreshing a local device list.
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
