"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Platforms = require("../src/platforms.js");

test("B站视频链接统一为无参数 BV 地址", () => {
  assert.deepEqual(
    Platforms.parseVideoUrl(
      "//www.bilibili.com/video/BV1ZTu96zEwg?p=2&spm_id_from=333",
      "bilibili",
      "https://space.bilibili.com/12345/video"
    ),
    {
      videoId: "BV1ZTu96zEwg",
      url: "https://www.bilibili.com/video/BV1ZTu96zEwg"
    }
  );
  assert.equal(
    Platforms.parseVideoUrl("https://member.bilibili.com/platform/upload/video/frame", "bilibili"),
    null
  );
  assert.equal(
    Platforms.parseVideoUrl("https://example.com/video/BV1ZTu96zEwg", "bilibili"),
    null
  );
});

test("抖音卡片 ID 统一为标准视频地址", () => {
  assert.deepEqual(
    Platforms.parseVideoUrl(
      "/video/7670990461129092435?previous_page=web_code_link",
      "douyin",
      "https://www.douyin.com/jingxuan"
    ),
    {
      videoId: "7670990461129092435",
      url: "https://www.douyin.com/video/7670990461129092435"
    }
  );
});

test("小红书视频笔记保留打开页面所需的 xsec 参数", () => {
  assert.deepEqual(
    Platforms.parseVideoUrl(
      "/explore/6a694c980000000009035ab9?xsec_token=abc%3D&xsec_source=pc_feed&foo=bar",
      "xiaohongshu",
      "https://www.xiaohongshu.com/explore"
    ),
    {
      videoId: "6a694c980000000009035ab9",
      url: "https://www.xiaohongshu.com/explore/6a694c980000000009035ab9" +
        "?xsec_token=abc%3D&xsec_source=pc_feed"
    }
  );
  assert.deepEqual(
    Platforms.parseVideoUrl(
      "/user/profile/6041c1fa000000000100510d/648737130000000011012296" +
        "?xsec_token=profile%3D&xsec_source=pc_user",
      "xiaohongshu",
      "https://www.xiaohongshu.com/user/profile/6041c1fa000000000100510d"
    ),
    {
      videoId: "648737130000000011012296",
      url: "https://www.xiaohongshu.com/explore/648737130000000011012296" +
        "?xsec_token=profile%3D&xsec_source=pc_user"
    }
  );
});
