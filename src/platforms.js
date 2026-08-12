(function attachVideoPlatformCore(root, factory) {
  const core = factory();
  root.VideoPlatformCore = core;
  if (typeof module === "object" && module.exports) {
    module.exports = core;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlatformCore() {
  "use strict";

  const BILIBILI_ID_PATTERN = /^BV[A-Za-z0-9]{10}$/i;
  const DOUYIN_ID_PATTERN = /^\d{15,22}$/;
  const XIAOHONGSHU_ID_PATTERN = /^[a-f0-9]{24}$/i;

  function safeUrl(rawUrl, baseUrl) {
    try {
      return new URL(rawUrl, baseUrl);
    } catch (_error) {
      return null;
    }
  }

  function normalizeTitle(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }

  function parseVideoUrl(rawUrl, platform, baseUrl) {
    const url = safeUrl(rawUrl, baseUrl);
    if (!url || url.protocol !== "https:") {
      return null;
    }

    if (platform === "bilibili") {
      if (!["www.bilibili.com", "bilibili.com"].includes(url.hostname.toLowerCase())) {
        return null;
      }
      const match = url.pathname.match(/^\/video\/(BV[A-Za-z0-9]{10})(?:\/|$)/i);
      if (!match || !BILIBILI_ID_PATTERN.test(match[1])) {
        return null;
      }
      return {
        videoId: match[1],
        url: `https://www.bilibili.com/video/${match[1]}`
      };
    }

    if (platform === "douyin") {
      if (!["www.douyin.com", "douyin.com"].includes(url.hostname.toLowerCase())) {
        return null;
      }
      const match = url.pathname.match(/^\/video\/(\d{15,22})(?:\/|$)/);
      if (!match || !DOUYIN_ID_PATTERN.test(match[1])) {
        return null;
      }
      return {
        videoId: match[1],
        url: `https://www.douyin.com/video/${match[1]}`
      };
    }

    if (platform === "xiaohongshu") {
      if (!["www.xiaohongshu.com", "xiaohongshu.com"].includes(url.hostname.toLowerCase())) {
        return null;
      }
      const match = url.pathname.match(
        /^\/(?:explore|discovery\/item)\/([a-f0-9]{24})(?:\/|$)/i
      ) || url.pathname.match(
        /^\/user\/profile\/[^/]+\/([a-f0-9]{24})(?:\/|$)/i
      );
      if (!match || !XIAOHONGSHU_ID_PATTERN.test(match[1])) {
        return null;
      }
      const normalized = new URL(`https://www.xiaohongshu.com/explore/${match[1]}`);
      for (const key of ["xsec_token", "xsec_source"]) {
        if (url.searchParams.has(key)) {
          normalized.searchParams.set(key, url.searchParams.get(key));
        }
      }
      return { videoId: match[1], url: normalized.href };
    }

    return null;
  }

  function documentTitle(documentObject) {
    return normalizeTitle(
      documentObject.querySelector("meta[property='og:title']")?.content ||
      documentObject.querySelector("meta[name='description']")?.content ||
      documentObject.title
    );
  }

  function firstTitle(container, selectors) {
    for (const selector of selectors) {
      const element = container?.matches?.(selector)
        ? container
        : container?.querySelector?.(selector);
      const title = normalizeTitle(
        element?.getAttribute?.("title") ||
        element?.getAttribute?.("alt") ||
        element?.textContent
      );
      if (title) {
        return title;
      }
    }
    return "";
  }

  function collectBilibiliItems(documentObject, source) {
    const items = [];
    for (const link of documentObject.querySelectorAll("a[href*='/video/BV'], [href*='/video/BV']")) {
      const parsed = parseVideoUrl(
        link.getAttribute("href") || link.href,
        "bilibili",
        documentObject.location?.href || "https://www.bilibili.com/"
      );
      if (!parsed) {
        continue;
      }
      const card = link.closest([
        ".video-card",
        ".bili-video-card",
        ".bili-video-card__wrap",
        ".small-item",
        ".video-page-card",
        "li"
      ].join(",")) || link.parentElement || link;
      items.push({
        ...parsed,
        title: firstTitle(card, [
          ".video-name[title]",
          ".bili-video-card__info--tit",
          ".title",
          "h3",
          "img[alt]",
          "[title]"
        ])
      });
    }
    return items;
  }

  function collectDouyinItems(documentObject) {
    const items = [];
    const candidates = documentObject.querySelectorAll([
      ".discover-video-card-item[data-aweme-id]",
      "[data-aweme-id]",
      "[href*='/video/']"
    ].join(","));
    for (const card of candidates) {
      const videoId = card.dataset?.awemeId || card.getAttribute?.("data-aweme-id");
      const hrefElement = card.matches?.("[href*='/video/']")
        ? card
        : card.querySelector?.("[href*='/video/']");
      const rawUrl = hrefElement?.getAttribute?.("href") ||
        (DOUYIN_ID_PATTERN.test(videoId || "") ? `/video/${videoId}` : "");
      const parsed = parseVideoUrl(
        rawUrl,
        "douyin",
        documentObject.location?.href || "https://www.douyin.com/"
      );
      if (!parsed) {
        continue;
      }
      items.push({
        ...parsed,
        title: firstTitle(card, [
          "img[alt]",
          "[title]",
          "[class*='title']",
          "[class*='desc']"
        ])
      });
    }
    return items;
  }

  function collectXiaohongshuItems(documentObject) {
    const items = [];
    for (const card of documentObject.querySelectorAll("section.note-item, .note-item")) {
      if (!card.querySelector(".play-icon, [class*='play-icon'], use[href*='play'], use[xlink\\:href*='play']")) {
        continue;
      }
      const linkSelectors = [
        "a.cover[href*='/user/profile/'][href*='xsec_token']",
        "a[href*='/user/profile/'][href*='xsec_token']",
        "a.cover[href*='/explore/']",
        "a[href*='/explore/'][href*='xsec_token']",
        "a[href*='/discovery/item/'][href*='xsec_token']",
        "a[href*='/explore/']",
        "a[href*='/discovery/item/']"
      ];
      let link = null;
      for (const selector of linkSelectors) {
        link = card.querySelector(selector);
        if (link) {
          break;
        }
      }
      const parsed = parseVideoUrl(
        link?.getAttribute("href") || link?.href,
        "xiaohongshu",
        documentObject.location?.href || "https://www.xiaohongshu.com/"
      );
      if (!parsed) {
        continue;
      }
      items.push({
        ...parsed,
        title: firstTitle(card, ["a.title", ".title", "img[alt]"])
      });
    }
    return items;
  }

  function collectPageItems(documentObject, source) {
    if (!documentObject || !source?.platform) {
      return [];
    }
    if (source.currentItem) {
      if (
        source.platform === "xiaohongshu" &&
        !documentObject.querySelector("video, .play-icon, [class*='video-player']")
      ) {
        return [];
      }
      return [{
        ...source.currentItem,
        title: documentTitle(documentObject)
      }];
    }

    let rawItems = [];
    if (source.platform === "bilibili") {
      rawItems = collectBilibiliItems(documentObject, source);
    } else if (source.platform === "douyin") {
      rawItems = collectDouyinItems(documentObject);
    } else if (source.platform === "xiaohongshu") {
      rawItems = collectXiaohongshuItems(documentObject);
    }

    const seen = new Set();
    return rawItems.filter((item) => {
      if (!item.videoId || !item.url || seen.has(item.videoId)) {
        return false;
      }
      seen.add(item.videoId);
      return true;
    });
  }

  return {
    BILIBILI_ID_PATTERN,
    DOUYIN_ID_PATTERN,
    XIAOHONGSHU_ID_PATTERN,
    collectPageItems,
    parseVideoUrl
  };
});
