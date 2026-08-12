"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../src/shared.js");

test("识别频道首页并转换为视频采集页", () => {
  assert.deepEqual(
    Core.classifySource("https://www.youtube.com/@examplecreator"),
    {
      platform: "youtube",
      platformLabel: "YouTube",
      collectionMode: "youtube-data",
      type: "channel",
      sourceKey: "channel:/@examplecreator",
      collectorUrl: "https://www.youtube.com/@examplecreator/videos",
      label: "@examplecreator"
    }
  );
});

test("频道子页面仍归属于同一个来源", () => {
  const home = Core.classifySource("https://www.youtube.com/channel/UC123456789/videos");
  const about = Core.classifySource("https://www.youtube.com/channel/UC123456789/about");
  assert.equal(home.sourceKey, about.sourceKey);
  assert.equal(home.collectorUrl, "https://www.youtube.com/channel/UC123456789/videos");
});

test("识别播放列表并删除无关参数", () => {
  assert.deepEqual(
    Core.classifySource("https://www.youtube.com/playlist?list=PLabc123&index=7&si=tracking"),
    {
      platform: "youtube",
      platformLabel: "YouTube",
      collectionMode: "youtube-data",
      type: "playlist",
      sourceKey: "playlist:PLabc123",
      collectorUrl: "https://www.youtube.com/playlist?list=PLabc123",
      label: "播放列表 PLabc123"
    }
  );
});

test("搜索来源保留筛选条件并删除界面噪声参数", () => {
  const source = Core.classifySource(
    "https://www.youtube.com/results?search_query=AI+news&sp=CAI%253D&feature=history"
  );
  assert.equal(source.type, "search");
  assert.equal(source.sourceKey, "search:search_query=AI+news&sp=CAI%253D");
  assert.equal(
    source.collectorUrl,
    "https://www.youtube.com/results?search_query=AI+news&sp=CAI%253D"
  );
});

test("拒绝非支持页面", () => {
  assert.equal(Core.classifySource("https://www.youtube.com/watch?v=_GPSfzoVvC4"), null);
  assert.equal(Core.classifySource("https://m.youtube.com/@creator"), null);
  assert.equal(Core.classifySource("https://example.com/@creator"), null);
});

test("识别 B站博主、搜索页和单个视频", () => {
  const creator = Core.classifySource("https://space.bilibili.com/12345/video?spm_id_from=333");
  assert.equal(creator.platform, "bilibili");
  assert.equal(creator.sourceKey, "bilibili:space:12345");
  assert.equal(creator.collectionMode, "dom");

  const search = Core.classifySource("https://search.bilibili.com/all?keyword=AI&page=2");
  assert.equal(search.sourceKey, "bilibili:search.bilibili.com/all?keyword=AI");

  const video = Core.classifySource("https://www.bilibili.com/video/BV1ZTu96zEwg?p=2");
  assert.deepEqual(video.currentItem, {
    videoId: "BV1ZTu96zEwg",
    url: "https://www.bilibili.com/video/BV1ZTu96zEwg"
  });
});

test("识别抖音博主、搜索页和单个视频", () => {
  const creator = Core.classifySource(
    "https://www.douyin.com/user/MS4wLjAB?showTab=post&from_tab_name=main"
  );
  assert.equal(creator.sourceKey, "douyin:user:MS4wLjAB:post");
  assert.equal(creator.platformLabel, "抖音");

  const search = Core.classifySource("https://www.douyin.com/search/AI?type=video&from_nav=1");
  assert.equal(search.sourceKey, "douyin:www.douyin.com/search/AI?type=video");

  const video = Core.classifySource("https://www.douyin.com/video/7670990461129092435");
  assert.equal(video.currentItem.url, "https://www.douyin.com/video/7670990461129092435");
});

