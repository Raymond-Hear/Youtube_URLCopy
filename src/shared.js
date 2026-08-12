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
  const BILIBILI_HOSTS = new Set([
    "www.bilibili.com",
    "space.bilibili.com",
    "search.bilibili.com"
  ]);
  const DOUYIN_HOSTS = new Set(["www.douyin.com", "douyin.com"]);
  const XIAOHONGSHU_HOSTS = new Set(["www.xiaohongshu.com", "xiaohongshu.com"]);
  const CHANNEL_PREFIXES = new Set(["channel", "user", "c"]);
  const IRRELEVANT_SEARCH_PARAMS = new Set([
    "app",
    "feature",
    "persist_app",
    "source_ve_path"
  ]);
  const COMMON_TRACKING_PARAMS = new Set([
    "from",
    "from_nav",
    "from_tab_name",
    "enter_from",
    "enter_method",
    "spm_id_from",
    "vd_source",
    "source",
    "source_type",
    "xsec_token",
    "xsec_source"
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

  function platformSource(platform, platformLabel, properties) {
    return {
      platform,
      platformLabel,
      collectionMode: "dom",
      ...properties
    };
  }

  function cleanedPageTitle(pageTitle, platformLabel) {
    const title = String(pageTitle || "")
      .replace(/\s*[-_|｜].*(?:哔哩哔哩|bilibili|抖音|小红书).*$/i, "")
      .trim();
    return title || `${platformLabel}当前页面`;
  }

  function canonicalPageKey(url, ignoredParams = COMMON_TRACKING_PARAMS) {
    const params = [];
    for (const [key, value] of url.searchParams.entries()) {
      if (!ignoredParams.has(key) && key !== "page" && key !== "pn") {
        params.push([key, value]);
      }
    }
    params.sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
    );
    const normalized = new URLSearchParams(params);
    return `${url.hostname}${url.pathname}${normalized.size ? `?${normalized}` : ""}`;
  }

  function classifySource(rawUrl, pageTitle = "") {
    const url = safeUrl(rawUrl);
    if (!url || url.protocol !== "https:") {
      return null;
    }

    const hostname = url.hostname.toLowerCase();
    if (BILIBILI_HOSTS.has(hostname)) {
      const videoMatch = url.pathname.match(/^\/video\/(BV[A-Za-z0-9]{10})(?:\/|$)/i);
      if (videoMatch) {
        const videoId = videoMatch[1];
        return platformSource("bilibili", "B站", {
          type: "single-video",
          sourceKey: `bilibili:video:${videoId}`,
          label: cleanedPageTitle(pageTitle, "B站"),
          currentItem: {
            videoId,
            url: `https://www.bilibili.com/video/${videoId}`
          }
        });
      }
      if (hostname === "space.bilibili.com") {
        const userId = url.pathname.split("/").filter(Boolean)[0];
        if (!/^\d+$/.test(userId || "")) {
          return null;
        }
        return platformSource("bilibili", "B站", {
          type: "creator",
          sourceKey: `bilibili:space:${userId}`,
          label: cleanedPageTitle(pageTitle, `B站用户 ${userId}`)
        });
      }
      return platformSource("bilibili", "B站", {
        type: hostname === "search.bilibili.com" ? "search" : "page",
        sourceKey: `bilibili:${canonicalPageKey(url)}`,
        label: cleanedPageTitle(pageTitle, "B站")
      });
    }

    if (DOUYIN_HOSTS.has(hostname)) {
      const videoMatch = url.pathname.match(/^\/video\/(\d{15,22})(?:\/|$)/);
      if (videoMatch) {
        const videoId = videoMatch[1];
        return platformSource("douyin", "抖音", {
          type: "single-video",
          sourceKey: `douyin:video:${videoId}`,
          label: cleanedPageTitle(pageTitle, "抖音"),
          currentItem: {
            videoId,
            url: `https://www.douyin.com/video/${videoId}`
          }
        });
      }
      const userMatch = url.pathname.match(/^\/user\/([^/]+)/);
      if (userMatch) {
        const tab = url.searchParams.get("showTab") || "post";
        return platformSource("douyin", "抖音", {
          type: "creator",
          sourceKey: `douyin:user:${userMatch[1]}:${tab}`,
          label: cleanedPageTitle(pageTitle, "抖音用户")
        });
      }
      return platformSource("douyin", "抖音", {
        type: url.pathname.startsWith("/search/") ? "search" : "page",
        sourceKey: `douyin:${canonicalPageKey(url)}`,
        label: cleanedPageTitle(pageTitle, "抖音")
      });
    }

    if (XIAOHONGSHU_HOSTS.has(hostname)) {
      const itemMatch = url.pathname.match(
        /^\/(?:explore|discovery\/item)\/([a-f0-9]{24})(?:\/|$)/i
      ) || url.pathname.match(
        /^\/user\/profile\/[^/]+\/([a-f0-9]{24})(?:\/|$)/i
      );
      if (itemMatch) {
        const videoId = itemMatch[1];
        const itemUrl = new URL(`https://www.xiaohongshu.com/explore/${videoId}`);
        for (const key of ["xsec_token", "xsec_source"]) {
          if (url.searchParams.has(key)) {
            itemUrl.searchParams.set(key, url.searchParams.get(key));
          }
        }
        return platformSource("xiaohongshu", "小红书", {
          type: "single-video",
          sourceKey: `xiaohongshu:note:${videoId}`,
          label: cleanedPageTitle(pageTitle, "小红书"),
          currentItem: { videoId, url: itemUrl.href }
        });
      }
      const profileMatch = url.pathname.match(/^\/user\/profile\/([^/]+)/);
      if (profileMatch) {
        return platformSource("xiaohongshu", "小红书", {
          type: "creator",
          sourceKey: `xiaohongshu:profile:${profileMatch[1]}`,
          label: cleanedPageTitle(pageTitle, "小红书用户")
        });
      }
      return platformSource("xiaohongshu", "小红书", {
        type: url.pathname.startsWith("/search_result") ? "search" : "page",
        sourceKey: `xiaohongshu:${canonicalPageKey(url)}`,
        label: cleanedPageTitle(pageTitle, "小红书")
      });
    }

    if (!isYouTubeHost(hostname)) {
      return null;
    }

    const origin = "https://www.youtube.com";
    const channelBasePath = getChannelBasePath(url.pathname);
    if (channelBasePath) {
      const channelName = safeDecode(channelBasePath.split("/").filter(Boolean).pop());
      return {
        platform: "youtube",
        platformLabel: "YouTube",
        collectionMode: "youtube-data",
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
        platform: "youtube",
        platformLabel: "YouTube",
        collectionMode: "youtube-data",
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
        platform: "youtube",
        platformLabel: "YouTube",
        collectionMode: "youtube-data",
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

  function itemsFromVideoIds(videoIds, titlesById = {}, urlsById = {}) {
    const seen = new Set();
    return (Array.isArray(videoIds) ? videoIds : []).map((videoId) => {
      const url = urlsById?.[videoId] || normalizeWatchUrl(videoId);
      if (!url || seen.has(videoId)) {
        return null;
      }
      seen.add(videoId);
      return {
        videoId,
        url,
        title: normalizeVideoTitle(titlesById?.[videoId])
      };
    }).filter(Boolean);
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function formatCsvItems(items) {
    const rows = [["序号", "标题", "视频ID", "链接"]];
    for (const item of Array.isArray(items) ? items : []) {
      const url = item?.url || normalizeWatchUrl(item?.videoId);
      if (!url) {
        continue;
      }
      const videoId = item?.videoId || new URL(url).searchParams.get("v") || "";
      rows.push([
        rows.length,
        normalizeVideoTitle(item?.title),
        videoId,
        url
      ]);
    }
    return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  }

  function createExportFilename(source, count, now = new Date(), extension = "txt") {
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
    const safeExtension = extension === "csv" ? "csv" : "txt";
    const platformLabel = String(source?.platformLabel || "视频").replace(/\s+/g, "");
    return `${platformLabel}链接-${safeLabel}-${safeCount}条-${dateStamp}.${safeExtension}`;
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
      skippedIds: [],
      pendingBatch: null,
      lastBatch: null,
      titlesById: {},
      urlsById: {},
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

    const batch = state.pendingBatch;
    const selectedSet = Array.isArray(batch.selectedVideoIds)
      ? new Set(batch.selectedVideoIds)
      : new Set(batch.videoIds);
    const selectedIndexes = batch.videoIds
      .map((videoId, index) => selectedSet.has(videoId) ? index : -1)
      .filter((index) => index >= 0);
    if (!selectedIndexes.length) {
      return state;
    }
    const selectedVideoIds = selectedIndexes.map((index) => batch.videoIds[index]);
    const skippedVideoIds = batch.videoIds.filter((videoId) => !selectedSet.has(videoId));
    const deliveredIds = Array.from(new Set([
      ...(state.deliveredIds || []),
      ...selectedVideoIds
    ]));
    const skippedIds = Array.from(new Set([
      ...(state.skippedIds || []),
      ...skippedVideoIds
    ]));
    const titlesById = { ...(state.titlesById || {}) };
    const urlsById = { ...(state.urlsById || {}) };
    for (const index of selectedIndexes) {
      const videoId = batch.videoIds[index];
      const title = normalizeVideoTitle(batch.titles?.[index]);
      const url = batch.urls?.[index];
      if (title) {
        titlesById[videoId] = title;
      }
      if (url) {
        urlsById[videoId] = url;
      }
    }
    const committedBatch = {
      ...batch,
      rangeStart: (state.deliveredIds || []).length + 1,
      rangeEnd: deliveredIds.length,
      videoIds: selectedVideoIds,
      urls: selectedIndexes.map((index) => batch.urls?.[index] || normalizeWatchUrl(batch.videoIds[index])),
      titles: selectedIndexes.map((index) => batch.titles?.[index] || ""),
      originalCount: batch.videoIds.length
    };
    delete committedBatch.selectedVideoIds;
    delete committedBatch.awaitingSelection;
    return {
      ...state,
      status: "copied",
      batchNumber: batch.batchNumber,
      deliveredIds,
      skippedIds,
      titlesById,
      urlsById,
      lastBatch: committedBatch,
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
    formatCsvItems,
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
