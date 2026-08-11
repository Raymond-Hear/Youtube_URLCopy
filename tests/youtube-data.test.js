"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const DataCore = require("../src/youtube-data.js");

test("从 YouTube HTML 中提取初始数据和分页配置", () => {
  const html = `
    <script>var ytInitialData = {"contents":{"videoRenderer":{"videoId":"_GPSfzoVvC4"}}};</script>
    <script>ytcfg.set({"INNERTUBE_API_KEY":"test-key","INNERTUBE_CLIENT_VERSION":"2.20260812.01.00","VISITOR_DATA":"visitor-1","INNERTUBE_CONTEXT":{"client":{"clientName":"WEB","clientVersion":"2.20260812.01.00"}}});</script>
  `;

  assert.equal(
    DataCore.extractInitialData(html).contents.videoRenderer.videoId,
    "_GPSfzoVvC4"
  );
  const config = DataCore.extractInnertubeConfig(html);
  assert.equal(config.apiKey, "test-key");
  assert.equal(config.clientVersion, "2.20260812.01.00");
  assert.equal(config.visitorData, "visitor-1");
  assert.equal(config.context.client.clientName, "WEB");
});

test("按页面顺序提取普通视频并排除 Shorts、直播和已复制项", () => {
  const payload = {
    contents: [
      { videoRenderer: { videoId: "_GPSfzoVvC4", title: { simpleText: "普通视频 1" } } },
      { videoRenderer: { videoId: "_SpyH8wTA-4", title: { simpleText: "已经复制" } } },
      {
        videoRenderer: {
          videoId: "2byPP_9F0-Q",
          badges: [{ metadataBadgeRenderer: { style: "BADGE_STYLE_TYPE_LIVE_NOW" } }]
        }
      },
      {
        reelShelfRenderer: {
          items: [{ videoRenderer: { videoId: "35SPFdc1eXY" } }]
        }
      },
      {
        lockupViewModel: {
          contentId: "3y-WiiUaqb4",
          contentType: "VIDEO",
          metadata: {
            lockupMetadataViewModel: { title: { content: "普通视频 2" } }
          }
        }
      }
    ]
  };

  const result = DataCore.collectPageData(payload, {
    excludedIds: ["_SpyH8wTA-4"]
  });
  assert.deepEqual(
    result.items,
    [
      { videoId: "_GPSfzoVvC4", title: "普通视频 1" },
      { videoId: "3y-WiiUaqb4", title: "普通视频 2" }
    ]
  );
});

test("标题兼容 runs 文本并压缩多余空白", () => {
  const payload = {
    videoRenderer: {
      videoId: "I4bES-sGzdM",
      title: { runs: [{ text: "标题 " }, { text: " 片段" }] }
    }
  };
  assert.deepEqual(DataCore.collectPageData(payload).items, [
    { videoId: "I4bES-sGzdM", title: "标题 片段" }
  ]);
});

test("尽力排除带 Streamed 标记的直播回放", () => {
  const payload = {
    videoRenderer: {
      videoId: "7I50PECz7SU",
      publishedTimeText: { simpleText: "Streamed 2 days ago" }
    }
  };
  assert.deepEqual(DataCore.collectPageData(payload).items, []);
});

test("提取主内容 continuation 并忽略 Shorts shelf 的 continuation", () => {
  const payload = {
    contents: [
      {
        reelShelfRenderer: {
          continuationEndpoint: {
            continuationCommand: { token: "shorts-token" },
            commandMetadata: { webCommandMetadata: { apiUrl: "/youtubei/v1/browse" } }
          }
        }
      },
      {
        continuationItemRenderer: {
          continuationEndpoint: {
            continuationCommand: { token: "main-token" },
            commandMetadata: { webCommandMetadata: { apiUrl: "/youtubei/v1/search" } }
          }
        }
      }
    ]
  };

  assert.deepEqual(DataCore.collectPageData(payload).continuations, [
    { token: "main-token", apiUrl: "/youtubei/v1/search" }
  ]);
});

function videoId(index) {
  return `V${String(index).padStart(10, "0")}`;
}

function pagePayload(start, count, nextToken = null) {
  const contents = Array.from({ length: count }, (_value, offset) => ({
    videoRenderer: {
      videoId: videoId(start + offset),
      title: { simpleText: `视频 ${start + offset}` }
    }
  }));
  if (nextToken) {
    contents.push({
      continuationItemRenderer: {
        continuationEndpoint: {
          continuationCommand: { token: nextToken },
          commandMetadata: { webCommandMetadata: { apiUrl: "/youtubei/v1/browse" } }
        }
      }
    });
  }
  return { contents };
}

test("分页游标保留未用完的视频，下一批从游标继续", async () => {
  const pages = new Map([
    ["cursor-a", pagePayload(31, 30, "cursor-b")],
    ["cursor-b", pagePayload(61, 15)]
  ]);
  const first = await DataCore.collectBatchFromPages({
    initialPayload: pagePayload(1, 30, "cursor-a"),
    targetCount: 50,
    fetchContinuation: async (cursor) => pages.get(cursor.token)
  });

  assert.equal(first.items.length, 50);
  assert.deepEqual(first.items.map((item) => item.videoId),
    Array.from({ length: 50 }, (_value, index) => videoId(index + 1)));
  assert.deepEqual(first.queuedItems.map((item) => item.videoId),
    Array.from({ length: 10 }, (_value, index) => videoId(index + 51)));
  assert.equal(first.nextContinuation.token, "cursor-b");
  assert.equal(first.exhausted, false);

  const second = await DataCore.collectBatchFromPages({
    initialPayload: pagePayload(1, 30, "cursor-a"),
    queuedItems: first.queuedItems,
    startContinuation: first.nextContinuation,
    sourceExhausted: first.sourceExhausted,
    excludedIds: first.items.map((item) => item.videoId),
    targetCount: 50,
    fetchContinuation: async (cursor) => pages.get(cursor.token)
  });

  assert.equal(second.items.length, 25);
  assert.equal(second.items[0].videoId, videoId(51));
  assert.equal(second.items[0].title, "视频 51");
  assert.equal(second.items.at(-1).videoId, videoId(75));
  assert.equal(second.exhausted, true);
  assert.equal(second.nextContinuation, null);
});

test("已保存游标失效时自动回退初始页并保持去重", async () => {
  let fallbackCount = 0;
  const result = await DataCore.collectBatchFromPages({
    initialPayload: pagePayload(1, 3),
    startContinuation: { token: "expired", apiUrl: "/youtubei/v1/browse" },
    excludedIds: [videoId(1)],
    targetCount: 50,
    fetchContinuation: async () => {
      throw new Error("expired");
    },
    onCursorFallback: () => {
      fallbackCount += 1;
    }
  });

  assert.equal(fallbackCount, 1);
  assert.deepEqual(result.items.map((item) => item.videoId), [videoId(2), videoId(3)]);
  assert.equal(result.exhausted, true);
});
