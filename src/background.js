"use strict";

chrome.action.onClicked.addListener(async (tab) => {
  let isYouTubePage = false;
  try {
    const url = new URL(tab.url || "");
    isYouTubePage = url.protocol === "https:" &&
      ["www.youtube.com", "youtube.com"].includes(url.hostname);
  } catch (_error) {
    isYouTubePage = false;
  }

  if (!tab.id || !isYouTubePage) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_PAGE_COPY" });
  } catch (_error) {
    // The page may have been open before the extension was installed or reloaded.
    // A normal page refresh injects the page button and restores toolbar handling.
  }
});
