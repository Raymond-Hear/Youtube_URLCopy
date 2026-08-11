(function attachYouTubeLinkCore(root, factory) {
  const core = factory();
  root.YTLinkCore = core;
  if (typeof module === "object" && module.exports) {
    module.exports = core;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createCore() {
  "use strict";

  const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
  const BATCH_SIZE_OPTIONS = Object.freeze([10, 25, 50]);
  const DEFAULT_BATCH_SIZE = 50;
  const YOUTUBE_HOSTS = new Set(["www.youtube.com", "youtube.com"]);
  const CHANNEL_PREFIXES = new Set(["channel", "user", "c"]);
  const IRRELEVANT_SEARCH_PARAMS = new Set([
    "app",
    "feature",
    "persist_app",
    "source_ve_path"
  ]);

  function safeUrl(rawUrl, baseUrl = "https://www.youtube.com/") {
    try {
      return new URL(rawUrl, baseUrl);
    } catch (_error) {
      return null;
    }
  }

  function isYouTubeHost(hostname) {
    return YOUTUBE_HOSTS.has(String(hostname || "").toLowerCase());
  }

  function normalizeSearchParams(searchParams) {
    const pairs = [];
    for (const [key, value] of searchParams.entries()) {
      if (!IRRELEVANT_SEARCH_PARAMS.has(key)) {
        pairs.push([key, value]);
      }
    }
    pairs.sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyOrder = leftKey.localeCompare(rightKey);
      return keyOrder || leftValue.localeCompare(rightValue);
    });

    const normalized = new URLSearchParams();
    for (const [key, value] of pairs) {
      normalized.append(key, value);
    }
    return normalized;
  }

  function getChannelBasePath(pathname) {
    const segments = pathname.split("/").filter(Boolean);
    if (!segments.length) {
      return null;
    }

    if (segments[0].startsWith("@") && segments[0].length > 1) {
      return `/${segments[0]}`;
    }

    if (CHANNEL_PREFIXES.has(segments[0]) && segments[1]) {
      return `/${segments[0]}/${segments[1]}`;
    }

    return null;
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch (_error) {
      return value;
    }
  }

  function classifySource(rawUrl) {
    const url = safeUrl(rawUrl);
    if (!url || !isYouTubeHost(url.hostname) || url.protocol !== "https:") {
      return null;
    }

    const origin = "https://www.youtube.com";
    const channelBasePath = getChannelBasePath(url.pathname);
    if (channelBasePath) {
      const channelName = safeDecode(channelBasePath.split("/").filter(Boolean).pop());
      return {
        type: "channel",
        sourceKey: `channel:${channelBasePath}`,
        collectorUrl: `${origin}${channelBasePath}/videos`,
        label: channelName.startsWith("@") ? channelName : `频道 ${channelName}`
      };
    }

    if (url.pathname === "/playlist") {
      const playlistId = url.searchParams.get("list");
      if (!playlistId) {
        return null;
      }
      const params = new URLSearchParams({ list: playlistId });
      return {
        type: "playlist",
        sourceKey: `playlist:${playlistId}`,
        collectorUrl: `${origin}/playlist?${params.toString()}`,
        label: `播放列表 ${playlistId}`
      };
    }

    if (url.pathname === "/results" && url.searchParams.has("search_query")) {
      const params = normalizeSearchParams(url.searchParams);
      const query = url.searchParams.get("search_query") || "";
      const normalizedQuery = params.toString();
      return {
        type: "search",
        sourceKey: `search:${normalizedQuery}`,
        collectorUrl: `${origin}/results?${normalizedQuery}`,
        label: `搜索：${query || "（空关键词）"}`
      };
    }

    return null;
  }

  function videoIdFromHref(rawHref, baseUrl = "https://www.youtube.com/") {
    const url = safeUrl(rawHref, baseUrl);
    if (!url || !isYouTubeHost(url.hostname) || url.pathname !== "/watch") {
      return null;
    }
    const videoId = url.searchParams.get("v") || "";
    return VIDEO_ID_PATTERN.test(videoId) ? videoId : null;
  }

  function normalizeWatchUrl(videoId) {
    return VIDEO_ID_PATTERN.test(String(videoId || ""))
      ? `https://www.youtube.com/watch?v=${videoId}`
      : null;
  }

  function formatLinks(urls) {
    return (Array.isArray(urls) ? urls : [])
      .filter(Boolean)
      .join("\r\n\r\n");
  }

  function normalizeBatchSize(value) {
    const size = Number(value);
    return BATCH_SIZE_OPTIONS.includes(size) ? size : DEFAULT_BATCH_SIZE;
  }

  function getBatchRange(batch, deliveredCount, pending = false) {
    if (!batch?.urls?.length) {
      return null;
    }
    if (Number.isInteger(batch.rangeStart) && Number.isInteger(batch.rangeEnd)) {
      return { start: batch.rangeStart, end: batch.rangeEnd };
    }
    const end = pending ? deliveredCount + batch.urls.length : deliveredCount;
    return {
      start: end - batch.urls.length + 1,
      end
    };
  }

  function createDefaultSourceState() {
    return {
      status: "idle",
      batchNumber: 0,
      deliveredIds: [],
      pendingBatch: null,
      lastBatch: null,
      pagination: {
        cursor: null,
        queuedItems: [],
        sourceExhausted: false
      },
      exhausted: false,
      progress: 0,
      error: null,
      updatedAt: Date.now()
    };
  }

  function commitPendingBatch(state, batchId) {
    if (!state || !state.pendingBatch || state.pendingBatch.batchId !== batchId) {
      return state;
    }

    const deliveredIds = Array.from(new Set([
      ...(state.deliveredIds || []),
      ...state.pendingBatch.videoIds
    ]));
    return {
      ...state,
      status: "copied",
      batchNumber: state.pendingBatch.batchNumber,
      deliveredIds,
      lastBatch: state.pendingBatch,
      pendingBatch: null,
      progress: 0,
      error: null,
      updatedAt: Date.now()
    };
  }

  return {
    BATCH_SIZE_OPTIONS,
    DEFAULT_BATCH_SIZE,
    VIDEO_ID_PATTERN,
    classifySource,
    commitPendingBatch,
    createDefaultSourceState,
    formatLinks,
    getBatchRange,
    getChannelBasePath,
    normalizeBatchSize,
    normalizeWatchUrl,
    videoIdFromHref
  };
});
