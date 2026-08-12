"use strict";

const COPY_COMMAND = "copy-next-batch";
const SUPPORTED_HOSTS = new Set([
  "www.youtube.com",
  "youtube.com",
  "www.bilibili.com",
  "space.bilibili.com",
  "search.bilibili.com",
  "www.douyin.com",
  "douyin.com",
  "www.xiaohongshu.com",
  "xiaohongshu.com"
]);

async function triggerPageCopy(tab) {
  let isSupportedPage = false;
  try {
    const url = new URL(tab.url || "");
    isSupportedPage = url.protocol === "https:" && SUPPORTED_HOSTS.has(url.hostname);
  } catch (_error) {
    isSupportedPage = false;
  }

  if (!tab.id || !isSupportedPage) {
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
