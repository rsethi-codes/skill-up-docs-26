#!/usr/bin/env node
/**
 * Generates roadmap data (schema v2 + backward compatible fields).
 * Usage: node scripts/generate-roadmaps.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT_JSON = path.join(ROOT, "roadmaps.json");
const OUT_JS = path.join(ROOT, "roadmaps-data.js");
const IGNORE = new Set(["node_modules", ".git", "scripts", ".cursor", ".github", ".vscode"]);
const DEFAULT_ESTIMATED_MINUTES = 90;
const DOC_META_RE = /<!--\s*DOC_META:\s*({[\s\S]*?})\s*-->/i;

function humanize(str) {
  return String(str || "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function toKebab(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inferDayFromName(fileName) {
  const n = path.basename(fileName, ".html");
  const m = n.match(/day[-_\s]?(\d+)/i);
  return m ? Number(m[1]) : null;
}

function stableDocId(trackId, href) {
  return `${trackId}__${toKebab(href.replace(/[\\/]/g, "-").replace(/\.html$/i, ""))}`;
}

function readDocMeta(absPath) {
  let html = "";
  try {
    html = fs.readFileSync(absPath, "utf8");
  } catch (e) {
    return { meta: {}, errors: [] };
  }
  const match = html.match(DOC_META_RE);
  if (!match) return { meta: {}, errors: [] };
  try {
    const parsed = JSON.parse(match[1]);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { meta: {}, errors: [`DOC_META is not an object: ${absPath}`] };
    }
    return { meta: parsed, errors: [] };
  } catch (err) {
    return { meta: {}, errors: [`Invalid DOC_META JSON: ${absPath} (${err.message})`] };
  }
}

function getTrackName(folderPath) {
  const parts = folderPath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length > 1) return humanize(parts.slice(-2).join(" — "));
  return humanize(parts[0] || "Roadmap");
}

function getAllDocs() {
  const byFolder = new Map();
  const errors = [];

  function walk(currentDir, prefix = "") {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const ent of entries) {
      if (IGNORE.has(ent.name)) continue;
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      const full = path.join(currentDir, ent.name);
      if (ent.isDirectory()) {
        walk(full, rel);
      } else if (ent.isFile() && /\.html$/i.test(ent.name) && ent.name.toLowerCase() !== "index.html") {
        const folder = prefix || path.dirname(rel);
        if (!byFolder.has(folder)) byFolder.set(folder, []);
        const { meta, errors: docErrors } = readDocMeta(full);
        errors.push(...docErrors);
        byFolder.get(folder).push({
          fileName: ent.name,
          title: humanize(path.basename(ent.name, ".html")),
          href: rel.replace(/\\/g, "/"),
          absPath: full,
          meta,
        });
      }
    }
  }

  walk(ROOT, "");
  return { byFolder, errors };
}

function mapDocV2(track, doc, idx, docsSorted) {
  const meta = doc.meta || {};
  const inferredDay = inferDayFromName(doc.fileName);
  const status = ["todo", "in-progress", "done"].includes(String(meta.status || "")) ? meta.status : "todo";
  const tags = Array.isArray(meta.tags) ? meta.tags.map((t) => String(t).trim()).filter(Boolean) : [];
  const difficulty = String(meta.difficulty || "medium").toLowerCase();

  return {
    trackId: track.id,
    trackName: track.name,
    docId: meta.docId ? String(meta.docId) : stableDocId(track.id, doc.href),
    dayNumber: Number.isFinite(meta.day) ? Number(meta.day) : inferredDay,
    title: meta.title ? String(meta.title) : doc.title,
    href: doc.href,
    status,
    estimatedMinutes: Number(meta.estimatedMinutes || DEFAULT_ESTIMATED_MINUTES),
    difficulty: ["easy", "medium", "hard"].includes(difficulty) ? difficulty : "medium",
    tags,
    sourceGeneratedDate: meta.sourceGeneratedDate ? String(meta.sourceGeneratedDate) : "",
    lastReviewedDate: meta.lastReviewedDate ? String(meta.lastReviewedDate) : "",
    nextReviewDate: meta.nextReviewDate ? String(meta.nextReviewDate) : "",
    prev: idx > 0 ? docsSorted[idx - 1].href : null,
    next: idx < docsSorted.length - 1 ? docsSorted[idx + 1].href : null,
  };
}

function buildPayload(nowIso = new Date().toISOString()) {
  const { byFolder, errors } = getAllDocs();
  const roadmaps = [];

  for (const [folderPath, docs] of byFolder) {
    const id = toKebab(folderPath.replace(/[\\/]/g, "-")) || "roadmap";
    const name = getTrackName(folderPath);
    const sorted = docs.slice().sort((a, b) => a.href.localeCompare(b.href, undefined, { numeric: true }));
    const track = { id, name, path: folderPath.replace(/\\/g, "/") };
    const v2Docs = sorted.map((d, i) => mapDocV2(track, d, i, sorted));

    roadmaps.push({
      id: track.id,
      name: track.name,
      path: track.path,
      docs: v2Docs,
    });
  }

  roadmaps.sort((a, b) => a.name.localeCompare(b.name));

  return {
    schemaVersion: 2,
    generated: nowIso,
    warnings: errors,
    roadmaps,
  };
}

function writePayload(payload) {
  fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2), "utf8");
  fs.writeFileSync(OUT_JS, `window.ROADMAPS_DATA = ${JSON.stringify(payload)};\n`, "utf8");
}

function main() {
  const payload = buildPayload();
  writePayload(payload);
  console.log(`Wrote ${OUT_JSON} and ${OUT_JS} with ${payload.roadmaps.length} roadmap(s).`);
  if (payload.warnings && payload.warnings.length) {
    console.warn(`Warnings: ${payload.warnings.length}`);
    payload.warnings.forEach((w) => console.warn(`- ${w}`));
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DOC_META_RE,
  buildPayload,
  inferDayFromName,
  readDocMeta,
  stableDocId,
  toKebab,
};