test("识别小红书博主、搜索页并为视频笔记保留访问参数", () => {
  const creator = Core.classifySource(
    "https://www.xiaohongshu.com/user/profile/abc?xsec_token=secret"
  );
  assert.equal(creator.sourceKey, "xiaohongshu:profile:abc");

  const search = Core.classifySource(
    "https://www.xiaohongshu.com/search_result?keyword=AI&source=web_search_result_notes"
  );
  assert.equal(search.sourceKey, "xiaohongshu:www.xiaohongshu.com/search_result?keyword=AI");

  const note = Core.classifySource(
    "https://www.xiaohongshu.com/explore/6a694c980000000009035ab9" +
      "?xsec_token=abc%3D&xsec_source=pc_feed"
  );
  assert.equal(
    note.currentItem.url,
    "https://www.xiaohongshu.com/explore/6a694c980000000009035ab9" +
      "?xsec_token=abc%3D&xsec_source=pc_feed"
  );
});

test("只从 watch 链接提取合法视频 ID", () => {
  assert.equal(
    Core.videoIdFromHref("/watch?v=_GPSfzoVvC4&list=PL123&index=3"),
    "_GPSfzoVvC4"
  );
  assert.equal(Core.videoIdFromHref("/shorts/_GPSfzoVvC4"), null);
  assert.equal(Core.videoIdFromHref("/watch?v=too-short"), null);
});

test("标准链接删除全部附加参数", () => {
  assert.equal(
    Core.normalizeWatchUrl("35SPFdc1eXY"),
    "https://www.youtube.com/watch?v=35SPFdc1eXY"
  );
  assert.equal(Core.normalizeWatchUrl("invalid"), null);
});

test("复制格式在每条链接之间保留一个空行", () => {
  assert.equal(
    Core.formatLinks([
      "https://www.youtube.com/watch?v=_GPSfzoVvC4",
      "https://www.youtube.com/watch?v=_SpyH8wTA-4"
    ]),
    "https://www.youtube.com/watch?v=_GPSfzoVvC4\r\n\r\nhttps://www.youtube.com/watch?v=_SpyH8wTA-4"
  );
});

test("标题加链接格式保留视频块之间的空行并兼容缺失标题", () => {
  const items = [
    {
      videoId: "_GPSfzoVvC4",
      title: "  普通   视频 1  ",
      url: "https://www.youtube.com/watch?v=_GPSfzoVvC4"
    },
    {
      videoId: "_SpyH8wTA-4",
      title: "",
      url: "https://www.youtube.com/watch?v=_SpyH8wTA-4"
    }
  ];
  assert.equal(
    Core.formatVideoItems(items, "title-link"),
    "普通 视频 1\r\nhttps://www.youtube.com/watch?v=_GPSfzoVvC4\r\n\r\nhttps://www.youtube.com/watch?v=_SpyH8wTA-4"
  );
  assert.equal(Core.normalizeCopyFormat("invalid"), "link");
});

test("旧批次和新批次都可以按选择的格式输出", () => {
  const batch = {
    videoIds: ["_GPSfzoVvC4", "_SpyH8wTA-4"],
    urls: [
      "https://www.youtube.com/watch?v=_GPSfzoVvC4",
      "https://www.youtube.com/watch?v=_SpyH8wTA-4"
    ],
    titles: ["视频一", "视频二"]
  };
  assert.equal(
    Core.formatBatch(batch, "title-link"),
    "视频一\r\nhttps://www.youtube.com/watch?v=_GPSfzoVvC4\r\n\r\n视频二\r\nhttps://www.youtube.com/watch?v=_SpyH8wTA-4"
  );
  assert.equal(
    Core.formatBatch({ urls: batch.urls }, "title-link"),
    Core.formatLinks(batch.urls)
  );
});

