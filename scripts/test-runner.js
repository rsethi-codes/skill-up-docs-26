#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  inferDayFromName,
  readDocMeta,
  stableDocId,
  toKebab,
  buildPayload,
} = require("./generate-roadmaps");

function testInferDay() {
  assert.strictEqual(inferDayFromName("day-1-plan.html"), 1);
  assert.strictEqual(inferDayFromName("Day 24 Notes.html"), 24);
  assert.strictEqual(inferDayFromName("topic-intro.html"), null);
}

function testKebabAndDocId() {
  assert.strictEqual(toKebab("Month-1 Plan/Week-1 Plan"), "month-1-plan-week-1-plan");
  assert.ok(stableDocId("dsa", "DSA/day-1-plan.html").startsWith("dsa__"));
}

function testDocMetaParsing() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skillup-meta-"));
  const okFile = path.join(tmpDir, "ok.html");
  const badFile = path.join(tmpDir, "bad.html");
  fs.writeFileSync(okFile, "<!-- DOC_META: {\"day\": 2, \"tags\":[\"arrays\"]} --><html></html>", "utf8");
  fs.writeFileSync(badFile, "<!-- DOC_META: {\"day\": 2,, } --><html></html>", "utf8");

  const ok = readDocMeta(okFile);
  assert.strictEqual(ok.meta.day, 2);
  assert.deepStrictEqual(ok.meta.tags, ["arrays"]);
  assert.strictEqual(ok.errors.length, 0);

  const bad = readDocMeta(badFile);
  assert.strictEqual(Array.isArray(bad.errors), true);
  assert.strictEqual(bad.errors.length > 0, true);
}

function testBuildPayload() {
  const payload = buildPayload("2026-03-07T00:00:00.000Z");
  assert.strictEqual(payload.schemaVersion, 2);
  assert.strictEqual(Array.isArray(payload.roadmaps), true);
  payload.roadmaps.forEach((r) => {
    assert.ok(r.id);
    assert.ok(r.name);
    (r.docs || []).forEach((d) => {
      assert.ok(d.trackId);
      assert.ok(d.trackName);
      assert.ok(d.docId);
      assert.ok(d.href);
      assert.ok(d.title);
    });
  });
}

function testRoadmapsDataShape() {
  const dataPath = path.resolve(__dirname, "..", "roadmaps-data.js");
  if (!fs.existsSync(dataPath)) return;
  const raw = fs.readFileSync(dataPath, "utf8");
  assert.ok(raw.startsWith("window.ROADMAPS_DATA = "));
  assert.ok(raw.includes("\"roadmaps\""));
}

function run() {
  testInferDay();
  testKebabAndDocId();
  testDocMetaParsing();
  testBuildPayload();
  testRoadmapsDataShape();
  console.log("All tests passed.");
}

run();
