"use strict";

const COPY_COMMAND = "copy-next-batch";

async function triggerPageCopy(tab) {
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
}

chrome.action.onClicked.addListener(async (tab) => {
  await triggerPageCopy(tab);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== COPY_COMMAND) {
    return;
  }
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab) {
    await triggerPageCopy(activeTab);
  }
});
