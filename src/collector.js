(function initializePageCollector() {
  "use strict";

  const Core = globalThis.YTLinkCore;
  const DataCore = globalThis.YTDataCore;
  const PAGE_STATE_KEY = "youtubeLinkCopyPageStateV2";
  const UI_STATE_KEY = "youtubeLinkCopyUiStateV1";
  const MAX_CONTINUATION_REQUESTS = 40;
  const COLLECTION_TIMEOUT_MS = 60_000;
  const VISIBLE_LINK_SELECTOR = "a[href*='/watch?v=']";
  const ACTIVE_LIVE_PATTERN = /(^|\s)(live|upcoming|premiere)(\s|$)|正在直播|直播中|即将开始|即將開始|首映|ライブ配信|配信予定|실시간|예정|en directo|en vivo|próximo|ao vivo/i;
  const REPLAY_PATTERN = /streamed\s|直播于|直播於|已直播|配信済み|transmitido\s|diffusé en direct|gestreamt/i;

  let currentSource = null;
  let currentUrl = location.href;
  let batchSize = Core.DEFAULT_BATCH_SIZE;
  let copyFormat = Core.DEFAULT_COPY_FORMAT;
  let selectionMode = false;
  let busy = false;
  let panel = null;
  let copyButton = null;
  let countLabel = null;
  let statusLabel = null;
  let resetButton = null;
  let collapseButton = null;
  let brandButton = null;
  let compactSummary = null;
  let recopyButton = null;
  let fallbackButton = null;
  let batchSizeSelect = null;
  let brandBatchSize = null;
  let previewButton = null;
  let previewBox = null;
  let exportButton = null;
  let copyFormatSelect = null;
  let selectionModeInput = null;
  let selectionPanel = null;
  let selectionList = null;
  let selectionCountLabel = null;
  let selectAllButton = null;
  let clearSelectionButton = null;

  function defaultStore() {
    return { sources: {} };
  }

  function normalizeSourceState(rawState) {
    const defaults = Core.createDefaultSourceState();
    const state = rawState || defaults;
    return {
      ...defaults,
      ...state,
      deliveredIds: Array.isArray(state.deliveredIds) ? state.deliveredIds : [],
      skippedIds: Array.isArray(state.skippedIds) ? state.skippedIds : [],
      titlesById: {
        ...defaults.titlesById,
        ...(state.titlesById || {})
      },
      pagination: {
        ...defaults.pagination,
        ...(state.pagination || {})
      }
    };
  }

  async function readStore() {
    const stored = await chrome.storage.local.get(PAGE_STATE_KEY);
    return stored[PAGE_STATE_KEY] || defaultStore();
  }

  async function readSourceState(sourceKey) {
    const store = await readStore();
    return normalizeSourceState(store.sources[sourceKey]);
  }

  async function saveSourceState(sourceKey, state) {
    const store = await readStore();
    store.sources[sourceKey] = {
      ...normalizeSourceState(state),
      updatedAt: Date.now()
    };
    await chrome.storage.local.set({ [PAGE_STATE_KEY]: store });
    return store.sources[sourceKey];
  }

  async function readUiState() {
    const stored = await chrome.storage.local.get(UI_STATE_KEY);
    const state = stored[UI_STATE_KEY] || {};
    return {
      collapsed: Boolean(state.collapsed),
      batchSize: Core.normalizeBatchSize(state.batchSize),
      copyFormat: Core.normalizeCopyFormat(state.copyFormat),
      selectionMode: Boolean(state.selectionMode)
    };
  }

  async function saveUiState(patch) {
    const current = await readUiState();
    const next = {
      ...current,
      ...patch,
      batchSize: Core.normalizeBatchSize(patch.batchSize ?? current.batchSize),
      copyFormat: Core.normalizeCopyFormat(patch.copyFormat ?? current.copyFormat),
      selectionMode: Boolean(patch.selectionMode ?? current.selectionMode)
    };
    await chrome.storage.local.set({ [UI_STATE_KEY]: next });
    return next;
  }

  async function setCollapsed(collapsed, persist = true) {
    if (!panel) {
      return;
    }
    panel.dataset.collapsed = String(Boolean(collapsed));
    collapseButton.textContent = collapsed ? "+" : "−";
    collapseButton.title = collapsed ? "展开链接工具" : "收起链接工具";
    collapseButton.setAttribute("aria-expanded", String(!collapsed));
    if (persist) {
      await saveUiState({ collapsed: Boolean(collapsed) });
    }
  }

  async function setBatchSize(value, persist = true) {
    if (busy) {
      return;
    }
    batchSize = Core.normalizeBatchSize(value);
    if (batchSizeSelect) {
      batchSizeSelect.value = String(batchSize);
    }
    if (brandBatchSize) {
      brandBatchSize.textContent = String(batchSize);
    }
    if (persist) {
      await saveUiState({ batchSize });
    }
    if (currentSource && panel && !panel.hidden) {
      await renderState(await readSourceState(currentSource.sourceKey));
    }
  }

  async function setCopyFormat(value, persist = true) {
    if (busy) {
      return;
    }
    copyFormat = Core.normalizeCopyFormat(value);
    if (copyFormatSelect) {
      copyFormatSelect.value = copyFormat;
    }
    if (persist) {
      await saveUiState({ copyFormat });
    }
    if (currentSource && panel && !panel.hidden) {
      await renderState(await readSourceState(currentSource.sourceKey));
    }
  }

  async function setSelectionMode(enabled, persist = true) {
    if (busy) {
      return;
    }
    selectionMode = Boolean(enabled);
    if (selectionModeInput) {
      selectionModeInput.checked = selectionMode;
    }
    if (persist) {
      await saveUiState({ selectionMode });
    }
  }

  function bindPanelElements() {
    copyButton = panel.querySelector(".ytlc-copy");
    countLabel = panel.querySelector(".ytlc-count");
    statusLabel = panel.querySelector(".ytlc-status");
    resetButton = panel.querySelector(".ytlc-reset");
    collapseButton = panel.querySelector(".ytlc-collapse");
    brandButton = panel.querySelector(".ytlc-brand");
    compactSummary = panel.querySelector(".ytlc-compact-summary");
    recopyButton = panel.querySelector(".ytlc-recopy");
    fallbackButton = panel.querySelector(".ytlc-fallback");
    batchSizeSelect = panel.querySelector(".ytlc-batch-size");
    brandBatchSize = panel.querySelector(".ytlc-brand-count");
    previewButton = panel.querySelector(".ytlc-preview-toggle");
    previewBox = panel.querySelector(".ytlc-preview");
    exportButton = panel.querySelector(".ytlc-export");
    copyFormatSelect = panel.querySelector(".ytlc-copy-format");
    selectionModeInput = panel.querySelector(".ytlc-selection-mode");
    selectionPanel = panel.querySelector(".ytlc-selection");
    selectionList = panel.querySelector(".ytlc-selection-list");
    selectionCountLabel = panel.querySelector(".ytlc-selection-count");
    selectAllButton = panel.querySelector(".ytlc-select-all");
    clearSelectionButton = panel.querySelector(".ytlc-select-none");
  }

  function createPanel() {
    panel = document.querySelector("#yt-link-copy-panel");
    if (panel) {
      bindPanelElements();
      return;
    }

    panel = document.createElement("aside");
    panel.id = "yt-link-copy-panel";
    panel.dataset.collapsed = "false";
    panel.setAttribute("aria-label", "YouTube 视频链接复制工具");
    panel.innerHTML = `
      <div class="ytlc-head">
        <button class="ytlc-brand" type="button" title="展开或收起链接工具">
          <span class="ytlc-mark">▶</span>
          <span>链接／<span class="ytlc-brand-count">50</span></span>
          <span class="ytlc-compact-summary"></span>
        </button>
        <div class="ytlc-head-actions">
          <button class="ytlc-reset" type="button" title="清除此页面的复制进度">重置</button>
          <button class="ytlc-collapse" type="button" aria-expanded="true" title="收起链接工具">−</button>
        </div>
      </div>
      <div class="ytlc-body">
        <div class="ytlc-options">
          <label class="ytlc-option-row" for="ytlc-copy-format">
            <span>复制格式</span>
            <select id="ytlc-copy-format" class="ytlc-copy-format" aria-label="复制内容格式">
              <option value="link" selected>仅链接</option>
              <option value="title-link">标题＋链接</option>
            </select>
          </label>
          <label class="ytlc-option-row" for="ytlc-batch-size">
            <span>每批数量</span>
            <select id="ytlc-batch-size" class="ytlc-batch-size" aria-label="每批复制数量">
              <option value="10">10 条</option>
              <option value="25">25 条</option>
              <option value="50" selected>50 条</option>
            </select>
          </label>
          <label class="ytlc-option-row ytlc-selection-option" for="ytlc-selection-mode">
            <span>复制前选择</span>
            <input id="ytlc-selection-mode" class="ytlc-selection-mode" type="checkbox" role="switch">
          </label>
        </div>
        <button class="ytlc-copy" type="button">
          <span class="ytlc-button-text">复制第 1 批：1–50</span>
          <span class="ytlc-count">50</span>
        </button>
        <p class="ytlc-status" role="status">读取当前页面，无需切换标签</p>
        <div class="ytlc-selection" hidden>
          <div class="ytlc-selection-head">
            <span class="ytlc-selection-count">已选 0/0</span>
            <div>
              <button class="ytlc-select-all" type="button">全选</button>
              <button class="ytlc-select-none" type="button">清空</button>
            </div>
          </div>
          <div class="ytlc-selection-list" role="list" aria-label="选择要复制的视频"></div>
        </div>
        <div class="ytlc-secondary">
          <button class="ytlc-recopy" type="button" hidden>重新复制上一批</button>
          <button class="ytlc-preview-toggle" type="button" aria-expanded="false" hidden>查看上一批</button>
          <button class="ytlc-export" type="button" hidden>导出已复制记录</button>
          <button class="ytlc-fallback" type="button" hidden>复制当前可见链接</button>
        </div>
        <pre class="ytlc-preview" tabindex="0" hidden></pre>
      </div>
    `;
    document.body.append(panel);
    bindPanelElements();

    copyButton.addEventListener("click", () => void runCopy());
    resetButton.addEventListener("click", () => void resetCurrentSource());
    recopyButton.addEventListener("click", () => void recopyLastBatch());
    previewButton.addEventListener("click", togglePreview);
    exportButton.addEventListener("click", () => void exportDeliveredLinks());
    fallbackButton.addEventListener("click", () => void copyVisibleFallback());
    batchSizeSelect.addEventListener("change", () =>
      void setBatchSize(batchSizeSelect.value)
    );
    copyFormatSelect.addEventListener("change", () =>
      void setCopyFormat(copyFormatSelect.value)
    );
    selectionModeInput.addEventListener("change", () =>
      void setSelectionMode(selectionModeInput.checked)
    );
    selectAllButton.addEventListener("click", () => void selectPendingItems(true));
    clearSelectionButton.addEventListener("click", () => void selectPendingItems(false));
    collapseButton.addEventListener("click", () =>
      void setCollapsed(panel.dataset.collapsed !== "true")
    );
    brandButton.addEventListener("click", () =>
      void setCollapsed(panel.dataset.collapsed !== "true")
    );
  }

  function setTheme() {
    if (!panel) {
      return;
    }
    const isDark = document.documentElement.hasAttribute("dark") ||
      document.documentElement.getAttribute("system-icons") === "system-icons-dark";
    panel.dataset.theme = isDark ? "dark" : "light";
  }

  function setWidgetStatus(message, tone = "normal") {
    if (!panel) {
      return;
    }
    statusLabel.textContent = message;
    panel.dataset.tone = tone;
  }

  function setButtonLabel(text, count = String(batchSize)) {
    if (!copyButton) {
      return;
    }
    copyButton.querySelector(".ytlc-button-text").textContent = text;
    countLabel.textContent = count;
  }

  function setCompactSummary(text) {
    if (compactSummary) {
      compactSummary.textContent = text ? `· ${text}` : "";
    }
  }

  function closePreview() {
    if (!previewBox || !previewButton) {
      return;
    }
    previewBox.hidden = true;
    previewButton.textContent = "查看上一批";
    previewButton.setAttribute("aria-expanded", "false");
  }

  function togglePreview() {
    if (!previewBox || !previewButton || previewButton.hidden) {
      return;
    }
    const willOpen = previewBox.hidden;
    previewBox.hidden = !willOpen;
    previewButton.textContent = willOpen ? "收起预览" : "查看上一批";
    previewButton.setAttribute("aria-expanded", String(willOpen));
  }

  function showToast(message, tone = "normal") {
    document.querySelector("#yt-link-copy-toast")?.remove();
    const toast = document.createElement("div");
    toast.id = "yt-link-copy-toast";
    toast.dataset.tone = tone;
    toast.setAttribute("role", "status");
    toast.textContent = message;
    document.body.append(toast);
    window.setTimeout(() => toast.remove(), 4_000);
  }

  function visibleCardForLink(link) {
    return link.closest([
      "ytd-rich-item-renderer",
      "ytd-grid-video-renderer",
      "ytd-video-renderer",
      "ytd-playlist-video-renderer",
      "yt-lockup-view-model"
    ].join(",")) || link;
  }

  function visibleCardTitle(link) {
    const card = visibleCardForLink(link);
    const titleNode = card.querySelector([
      "#video-title",
      "a[title][href*='/watch?v=']",
      "h3 a[href*='/watch?v=']"
    ].join(","));
    return Core.normalizeVideoTitle(
      titleNode?.getAttribute("title") || titleNode?.textContent || link.getAttribute("title")
    );
  }

  function visibleCardIsExcluded(link) {
    if (link.closest("ytd-reel-shelf-renderer, yt-horizontal-list-renderer")) {
      return true;
    }
    const card = visibleCardForLink(link);
    const badgeText = Array.from(card.querySelectorAll([
      "[overlay-style]",
      "[badge-style-type]",
      "ytd-thumbnail-overlay-time-status-renderer",
      "ytd-badge-supported-renderer",
      "#metadata-line"
    ].join(","))).map((node) => [
      node.getAttribute?.("overlay-style"),
      node.getAttribute?.("badge-style-type"),
      node.textContent
    ].filter(Boolean).join(" ")).join(" ");
    return ACTIVE_LIVE_PATTERN.test(badgeText) || REPLAY_PATTERN.test(badgeText);
  }

  function collectVisibleItems(excludedIds = []) {
    const excluded = new Set(excludedIds);
    const found = new Set();
    const items = [];
    for (const link of document.querySelectorAll(VISIBLE_LINK_SELECTOR)) {
      const videoId = Core.videoIdFromHref(link.href, location.href);
      if (
        !videoId ||
        excluded.has(videoId) ||
        found.has(videoId) ||
        visibleCardIsExcluded(link)
      ) {
        continue;
      }
      found.add(videoId);
      items.push({
        videoId,
        title: visibleCardTitle(link),
        url: Core.normalizeWatchUrl(videoId)
      });
      if (items.length === batchSize) {
        break;
      }
    }
    return items;
  }

  function selectedIdsForBatch(batch) {
    return Array.isArray(batch?.selectedVideoIds)
      ? batch.videoIds.filter((videoId) => batch.selectedVideoIds.includes(videoId))
      : [...(batch?.videoIds || [])];
  }

  async function updatePendingSelection(selectedVideoIds) {
    if (busy || !currentSource) {
      return;
    }
    const sourceKey = currentSource.sourceKey;
    const state = await readSourceState(sourceKey);
    const batch = state.pendingBatch;
    if (!batch?.awaitingSelection) {
      return;
    }
    const selectedSet = new Set(selectedVideoIds);
    const nextState = await saveSourceState(sourceKey, {
      ...state,
      pendingBatch: {
        ...batch,
        selectedVideoIds: batch.videoIds.filter((videoId) => selectedSet.has(videoId))
      }
    });
    if (currentSource?.sourceKey === sourceKey) {
      await renderState(nextState);
    }
  }

  async function selectPendingItems(selectAll) {
    if (!currentSource) {
      return;
    }
    const state = await readSourceState(currentSource.sourceKey);
    const batch = state.pendingBatch;
    if (!batch?.awaitingSelection) {
      return;
    }
    await updatePendingSelection(selectAll ? batch.videoIds : []);
  }

  function renderPendingSelection(batch) {
    if (!batch?.awaitingSelection) {
      selectionPanel.hidden = true;
      selectionList.replaceChildren();
      return 0;
    }

    const selectedIds = selectedIdsForBatch(batch);
    const selectedSet = new Set(selectedIds);
    selectionPanel.hidden = false;
    selectionList.replaceChildren();
    batch.videoIds.forEach((videoId, index) => {
      const row = document.createElement("label");
      row.className = "ytlc-selection-item";
      row.setAttribute("role", "listitem");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selectedSet.has(videoId);
      checkbox.dataset.videoId = videoId;
      checkbox.addEventListener("change", () => {
        const nextSelection = Array.from(
          selectionList.querySelectorAll("input[type='checkbox']:checked")
        ).map((input) => input.dataset.videoId);
        void updatePendingSelection(nextSelection);
      });

      const text = document.createElement("span");
      const title = Core.normalizeVideoTitle(batch.titles?.[index]);
      text.className = "ytlc-selection-text";
      text.textContent = `${index + 1}. ${title || videoId}`;
      text.title = batch.urls?.[index] || Core.normalizeWatchUrl(videoId);

      row.append(checkbox, text);
      selectionList.append(row);
    });

    selectionCountLabel.textContent = `已选 ${selectedIds.length}/${batch.videoIds.length}`;
    selectAllButton.disabled = busy || selectedIds.length === batch.videoIds.length;
    clearSelectionButton.disabled = busy || selectedIds.length === 0;
    return selectedIds.length;
  }

  async function renderState(rawState) {
    if (!panel || !currentSource) {
      return;
    }
    const state = normalizeSourceState(rawState);
    setTheme();
    panel.hidden = false;
    const deliveredCount = state.deliveredIds.length;
    const skippedCount = state.skippedIds.length;
    const nextStart = deliveredCount + 1;
    const nextEnd = deliveredCount + batchSize;
    const lastRange = Core.getBatchRange(state.lastBatch, deliveredCount);
    const pendingRange = Core.getBatchRange(state.pendingBatch, deliveredCount, true);
    const visibleFallbackCount = state.status === "error"
      ? collectVisibleItems([...state.deliveredIds, ...state.skippedIds]).length
      : 0;
    const pendingSelectionCount = renderPendingSelection(state.pendingBatch);

    copyButton.disabled = busy ||
      (state.exhausted && !state.pendingBatch) ||
      (Boolean(state.pendingBatch?.awaitingSelection) && pendingSelectionCount === 0);
    resetButton.disabled = busy;
    recopyButton.disabled = busy;
    previewButton.disabled = busy;
    exportButton.disabled = busy || deliveredCount === 0;
    batchSizeSelect.disabled = busy;
    copyFormatSelect.disabled = busy;
    selectionModeInput.disabled = busy;
    fallbackButton.disabled = busy || visibleFallbackCount === 0;
    recopyButton.hidden = !state.lastBatch?.urls?.length;
    previewButton.hidden = !state.lastBatch?.urls?.length;
    exportButton.hidden = deliveredCount === 0;
    exportButton.textContent = `导出已复制 ${deliveredCount} 条`;
    fallbackButton.hidden = state.status !== "error" || Boolean(state.pendingBatch);
    brandBatchSize.textContent = String(batchSize);
    batchSizeSelect.value = String(batchSize);
    copyFormatSelect.value = copyFormat;
    selectionModeInput.checked = selectionMode;
    if (state.lastBatch?.urls?.length) {
      previewBox.textContent = Core.formatBatch(state.lastBatch, copyFormat);
    } else {
      previewBox.textContent = "";
      closePreview();
    }
    if (!fallbackButton.hidden) {
      fallbackButton.textContent = visibleFallbackCount
        ? `复制当前可见的 ${visibleFallbackCount} 条`
        : "当前页面没有可见新链接";
    }

    if (busy) {
      return;
    }
    if (state.pendingBatch?.urls?.length) {
      if (state.pendingBatch.awaitingSelection) {
        setButtonLabel(`复制已选 ${pendingSelectionCount} 条`, String(pendingSelectionCount));
        setWidgetStatus(
          pendingSelectionCount
            ? `本批共 ${state.pendingBatch.urls.length} 条，取消不需要的视频后确认复制`
            : "请至少选择 1 条视频",
          pendingSelectionCount ? "normal" : "error"
        );
        setCompactSummary(`待确认 ${pendingSelectionCount} 条`);
      } else {
        setButtonLabel(
          `重试第 ${state.pendingBatch.batchNumber} 批：${pendingRange.start}–${pendingRange.end}`,
          String(state.pendingBatch.urls.length)
        );
        setWidgetStatus("本批尚未写入剪贴板，点击重试", "error");
        setCompactSummary(`待重试 ${state.pendingBatch.urls.length} 条`);
      }
    } else if (state.exhausted) {
      setButtonLabel("全部链接已复制", "✓");
      setWidgetStatus(
        `全部完成 · 复制 ${deliveredCount} 条${skippedCount ? ` · 跳过 ${skippedCount} 条` : ""}`,
        "success"
      );
      setCompactSummary(`已完成 ${deliveredCount} 条`);
    } else if (state.status === "error") {
      setButtonLabel("重新尝试完整读取", "↻");
      setWidgetStatus(state.error || "完整读取失败，可以重试或复制当前可见链接", "error");
      setCompactSummary("读取失败");
    } else if (deliveredCount) {
      setButtonLabel(
        `复制第 ${state.batchNumber + 1} 批：${nextStart}–${nextEnd}`,
        String(batchSize)
      );
      setWidgetStatus(
        lastRange
          ? `第 ${state.lastBatch.batchNumber} 批 ${lastRange.start}–${lastRange.end} 已复制`
          : `已复制 ${deliveredCount} 条`,
        "success"
      );
      setCompactSummary(`已复制 ${deliveredCount} 条`);
    } else {
      setButtonLabel(`复制第 1 批：1–${batchSize}`, String(batchSize));
      setWidgetStatus(`${currentSource.label} · 无需切换页面`);
      setCompactSummary("未开始");
    }
  }

  function fetchHeaders(config) {
    const headers = { "Content-Type": "application/json" };
    if (config.clientVersion) {
      headers["X-YouTube-Client-Version"] = config.clientVersion;
    }
    headers["X-YouTube-Client-Name"] = "1";
    if (config.visitorData) {
      headers["X-Goog-Visitor-Id"] = config.visitorData;
    }
    return headers;
  }

  async function fetchInitialPage(source) {
    const response = await fetch(source.collectorUrl, {
      credentials: "include",
      cache: "no-store"
    });
    if (!response.ok) {
      throw new Error(`YouTube 页面读取失败（${response.status}）`);
    }
    return response.text();
  }

  async function fetchContinuation(source, continuation, config) {
    if (!config.apiKey) {
      throw new Error("没有找到 YouTube 分页配置，请刷新页面后重试。");
    }
    const defaultApiUrl = source.type === "search"
      ? "/youtubei/v1/search"
      : "/youtubei/v1/browse";
    const endpoint = new URL(
      continuation.apiUrl || defaultApiUrl,
      "https://www.youtube.com"
    );
    endpoint.searchParams.set("key", config.apiKey);
    endpoint.searchParams.set("prettyPrint", "false");
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: fetchHeaders(config),
      body: JSON.stringify({
        context: config.context,
        continuation: continuation.token
      })
    });
    if (!response.ok) {
      throw new Error(`YouTube 下一页读取失败（${response.status}）`);
    }
    return response.json();
  }

  async function collectSourceBatch(source, state, targetCount, onProgress) {
    const deadline = Date.now() + COLLECTION_TIMEOUT_MS;
    const html = await fetchInitialPage(source);
    const initialData = DataCore.extractInitialData(html);
    if (!initialData) {
      throw new Error("没有读取到 YouTube 页面数据，请确认页面可以正常打开。");
    }
    const config = DataCore.extractInnertubeConfig(html);
    const pagination = normalizeSourceState(state).pagination;
    const result = await DataCore.collectBatchFromPages({
      initialPayload: initialData,
      queuedItems: pagination.queuedItems,
      startContinuation: pagination.cursor,
      sourceExhausted: pagination.sourceExhausted,
      excludedIds: [...state.deliveredIds, ...state.skippedIds],
      targetCount,
      maxRequests: MAX_CONTINUATION_REQUESTS,
      onProgress,
      onCursorFallback: () => {
        setWidgetStatus("上次分页位置已过期，正在自动重新定位…");
      },
      fetchContinuation: async (continuation) => {
        if (Date.now() >= deadline) {
          throw new Error("读取超过 60 秒，请稍后重试。");
        }
        setWidgetStatus("正在读取下一页…");
        return fetchContinuation(source, continuation, config);
      }
    });

    return {
      ...result,
      items: result.items.map((item) => ({
        videoId: item.videoId,
        title: Core.normalizeVideoTitle(item.title),
        url: Core.normalizeWatchUrl(item.videoId)
      })),
      pagination: {
        cursor: result.nextContinuation,
        queuedItems: result.queuedItems,
        sourceExhausted: result.sourceExhausted
      }
    };
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (_clipboardError) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      if (!copied) {
        throw new Error("浏览器拒绝写入剪贴板，请再次点击按钮重试。");
      }
    }
  }

  async function copyAndCommit(source, state) {
    const batch = state.pendingBatch;
    if (!batch?.urls?.length) {
      return state;
    }
    const committed = Core.commitPendingBatch(state, batch.batchId);
    if (committed === state || !committed.lastBatch?.urls?.length) {
      throw new Error("请至少选择 1 条视频后再复制。");
    }
    await copyText(Core.formatBatch(committed.lastBatch, copyFormat));
    await saveSourceState(source.sourceKey, committed);
    const range = Core.getBatchRange(committed.lastBatch, committed.deliveredIds.length);
    showToast(
      `已复制第 ${batch.batchNumber} 批：${range.start}–${range.end}，共 ${committed.lastBatch.urls.length} 条`,
      "success"
    );
    return committed;
  }

  async function recopyLastBatch() {
    if (busy || !currentSource) {
      return;
    }
    const state = await readSourceState(currentSource.sourceKey);
    const batch = state.lastBatch;
    if (!batch?.urls?.length) {
      showToast("还没有可以重新复制的批次");
      return;
    }
    busy = true;
    await renderState(state);
    try {
      await copyText(Core.formatBatch(batch, copyFormat));
      const range = Core.getBatchRange(batch, state.deliveredIds.length);
      showToast(`已重新复制第 ${batch.batchNumber} 批：${range.start}–${range.end}`, "success");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      busy = false;
      await renderState(state);
    }
  }

  async function exportDeliveredLinks() {
    if (busy || !currentSource) {
      return;
    }
    const state = await readSourceState(currentSource.sourceKey);
    const items = Core.itemsFromVideoIds(state.deliveredIds, state.titlesById);
    if (!items.length) {
      showToast("当前来源还没有已复制的链接");
      return;
    }

    const blobUrl = URL.createObjectURL(new Blob(
      [Core.formatVideoItems(items, copyFormat)],
      { type: "text/plain;charset=utf-8" }
    ));
    const downloadLink = document.createElement("a");
    downloadLink.href = blobUrl;
    downloadLink.download = Core.createExportFilename(currentSource, items.length);
    downloadLink.hidden = true;
    document.body.append(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
    showToast(`已导出当前来源的 ${items.length} 条记录`, "success");
  }

  async function copyVisibleFallback() {
    if (busy || !currentSource) {
      return;
    }
    let state = await readSourceState(currentSource.sourceKey);
    const items = collectVisibleItems([...state.deliveredIds, ...state.skippedIds]);
    if (!items.length) {
      showToast("当前页面没有尚未复制的可见视频链接");
      return;
    }
    busy = true;
    const rangeStart = state.deliveredIds.length + 1;
    const batch = {
      batchId: crypto.randomUUID(),
      batchNumber: state.batchNumber + 1,
      rangeStart,
      rangeEnd: rangeStart + items.length - 1,
      videoIds: items.map((item) => item.videoId),
      urls: items.map((item) => item.url),
      titles: items.map((item) => item.title),
      ...(selectionMode ? {
        awaitingSelection: true,
        selectedVideoIds: items.map((item) => item.videoId)
      } : {}),
      exhausted: false,
      fallback: true,
      createdAt: Date.now()
    };
    state = await saveSourceState(currentSource.sourceKey, {
      ...state,
      status: "ready",
      error: null,
      pendingBatch: batch
    });
    if (selectionMode) {
      busy = false;
      await renderState(state);
      showToast(`已找到 ${items.length} 条，请确认本批选择`, "success");
      return;
    }
    try {
      state = await copyAndCommit(currentSource, state);
    } catch (error) {
      state = await saveSourceState(currentSource.sourceKey, {
        ...state,
        status: "ready",
        error: error.message
      });
      showToast(error.message, "error");
    } finally {
      busy = false;
      await renderState(state);
    }
  }

  async function runCopy() {
    if (busy) {
      return;
    }
    const source = Core.classifySource(location.href);
    if (!source) {
      showToast("请打开频道、播放列表或搜索结果页后再试");
      return;
    }
    currentSource = source;
    const requestedBatchSize = batchSize;
    busy = true;
    copyButton.disabled = true;
    resetButton.disabled = true;
    recopyButton.disabled = true;
    previewButton.disabled = true;
    exportButton.disabled = true;
    batchSizeSelect.disabled = true;
    copyFormatSelect.disabled = true;
    selectionModeInput.disabled = true;
    fallbackButton.disabled = true;
    setButtonLabel("正在读取视频", `0/${requestedBatchSize}`);
    setWidgetStatus("正在读取页面数据，不会滚动或切换页面");
    setCompactSummary(`读取 0/${requestedBatchSize}`);

    try {
      let state = await readSourceState(source.sourceKey);
      if (state.pendingBatch) {
        state = await copyAndCommit(source, state);
        busy = false;
        await renderState(state);
        return;
      }
      if (state.exhausted) {
        showToast("这个页面的视频已经全部复制完成");
        busy = false;
        await renderState(state);
        return;
      }

      state = await saveSourceState(source.sourceKey, {
        ...state,
        status: "collecting",
        error: null,
        progress: 0
      });
      const result = await collectSourceBatch(source, state, requestedBatchSize, (count) => {
        setButtonLabel("正在读取视频", `${count}/${requestedBatchSize}`);
        setWidgetStatus(`已找到 ${count}/${requestedBatchSize} 条普通视频链接`);
        setCompactSummary(`读取 ${count}/${requestedBatchSize}`);
      });

      if (!result.items.length) {
        state = await saveSourceState(source.sourceKey, {
          ...state,
          status: result.exhausted ? "exhausted" : "error",
          exhausted: result.exhausted,
          pagination: result.pagination,
          progress: 0,
          error: result.exhausted ? null : "本次没有读取到新视频。"
        });
        showToast(result.exhausted ? "没有更多普通视频了" : "本次没有读取到新视频");
        busy = false;
        await renderState(state);
        return;
      }

      const rangeStart = state.deliveredIds.length + 1;
      const batch = {
        batchId: crypto.randomUUID(),
        batchNumber: state.batchNumber + 1,
        rangeStart,
        rangeEnd: rangeStart + result.items.length - 1,
        videoIds: result.items.map((item) => item.videoId),
        urls: result.items.map((item) => item.url),
        titles: result.items.map((item) => item.title),
        ...(selectionMode ? {
          awaitingSelection: true,
          selectedVideoIds: result.items.map((item) => item.videoId)
        } : {}),
        exhausted: result.exhausted,
        createdAt: Date.now()
      };
      state = await saveSourceState(source.sourceKey, {
        ...state,
        status: "ready",
        pendingBatch: batch,
        pagination: result.pagination,
        exhausted: result.exhausted,
        progress: batch.urls.length
      });
      if (selectionMode) {
        busy = false;
        await renderState(state);
        showToast(`已找到 ${batch.urls.length} 条，请确认本批选择`, "success");
        return;
      }
      state = await copyAndCommit(source, state);
      busy = false;
      await renderState(state);
    } catch (error) {
      const state = await readSourceState(source.sourceKey);
      const failedState = await saveSourceState(source.sourceKey, {
        ...state,
        status: state.pendingBatch ? "ready" : "error",
        error: error.message
      });
      busy = false;
      await renderState(failedState);
      showToast(error.message, "error");
    }
  }

  async function resetCurrentSource() {
    if (busy || !currentSource) {
      return;
    }
    if (!window.confirm("清除这个页面的复制进度，并从第一批重新开始吗？")) {
      return;
    }
    const freshState = Core.createDefaultSourceState();
    await saveSourceState(currentSource.sourceKey, freshState);
    await renderState(freshState);
    showToast("已清除当前页面的复制进度");
  }

  async function syncPage() {
    currentUrl = location.href;
    currentSource = Core.classifySource(currentUrl);
    createPanel();
    panel.hidden = true;
    closePreview();
    if (!currentSource) {
      return;
    }
    const uiState = await readUiState();
    await setBatchSize(uiState.batchSize, false);
    await setCopyFormat(uiState.copyFormat, false);
    await setSelectionMode(uiState.selectionMode, false);
    await setCollapsed(uiState.collapsed, false);
    panel.hidden = false;
    const state = await readSourceState(currentSource.sourceKey);
    await renderState(state);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "TRIGGER_PAGE_COPY") {
      return false;
    }
    void runCopy();
    sendResponse({ accepted: true });
    return false;
  });

  document.addEventListener("yt-navigate-finish", () => void syncPage());
  window.setInterval(() => {
    if (location.href !== currentUrl) {
      void syncPage();
    } else {
      setTheme();
    }
  }, 1_000);

  void syncPage();
})();
