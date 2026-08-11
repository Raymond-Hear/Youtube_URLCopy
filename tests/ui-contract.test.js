"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const collector = fs.readFileSync(path.join(projectRoot, "src/collector.js"), "utf8");
const styles = fs.readFileSync(path.join(projectRoot, "src/page-button.css"), "utf8");

test("页面工具保留 v1.2 的四项 MVP 交互入口", () => {
  assert.match(collector, /youtubeLinkCopyUiStateV1/);
  assert.match(collector, /重新复制上一批/);
  assert.match(collector, /copyVisibleFallback/);
  assert.match(collector, /pagination:\s*result\.pagination/);
  assert.match(styles, /data-collapsed="true"/);
});

test("v1.3 本地预览支持批次大小选择和上一批预览", () => {
  assert.match(collector, /class="ytlc-batch-size"/);
  assert.match(collector, /value="10"/);
  assert.match(collector, /value="25"/);
  assert.match(collector, /value="50"/);
  assert.match(collector, /Core\.normalizeBatchSize/);
  assert.match(collector, /class="ytlc-preview"/);
  assert.match(collector, /togglePreview/);
  assert.match(styles, /\.ytlc-batch-size/);
  assert.match(styles, /\.ytlc-preview/);
});

test("v1.3.1 本地预览可以导出当前来源的已复制记录", () => {
  assert.match(collector, /class="ytlc-export"/);
  assert.match(collector, /exportDeliveredLinks/);
  assert.match(collector, /Core\.itemsFromVideoIds/);
  assert.match(collector, /Core\.createExportFilename/);
  assert.match(collector, /text\/plain;charset=utf-8/);
});

test("v1.4 本地预览支持仅链接和标题加链接格式", () => {
  assert.match(collector, /class="ytlc-copy-format"/);
  assert.match(collector, /value="title-link"/);
  assert.match(collector, /Core\.formatBatch/);
  assert.match(collector, /Core\.formatVideoItems/);
  assert.match(collector, /titles:\s*result\.items\.map/);
  assert.match(styles, /\.ytlc-copy-format/);
});

test("v1.5 本地预览支持复制前逐条选择并记录跳过项", () => {
  assert.match(collector, /class="ytlc-selection-mode"/);
  assert.match(collector, /class="ytlc-selection"/);
  assert.match(collector, /awaitingSelection/);
  assert.match(collector, /selectedVideoIds/);
  assert.match(collector, /skippedIds/);
  assert.match(styles, /\.ytlc-selection-item/);
});