test("批次大小只接受本地界面提供的 10、25、50", () => {
  assert.deepEqual(Core.BATCH_SIZE_OPTIONS, [10, 25, 50]);
  assert.equal(Core.normalizeBatchSize(10), 10);
  assert.equal(Core.normalizeBatchSize("25"), 25);
  assert.equal(Core.normalizeBatchSize(50), 50);
  assert.equal(Core.normalizeBatchSize(100), 50);
  assert.equal(Core.normalizeBatchSize("invalid"), 50);
});

test("导出链接按已复制 ID 顺序规范化并去重", () => {
  assert.deepEqual(
    Core.urlsFromVideoIds([
      "_GPSfzoVvC4",
      "invalid",
      "_SpyH8wTA-4",
      "_GPSfzoVvC4"
    ]),
    [
      "https://www.youtube.com/watch?v=_GPSfzoVvC4",
      "https://www.youtube.com/watch?v=_SpyH8wTA-4"
    ]
  );
  assert.deepEqual(
    Core.itemsFromVideoIds(
      ["_GPSfzoVvC4", "_SpyH8wTA-4"],
      { "_GPSfzoVvC4": "视频一" }
    ),
    [
      {
        videoId: "_GPSfzoVvC4",
        url: "https://www.youtube.com/watch?v=_GPSfzoVvC4",
        title: "视频一"
      },
      {
        videoId: "_SpyH8wTA-4",
        url: "https://www.youtube.com/watch?v=_SpyH8wTA-4",
        title: ""
      }
    ]
  );
});

