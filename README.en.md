# Multi-Platform Video Link Batch Copy

[简体中文](README.md) · English

![License](https://img.shields.io/badge/License-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-2.0.0-green.svg)

A local Microsoft Edge extension that places a link-copy tool in the top-right corner of YouTube, Bilibili, Douyin, and Xiaohongshu pages. It supports batch copying, pre-copy selection, title + link, TXT/CSV export, and a keyboard shortcut. The GitHub icon in the tool header opens this repository directly.

## 2.0 Local Preview

- Added Bilibili, Douyin, and Xiaohongshu support; existing YouTube features are unchanged.
- Each of the four platforms saves its own source and batch progress independently.
- Bilibili outputs clean `https://www.bilibili.com/video/BV...` links without tracking parameters.
- Douyin outputs `https://www.douyin.com/video/<numeric-id>`.
- Xiaohongshu only recognizes video notes with a play marker and won't mix in regular image-text notes.
- Xiaohongshu keeps the page-provided `xsec_token` and source parameters, because removing them breaks some videos in practice.
- Bilibili, Douyin, and Xiaohongshu temporarily scroll the current list to load more content while reading, then return to the original position.
- All three platforms support batch sizes of `10 / 25 / 50`, pre-copy selection, TXT/CSV export, and the `Alt + Shift + Y` shortcut.

### Supported Pages

- YouTube: channels, playlists, search results.
- Bilibili: uploader pages, search results, trending/section lists, single video pages.
- Douyin: creator pages, search results, featured/recommended lists, single video pages.
- Xiaohongshu: creator pages, search results, explore feed, single video note pages.

## Features

- Copy format: "links only" or "title + link".
- Batch size: `10 / 25 / 50`, remembers the last choice.
- Optional "pre-copy selection" to deselect unwanted videos one by one.
- Deselected videos are marked as skipped and won't reappear in later batches.
- Unconfirmed selections are saved locally and survive a page refresh.
- View and re-copy the previous batch.
- Export TXT or UTF-8 BOM CSV.
- Progress is saved per source and only advances after a successful clipboard write.
- The `Alt + Shift + Y` shortcut uses the same copy flow as the red on-page button.

## Install / Update in Edge

1. Open `edge://extensions/` in the Edge address bar.
2. Enable "Developer mode" on the left.
3. For a first install, click "Load unpacked" and select this project folder.
4. If you already have an older version, click "Reload" on the extension card.
5. Refresh the open platform pages so the new buttons get injected.

The extension card should show version `2.0.0` and the name "多平台视频链接分批复制". When first updating to 2.0, Edge may ask you to confirm the newly added Bilibili, Douyin, and Xiaohongshu site access.

## Usage

1. Open any desktop page listed under "Supported Pages" above.
2. Choose "links only" or "title + link".
3. Choose a batch size of `10`, `25`, or `50`.
4. To exclude some videos, enable "pre-copy selection"; leave it off for one-click copying.
5. Click the red copy button in the top-right corner of the page.
6. If "pre-copy selection" is on, deselect unwanted videos, then click "Copy N selected".
7. Click the next-batch button to get subsequent content without repeating the previous batch.
8. If the clipboard gets overwritten, click "Re-copy previous batch".
9. Click "Export TXT" or "Export CSV" to save the full copied list for the current source.

You can also click the extension icon in the browser toolbar or press `Alt + Shift + Y` — same effect as the on-page button. If the shortcut conflicts, change it at `edge://extensions/shortcuts`.

Links are separated by a blank line, for example:

```text
https://www.youtube.com/watch?v=_GPSfzoVvC4

https://www.bilibili.com/video/BV17f421S7YF

https://www.douyin.com/video/7606433195454163429
```

## Batches & Recovery

- Progress is saved per platform, creator page, list, and search query.
- A batch counts as copied only after a successful clipboard write.
- Unconfirmed batches are not skipped on refresh or close.
- "Restart" only clears progress for the current page's source.
- On a full read failure, "Copy visible" copies only the already-loaded links that haven't been copied yet.

## Platform Rules & Limitations

- YouTube outputs only standard `watch?v=` URLs and excludes Shorts, live streams, and scheduled premieres.
- Bilibili and Douyin strip list, source, and tracking parameters, keeping only the standard video URL.
- Xiaohongshu keeps the page access parameters required to open videos; these are platform-generated and may expire, in which case return to the original list to fetch them again.
- Xiaohongshu filters videos by the page's play marker; recognition rules may need updating when the platform's page structure changes.
- Ended YouTube live streams can only be best-effort excluded based on page markers; 100% detection across all page versions is not guaranteed.
- Only the desktop web versions of the four platforms are supported — not mobile, in-client embedded pages, YouTube Music, or embedded players.
- The extension uses data already provided by each platform's page (such as YouTube's public innerTube pagination API); no developer key is required.

## Privacy

The extension has no server and needs no API key. Video links, page sources, and copy progress are processed locally in the browser only — nothing is uploaded, and no likes, follows, comments, or posts are made.

## Development

Requires Node.js 18 or later:

```powershell
npm test
npm run test:ui
npm run check
```

`test:ui` opens fully local mock pages for the four platforms in your Edge browser to verify platform filtering, batch selection, per-item deselection, clipboard, CSV export, and collapsed state, saving screenshots to the Git-ignored `.artifacts` folder.

## About the Author

Author: Lingfeng (Raymond) — an operations person who loves tinkering with AI.

For more, follow:

- WeChat official account: 聆风Raymond (Lingfeng Raymond)
- Xiaohongshu: [聆风的AI笔记](https://www.xiaohongshu.com/user/profile/62fc5b98000000001200d7c4) (Lingfeng's AI Notes)
- Jike (即刻): [LingfengRaymond](https://m.okjike.com/users/322d15cf-9e61-4e85-8c50-e0bd4cd42350)
- GitHub project: [Youtube_URLCopy](https://github.com/Raymond-Hear/Youtube_URLCopy)

## License

This project is open source under the [MIT License](LICENSE).
