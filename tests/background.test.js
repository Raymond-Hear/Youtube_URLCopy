"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const backgroundSource = fs.readFileSync(
  path.resolve(__dirname, "../src/background.js"),
  "utf8"
);

function loadBackground(activeTab = {
  id: 42,
  url: "https://www.youtube.com/@creator"
}) {
  let actionListener = null;
  let commandListener = null;
  const queryCalls = [];
  const messages = [];
  const chrome = {
    action: {
      onClicked: {
        addListener(listener) {
          actionListener = listener;
        }
      }
    },
    commands: {
      onCommand: {
        addListener(listener) {
          commandListener = listener;
        }
      }
    },
    tabs: {
      async query(options) {
        queryCalls.push(options);
        return activeTab ? [activeTab] : [];
      },
      async sendMessage(tabId, message) {
        messages.push({ tabId, message });
      }
    }
  };

  vm.runInNewContext(backgroundSource, { chrome, URL });
  return { actionListener, commandListener, queryCalls, messages };
}

test("快捷键触发当前支持平台标签中的页面复制流程", async () => {
  const runtime = loadBackground();
  await runtime.commandListener("copy-next-batch");
  assert.equal(runtime.queryCalls.length, 1);
  assert.equal(runtime.queryCalls[0].active, true);
  assert.equal(runtime.queryCalls[0].currentWindow, true);
  assert.equal(runtime.messages.length, 1);
  assert.equal(runtime.messages[0].tabId, 42);
  assert.equal(runtime.messages[0].message.type, "TRIGGER_PAGE_COPY");
});

test("快捷键不会在非支持页面发送复制消息", async () => {
  const runtime = loadBackground({ id: 7, url: "https://example.com/" });
  await runtime.commandListener("copy-next-batch");
  assert.deepEqual(runtime.messages, []);
});

test("B站、抖音和小红书都能接收快捷键复制消息", async () => {
  for (const url of [
    "https://space.bilibili.com/12345/video",
    "https://www.douyin.com/jingxuan",
    "https://www.xiaohongshu.com/explore"
  ]) {
    const runtime = loadBackground({ id: 8, url });
    await runtime.commandListener("copy-next-batch");
    assert.equal(runtime.messages.length, 1, url);
    assert.equal(runtime.messages[0].message.type, "TRIGGER_PAGE_COPY");
  }
});

test("忽略扩展中的其他命令", async () => {
  const runtime = loadBackground();
  await runtime.commandListener("unrelated-command");
  assert.deepEqual(runtime.queryCalls, []);
  assert.deepEqual(runtime.messages, []);
});
