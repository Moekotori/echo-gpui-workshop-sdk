# 曲库补全

在 ECHO GPUI 的「插件 → 已安装」导入此目录或同目录打包的 ZIP，启用后点击这一行的「打开页面」。运行需要宿主能力 `library.enrichment`、`network.request` 和 `pages.layout`。

1. 点击「检查曲库」。页面分页检查已导入的本地曲目，分别统计缺封面、歌词、元数据和暂不可用的文件。
2. 点击缺项统计筛选。可以直接点一首的「单首补全」，也可以跨页勾选后点「查找所选」。点击「查找当前筛选全部」可直接处理筛选下所有可补全的曲目，无需逐页勾选。选择「全部缺项」时会查找每首曲目能补全的各类缺项。
3. 批量结果显示进度和各曲目的候选数。本次会话中可以停止后继续查找，已完成的曲目可直接打开候选。单首补全页可以修改匹配用的曲名和艺人，并重新查找。
4. 预览候选来源、专辑、时长和内容后，点击「补全这首曲目」。标签和封面走 ECHO 的文件标签写入队列。歌词保存到 ECHO 曲库。

| 来源 | 元数据 | 封面 | 歌词 |
| --- | --- | --- | --- |
| 网易云音乐 | ✓ | ✓ | ✓ |
| QQ 音乐 | ✓ | ✓ | ✓ |
| MusicBrainz | ✓ | 经 Cover Art Archive | |
| Apple iTunes | ✓ | | |
| LRCLIB | | | ✓ |

扫描时只读本地信息。点击查找后，曲名和艺人会发送给所选缺项对应的平台。平台请求使用 ECHO 的代理和离线设置，单个平台失败时仍可查看其余结果。CUE 分轨和不可写格式可以检查，标签与封面写入由宿主支持的文件格式和大小决定。分轨的补全歌词可单独保存。远程挂载、在线插件曲目及重复的 CUE 源文件不纳入检查。

元数据包含曲名、艺人、专辑、专辑艺人、流派、年份、曲序和碟号。封面检查包含内嵌图片、目录封面及曲目附带图片。歌词检查保留本地歌词及用户明确设置的纯音乐和移除状态。待写入的标签由宿主队列处理，可在文件空闲后重新检查。

地区、网络和平台接口状态会影响候选覆盖。网易云音乐和 QQ 音乐适配沿用原版 ECHO 网络歌词插件使用的接口。MusicBrainz、Cover Art Archive、Apple Search API 和 LRCLIB 的公开文档如下。

- [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API)
- [Cover Art Archive API](https://musicbrainz.org/doc/Cover_Art_Archive/API)
- [Apple iTunes Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/)
- [LRCLIB API](https://lrclib.net/docs)
