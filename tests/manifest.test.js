"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const manifestPath = path.join(projectRoot, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));

test("清单使用 Manifest V3 和最小业务权限", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, packageJson.version);
  assert.deepEqual(manifest.permissions.sort(), ["clipboardWrite", "storage"]);
  const permissionText = manifest.host_permissions.join("\n");
  for (const domain of ["youtube.com", "bilibili.com", "douyin.com", "xiaohongshu.com"]) {
    assert.match(permissionText, new RegExp(domain.replace(".", "\\.")));
  }
});

test("清单引用的扩展文件全部存在", () => {
  const referencedFiles = [
    manifest.background.service_worker,
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action.default_icon || {}),
    ...manifest.content_scripts.flatMap((entry) => [
      ...(entry.js || []),
      ...(entry.css || [])
    ])
  ].filter(Boolean);

  for (const relativePath of referencedFiles) {
    assert.ok(
      fs.existsSync(path.join(projectRoot, relativePath)),
      `缺少清单引用文件：${relativePath}`
    );
  }
});

test("扩展和工具栏图标使用完整的 PNG 尺寸", () => {
  const expectedSizes = ["16", "32", "48", "128"];

  assert.deepEqual(Object.keys(manifest.icons), expectedSizes);
  assert.deepEqual(Object.keys(manifest.action.default_icon), expectedSizes);
  assert.deepEqual(manifest.action.default_icon, manifest.icons);
  assert.ok(Object.values(manifest.icons).every((iconPath) => iconPath.endsWith(".png")));
  assert.ok(fs.existsSync(path.join(projectRoot, "assets/icon.svg")));

  for (const size of expectedSizes) {
    const iconBuffer = fs.readFileSync(path.join(projectRoot, manifest.icons[size]));
    assert.deepEqual(
      [...iconBuffer.subarray(0, 8)],
      [137, 80, 78, 71, 13, 10, 26, 10],
      `${size}px 图标不是有效 PNG`
    );
    assert.equal(iconBuffer.readUInt32BE(16), Number(size));
    assert.equal(iconBuffer.readUInt32BE(20), Number(size));
  }
});

test("工具栏和页面按钮共用内容脚本且不再打开弹窗", () => {
  assert.equal(manifest.action.default_popup, undefined);
  const scripts = manifest.content_scripts.flatMap((entry) => entry.js || []);
  assert.ok(scripts.includes("src/collector.js"));
  assert.ok(scripts.includes("src/platforms.js"));
  assert.ok(scripts.includes("src/youtube-data.js"));
  const background = fs.readFileSync(path.join(projectRoot, "src/background.js"), "utf8");
  assert.doesNotMatch(background, /chrome\.tabs\.create/);
});

test("快捷键复用页面复制流程且不增加权限", () => {
  assert.deepEqual(manifest.commands["copy-next-batch"], {
    suggested_key: { default: "Alt+Shift+Y" },
    description: "复制或确认当前平台的下一批视频链接"
  });
  const background = fs.readFileSync(path.join(projectRoot, "src/background.js"), "utf8");
  assert.match(background, /chrome\.commands\.onCommand/);
  assert.match(background, /TRIGGER_PAGE_COPY/);
  assert.deepEqual(manifest.permissions.sort(), ["clipboardWrite", "storage"]);
});