test("导出文件名包含来源、数量和日期且移除非法字符", () => {
  const filename = Core.createExportFilename(
    { type: "search", platformLabel: "YouTube", label: "搜索：AI / Agent?" },
    25,
    new Date(2026, 7, 12)
  );
  assert.match(filename, /^YouTube链接-搜索：AI - Agent-25条-2026-08-12\.txt$/);
  assert.doesNotMatch(filename, /[<>:"/\\|?*]/);
  assert.equal(
    Core.createExportFilename(
      { type: "channel", platformLabel: "YouTube", label: "@creator" },
      2,
      new Date(2026, 7, 12),
      "csv"
    ),
    "YouTube链接-@creator-2条-2026-08-12.csv"
  );
  assert.equal(
    Core.createExportFilename(
      { type: "creator", platformLabel: "B站", label: "测试UP主" },
      10,
      new Date(2026, 7, 12),
      "txt"
    ),
    "B站链接-测试UP主-10条-2026-08-12.txt"
  );
});

test("CSV 导出包含序号、标题、视频 ID 和标准链接并正确转义", () => {
  assert.equal(
    Core.formatCsvItems([
      {
        videoId: "_GPSfzoVvC4",
        title: "标题, \"测试\"",
        url: "https://www.youtube.com/watch?v=_GPSfzoVvC4"
      },
      {
        videoId: "_SpyH8wTA-4",
        title: "",
        url: "https://www.youtube.com/watch?v=_SpyH8wTA-4"
      }
    ]),
    "序号,标题,视频ID,链接\r\n" +
      "1,\"标题, \"\"测试\"\"\",_GPSfzoVvC4,https://www.youtube.com/watch?v=_GPSfzoVvC4\r\n" +
      "2,,_SpyH8wTA-4,https://www.youtube.com/watch?v=_SpyH8wTA-4"
  );
});

test("只有匹配的待复制批次才能推进状态并去重", () => {
  const state = {
    ...Core.createDefaultSourceState(),
    status: "ready",
    batchNumber: 1,
    deliveredIds: ["_GPSfzoVvC4"],
    pendingBatch: {
      batchId: "batch-2",
      batchNumber: 2,
      videoIds: ["_GPSfzoVvC4", "_SpyH8wTA-4"],
      titles: ["旧标题", "新标题"],
      urls: [],
      exhausted: false
    }
  };

  assert.equal(Core.commitPendingBatch(state, "wrong-id"), state);
  const committed = Core.commitPendingBatch(state, "batch-2");
  assert.equal(committed.status, "copied");
  assert.equal(committed.batchNumber, 2);
  assert.deepEqual(committed.deliveredIds, ["_GPSfzoVvC4", "_SpyH8wTA-4"]);
  assert.deepEqual(committed.skippedIds, []);
  assert.deepEqual(committed.titlesById, {
    "_GPSfzoVvC4": "旧标题",
    "_SpyH8wTA-4": "新标题"
  });
  assert.equal(committed.pendingBatch, null);
  assert.equal(committed.lastBatch.batchId, "batch-2");
});

test("复制前选择只提交勾选项并把取消项记为跳过", () => {
  const state = {
    ...Core.createDefaultSourceState(),
    deliveredIds: ["_GPSfzoVvC4"],
    pendingBatch: {
      batchId: "select-batch",
      batchNumber: 2,
      videoIds: ["_SpyH8wTA-4", "2byPP_9F0-Q", "35SPFdc1eXY"],
      urls: [
        "https://www.youtube.com/watch?v=_SpyH8wTA-4",
        "https://www.youtube.com/watch?v=2byPP_9F0-Q",
        "https://www.youtube.com/watch?v=35SPFdc1eXY"
      ],
      titles: ["保留 1", "取消", "保留 2"],
      selectedVideoIds: ["_SpyH8wTA-4", "35SPFdc1eXY"],
      awaitingSelection: true,
      exhausted: false
    }
  };
  const committed = Core.commitPendingBatch(state, "select-batch");
  assert.deepEqual(committed.deliveredIds, [
    "_GPSfzoVvC4",
    "_SpyH8wTA-4",
    "35SPFdc1eXY"
  ]);
  assert.deepEqual(committed.skippedIds, ["2byPP_9F0-Q"]);
  assert.deepEqual(committed.urlsById, {
    "_SpyH8wTA-4": "https://www.youtube.com/watch?v=_SpyH8wTA-4",
    "35SPFdc1eXY": "https://www.youtube.com/watch?v=35SPFdc1eXY"
  });
  assert.deepEqual(committed.lastBatch.videoIds, ["_SpyH8wTA-4", "35SPFdc1eXY"]);
  assert.deepEqual(committed.lastBatch.titles, ["保留 1", "保留 2"]);
  assert.deepEqual(
    { start: committed.lastBatch.rangeStart, end: committed.lastBatch.rangeEnd },
    { start: 2, end: 3 }
  );
  assert.equal(committed.lastBatch.originalCount, 3);
  assert.equal(committed.lastBatch.awaitingSelection, undefined);
});

test("复制前选择为空时不推进批次", () => {
  const state = {
    ...Core.createDefaultSourceState(),
    pendingBatch: {
      batchId: "empty-selection",
      batchNumber: 1,
      videoIds: ["_GPSfzoVvC4"],
      urls: ["https://www.youtube.com/watch?v=_GPSfzoVvC4"],
      titles: ["视频"],
      selectedVideoIds: [],
      awaitingSelection: true
    }
  };
  assert.equal(Core.commitPendingBatch(state, "empty-selection"), state);
});

test("新来源默认包含可恢复的分页状态", () => {
  const state = Core.createDefaultSourceState();
  assert.deepEqual(state.pagination, {
    cursor: null,
    queuedItems: [],
    sourceExhausted: false
  });
  assert.deepEqual(state.skippedIds, []);
  assert.deepEqual(state.urlsById, {});
});

test("批次范围兼容新批次字段和旧版本批次", () => {
  assert.deepEqual(
    Core.getBatchRange({ urls: ["a", "b"], rangeStart: 51, rangeEnd: 52 }, 52),
    { start: 51, end: 52 }
  );
  assert.deepEqual(
    Core.getBatchRange({ urls: ["a", "b", "c"] }, 53),
    { start: 51, end: 53 }
  );
  assert.deepEqual(
    Core.getBatchRange({ urls: ["a", "b"] }, 50, true),
    { start: 51, end: 52 }
  );
});
