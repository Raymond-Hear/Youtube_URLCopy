"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const collector = fs.readFileSync(path.join(projectRoot, "src/collector.js"), "utf8");
const styles = fs.readFileSync(path.join(projectRoot, "src/page-button.css"), "utf8");

test("v1.2 页面工具保留四项 MVP 交互入口", () => {
  assert.match(collector, /youtubeLinkCopyUiStateV1/);
  assert.match(collector, /重新复制上一批/);
  assert.match(collector, /copyVisibleFallback/);
  assert.match(collector, /pagination:\s*result\.pagination/);
  assert.match(styles, /data-collapsed="true"/);
});
