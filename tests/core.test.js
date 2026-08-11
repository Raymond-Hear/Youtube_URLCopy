"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../src/shared.js");

test("识别频道首页并转换为视频采集页", () => {
  assert.deepEqual(
    Core.classifySource("https://www.youtube.com/@examplecreator"),
    {
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
      urls: [],
      exhausted: false
    }
  };

  assert.equal(Core.commitPendingBatch(state, "wrong-id"), state);
  const committed = Core.commitPendingBatch(state, "batch-2");
  assert.equal(committed.status, "copied");
  assert.equal(committed.batchNumber, 2);
  assert.deepEqual(committed.deliveredIds, ["_GPSfzoVvC4", "_SpyH8wTA-4"]);
  assert.equal(committed.pendingBatch, null);
  assert.equal(committed.lastBatch.batchId, "batch-2");
});

test("新来源默认包含可恢复的分页状态", () => {
  const state = Core.createDefaultSourceState();
  assert.deepEqual(state.pagination, {
    cursor: null,
    queuedItems: [],
    sourceExhausted: false
  });
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
