(function attachYouTubeDataCore(root, factory) {
  const dataCore = factory();
  root.YTDataCore = dataCore;
  if (typeof module === "object" && module.exports) {
    module.exports = dataCore;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createYouTubeDataCore() {
  "use strict";

  const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
  const RENDERER_KEY_PATTERN = /^(?:videoRenderer|gridVideoRenderer|playlistVideoRenderer|compactVideoRenderer|playlistPanelVideoRenderer|videoCardRenderer|lockupViewModel|videoLockupViewModel)$/i;
  const SHORTS_KEY_PATTERN = /shorts|reel/i;
  const ACTIVE_LIVE_PATTERN = /BADGE_STYLE_TYPE_LIVE_NOW|LIVE_NOW|UPCOMING|"isLiveNow"\s*:\s*true|"isUpcoming"\s*:\s*true/i;
  const REPLAY_PATTERN = /"simpleText"\s*:\s*"[^"]*(?:Streamed|直播于|直播於|已直播|配信済み|transmitido|diffusé en direct|gestreamt)/i;

  function extractBalancedJson(text, fromIndex) {
    const objectStart = text.indexOf("{", fromIndex);
    const arrayStart = text.indexOf("[", fromIndex);
    let start = -1;
    if (objectStart === -1) {
      start = arrayStart;
    } else if (arrayStart === -1) {
      start = objectStart;
    } else {
      start = Math.min(objectStart, arrayStart);
    }
    if (start < 0) {
      return null;
    }

    const opening = text[start];
    const closing = opening === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === '"') {
          inString = false;
        }
        continue;
      }

      if (character === '"') {
        inString = true;
      } else if (character === opening) {
        depth += 1;
      } else if (character === closing) {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(start, index + 1));
          } catch (_error) {
            return null;
          }
        }
      }
    }
    return null;
  }

  function extractAfterMarker(text, markers) {
    for (const marker of markers) {
      const markerIndex = text.indexOf(marker);
      if (markerIndex >= 0) {
        const parsed = extractBalancedJson(text, markerIndex + marker.length);
        if (parsed) {
          return parsed;
        }
      }
    }
    return null;
  }

  function extractInitialData(html) {
    return extractAfterMarker(html, [
      "var ytInitialData =",
      "window[\"ytInitialData\"] =",
      "window['ytInitialData'] =",
      "ytInitialData ="
    ]);
  }

  function extractStringProperty(html, propertyName) {
    const escapedName = propertyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = html.match(new RegExp(`"${escapedName}"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`));
    if (!match) {
      return null;
    }
    try {
      return JSON.parse(`"${match[1]}"`);
    } catch (_error) {
      return match[1];
    }
  }

  function extractInnertubeConfig(html) {
    const context = extractAfterMarker(html, ["\"INNERTUBE_CONTEXT\":"]);
    const apiKey = extractStringProperty(html, "INNERTUBE_API_KEY");
    const clientVersion = extractStringProperty(html, "INNERTUBE_CLIENT_VERSION");
    const visitorData = extractStringProperty(html, "VISITOR_DATA");

    return {
      apiKey,
      clientVersion,
      visitorData,
      context: context || {
        client: {
          clientName: "WEB",
          clientVersion: clientVersion || "2.20260101.00.00"
        }
      }
    };
  }

  function rendererVideoId(node, rendererKey) {
    if (VIDEO_ID_PATTERN.test(String(node.videoId || ""))) {
      return node.videoId;
    }
    if (/lockupViewModel/i.test(rendererKey) && VIDEO_ID_PATTERN.test(String(node.contentId || ""))) {
      return node.contentId;
    }
    return null;
  }

  function textFromTextObject(value) {
    if (typeof value === "string") {
      return value.replace(/\s+/g, " ").trim();
    }
    if (!value || typeof value !== "object") {
      return "";
    }
    if (typeof value.simpleText === "string") {
      return value.simpleText.replace(/\s+/g, " ").trim();
    }
    if (Array.isArray(value.runs)) {
      return value.runs
        .map((run) => typeof run?.text === "string" ? run.text : "")
        .join("")
        .replace(/\s+/g, " ")
        .trim();
    }
    if (typeof value.content === "string") {
      return value.content.replace(/\s+/g, " ").trim();
    }
    return "";
  }

  function rendererTitle(node) {
    const candidates = [
      node.title,
      node.headline,
      node.metadata?.lockupMetadataViewModel?.title,
      node.lockupMetadataViewModel?.title
    ];
    for (const candidate of candidates) {
      const title = textFromTextObject(candidate);
      if (title) {
        return title;
      }
    }
    return "";
  }

  function rendererIsExcluded(node, inheritedShorts) {
    if (inheritedShorts) {
      return true;
    }
    const serialized = JSON.stringify(node);
    if (/\/shorts\//i.test(serialized) || /"contentType"\s*:\s*"SHORTS"/i.test(serialized)) {
      return true;
    }
    return ACTIVE_LIVE_PATTERN.test(serialized) || REPLAY_PATTERN.test(serialized);
  }

  function normalizeApiUrl(apiUrl) {
    return /^\/youtubei\/v1\/(?:browse|search)$/.test(String(apiUrl || ""))
      ? apiUrl
      : null;
  }

  function collectPageData(payload, options = {}) {
    const excludedIds = new Set(options.excludedIds || []);
    const alreadyFound = new Set(options.alreadyFoundIds || []);
    const items = [];
    const continuations = [];
    const continuationTokens = new Set();
    const visited = new WeakSet();

    function addContinuation(token, apiUrl) {
      if (!token || continuationTokens.has(token)) {
        return;
      }
      continuationTokens.add(token);
      continuations.push({ token, apiUrl: normalizeApiUrl(apiUrl) });
    }

    function visit(value, currentKey = "", inheritedShorts = false) {
      if (!value || typeof value !== "object" || visited.has(value)) {
        return;
      }
      visited.add(value);
      const shortsContext = inheritedShorts || SHORTS_KEY_PATTERN.test(currentKey);

      if (RENDERER_KEY_PATTERN.test(currentKey)) {
        const videoId = rendererVideoId(value, currentKey);
        if (
          videoId &&
          !excludedIds.has(videoId) &&
          !alreadyFound.has(videoId) &&
          !rendererIsExcluded(value, shortsContext)
        ) {
          alreadyFound.add(videoId);
          items.push({ videoId, title: rendererTitle(value) });
        }
      }

      const continuationCommand = value.continuationCommand;
      if (!shortsContext && continuationCommand?.token) {
        addContinuation(
          continuationCommand.token,
          value.commandMetadata?.webCommandMetadata?.apiUrl
        );
      }
      if (!shortsContext && typeof value.continuation === "string" && /continuation/i.test(currentKey)) {
        addContinuation(value.continuation, null);
      }

      for (const [key, child] of Object.entries(value)) {
        if (Array.isArray(child)) {
          for (const item of child) {
            visit(item, key, shortsContext);
          }
        } else {
          visit(child, key, shortsContext);
        }
      }
    }

    visit(payload);
    return { items, continuations };
  }

  function normalizeQueuedItems(items, excludedIds) {
    const excluded = new Set(excludedIds || []);
    const seen = new Set();
    const normalized = [];
    for (const item of Array.isArray(items) ? items : []) {
      const videoId = String(item?.videoId || "");
      if (!VIDEO_ID_PATTERN.test(videoId) || excluded.has(videoId) || seen.has(videoId)) {
        continue;
      }
      seen.add(videoId);
      normalized.push({
        videoId,
        title: textFromTextObject(item?.title)
      });
    }
    return normalized;
  }

  async function collectBatchFromPages(options) {
    const targetCount = Math.max(1, Number(options.targetCount) || 50);
    const maxRequests = Math.max(1, Number(options.maxRequests) || 40);
    const excludedIds = new Set(options.excludedIds || []);
    const queue = normalizeQueuedItems(options.queuedItems, excludedIds);
    const knownIds = new Set([...excludedIds, ...queue.map((item) => item.videoId)]);
    const usedContinuations = new Set();
    const initialPayload = options.initialPayload || null;
    const savedCursor = options.startContinuation || null;
    let sourceExhausted = Boolean(options.sourceExhausted);
    let nextContinuation = savedCursor;
    let payload = savedCursor || sourceExhausted ? null : initialPayload;
    let requestCount = 0;
    let savedCursorPending = Boolean(savedCursor);

    function reportProgress() {
      options.onProgress?.(Math.min(queue.length, targetCount));
    }

    function buildResult() {
      const items = queue.splice(0, targetCount);
      return {
        items,
        queuedItems: queue,
        nextContinuation,
        sourceExhausted,
        exhausted: sourceExhausted && queue.length === 0
      };
    }

    reportProgress();
    if (queue.length >= targetCount || sourceExhausted) {
      return buildResult();
    }

    while (requestCount <= maxRequests) {
      if (payload) {
        const page = collectPageData(payload, {
          excludedIds,
          alreadyFoundIds: knownIds
        });
        for (const item of page.items) {
          if (!knownIds.has(item.videoId)) {
            knownIds.add(item.videoId);
            queue.push(item);
          }
        }
        nextContinuation = page.continuations.find((candidate) =>
          candidate.token && !usedContinuations.has(candidate.token)
        ) || null;
        sourceExhausted = !nextContinuation;
        reportProgress();
        if (queue.length >= targetCount || sourceExhausted) {
          return buildResult();
        }
      }

      if (!nextContinuation || requestCount >= maxRequests) {
        return buildResult();
      }

      usedContinuations.add(nextContinuation.token);
      try {
        payload = await options.fetchContinuation(nextContinuation, requestCount);
        requestCount += 1;
        savedCursorPending = false;
      } catch (error) {
        if (savedCursorPending && initialPayload) {
          options.onCursorFallback?.(error);
          nextContinuation = null;
          payload = initialPayload;
          sourceExhausted = false;
          savedCursorPending = false;
          usedContinuations.clear();
          continue;
        }
        throw error;
      }
    }

    return buildResult();
  }

  return {
    collectBatchFromPages,
    collectPageData,
    extractBalancedJson,
    extractInitialData,
    extractInnertubeConfig
  };
});
