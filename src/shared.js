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
  const COPY_FORMAT_OPTIONS = Object.freeze(["link", "title-link"]);
  const DEFAULT_COPY_FORMAT = "link";
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

  function normalizeCopyFormat(value) {
    return COPY_FORMAT_OPTIONS.includes(value) ? value : DEFAULT_COPY_FORMAT;
  }

  function normalizeVideoTitle(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }

  function formatVideoItems(items, format = DEFAULT_COPY_FORMAT) {
    const normalizedFormat = normalizeCopyFormat(format);
    const blocks = [];
    for (const item of Array.isArray(items) ? items : []) {
      const url = item?.url || normalizeWatchUrl(item?.videoId);
      if (!url) {
        continue;
      }
      const title = normalizeVideoTitle(item?.title);
      blocks.push(normalizedFormat === "title-link" && title
        ? `${title}\r\n${url}`
        : url);
    }
    return blocks.join("\r\n\r\n");
  }

  function itemsFromBatch(batch) {
    const videoIds = Array.isArray(batch?.videoIds) ? batch.videoIds : [];
    const urls = Array.isArray(batch?.urls) ? batch.urls : [];
    const titles = Array.isArray(batch?.titles) ? batch.titles : [];
    const length = Math.max(videoIds.length, urls.length);
    return Array.from({ length }, (_value, index) => ({
      videoId: videoIds[index] || null,
      url: urls[index] || normalizeWatchUrl(videoIds[index]),
      title: normalizeVideoTitle(titles[index])
    })).filter((item) => item.url);
  }

  function formatBatch(batch, format = DEFAULT_COPY_FORMAT) {
    return formatVideoItems(itemsFromBatch(batch), format);
  }

  function normalizeBatchSize(value) {
    const size = Number(value);
    return BATCH_SIZE_OPTIONS.includes(size) ? size : DEFAULT_BATCH_SIZE;
  }

  function urlsFromVideoIds(videoIds) {
    const seen = new Set();
    const urls = [];
    for (const videoId of Array.isArray(videoIds) ? videoIds : []) {
      const url = normalizeWatchUrl(videoId);
      if (!url || seen.has(url)) {
        continue;
      }
      seen.add(url);
      urls.push(url);
    }
    return urls;
  }

  function itemsFromVideoIds(videoIds, titlesById = {}) {
    return urlsFromVideoIds(videoIds).map((url) => {
      const videoId = new URL(url).searchParams.get("v");
      return {
        videoId,
        url,
        title: normalizeVideoTitle(titlesById?.[videoId])
      };
    });
  }

  function createExportFilename(source, count, now = new Date()) {
    const date = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
    const dateStamp = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
    const rawLabel = source?.label || source?.type || "来源";
    const safeLabel = String(rawLabel)
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/-+/g, "-")
      .replace(/^[ .-]+|[ .-]+$/g, "")
      .slice(0, 48) || "来源";
    const safeCount = Number.isInteger(count) && count > 0 ? count : 0;
    return `YouTube链接-${safeLabel}-${safeCount}条-${dateStamp}.txt`;
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
      titlesById: {},
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
    const titlesById = { ...(state.titlesById || {}) };
    for (const [index, videoId] of state.pendingBatch.videoIds.entries()) {
      const title = normalizeVideoTitle(state.pendingBatch.titles?.[index]);
      if (title) {
        titlesById[videoId] = title;
      }
    }
    return {
      ...state,
      status: "copied",
      batchNumber: state.pendingBatch.batchNumber,
      deliveredIds,
      titlesById,
      lastBatch: state.pendingBatch,
      pendingBatch: null,
      progress: 0,
      error: null,
      updatedAt: Date.now()
    };
  }

  return {
    BATCH_SIZE_OPTIONS,
    COPY_FORMAT_OPTIONS,
    DEFAULT_BATCH_SIZE,
    DEFAULT_COPY_FORMAT,
    VIDEO_ID_PATTERN,
    classifySource,
    commitPendingBatch,
    createExportFilename,
    createDefaultSourceState,
    formatBatch,
    formatLinks,
    formatVideoItems,
    getBatchRange,
    getChannelBasePath,
    itemsFromBatch,
    itemsFromVideoIds,
    normalizeBatchSize,
    normalizeCopyFormat,
    normalizeVideoTitle,
    normalizeWatchUrl,
    urlsFromVideoIds,
    videoIdFromHref
  };
});
