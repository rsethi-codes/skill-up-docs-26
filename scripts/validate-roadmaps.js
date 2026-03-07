#!/usr/bin/env node
/**
 * Validates generated roadmap data and doc file integrity.
 * Usage: node scripts/validate-roadmaps.js
 */

const fs = require("fs");
const path = require("path");
const { buildPayload } = require("./generate-roadmaps");

const ROOT = path.resolve(__dirname, "..");

function isExternal(href) {
  return /^(https?:)?\/\//i.test(href) || href.startsWith("mailto:") || href.startsWith("tel:");
}

function collectRelativeLinks(html) {
  const out = [];
  const re = /<(?:a|link|script|img)\b[^>]*(?:href|src)\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    out.push(m[1]);
  }
  return out;
}

function extractDocMeta(html) {
  const re = /<!--\s*DOC_META:\s*({[\s\S]*?})\s*-->/i;
  const m = html.match(re);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function collectHeadingIds(html) {
  const out = new Set();
  const re = /<(h[1-6])\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    out.add(m[2]);
  }
  return out;
}

function isUuid(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(str || ""));
}

function validateDocMetaContract(docHref, html, issues) {
  const meta = extractDocMeta(html);
  if (!meta) return;
  const headingIds = collectHeadingIds(html);

  if (meta.requiredSections !== undefined) {
    if (!Array.isArray(meta.requiredSections)) {
      issues.push(`DOC_META.requiredSections must be an array in ${docHref}`);
    } else {
      meta.requiredSections.forEach((id) => {
        if (!id || typeof id !== "string") {
          issues.push(`DOC_META.requiredSections contains non-string id in ${docHref}`);
          return;
        }
        if (!headingIds.has(id)) {
          issues.push(`DOC_META.requiredSections references missing heading id "${id}" in ${docHref}`);
        }
      });
    }
  }

  if (meta.sectionMappings !== undefined) {
    if (!meta.sectionMappings || typeof meta.sectionMappings !== "object" || Array.isArray(meta.sectionMappings)) {
      issues.push(`DOC_META.sectionMappings must be an object in ${docHref}`);
    } else {
      Object.entries(meta.sectionMappings).forEach(([sectionId, mapping]) => {
        if (!headingIds.has(sectionId)) {
          issues.push(`DOC_META.sectionMappings references missing heading id "${sectionId}" in ${docHref}`);
        }
        if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
          issues.push(`DOC_META.sectionMappings["${sectionId}"] must be an object in ${docHref}`);
          return;
        }
        if (mapping.taskId !== undefined && !isUuid(mapping.taskId)) {
          issues.push(`DOC_META.sectionMappings["${sectionId}"].taskId is not a UUID in ${docHref}`);
        }
        if (mapping.topicId !== undefined && !isUuid(mapping.topicId)) {
          issues.push(`DOC_META.sectionMappings["${sectionId}"].topicId is not a UUID in ${docHref}`);
        }
        if (mapping.taskId === undefined && mapping.topicId === undefined) {
          issues.push(`DOC_META.sectionMappings["${sectionId}"] must include taskId and/or topicId in ${docHref}`);
        }
      });
    }
  }

  if (meta.completionPolicy !== undefined) {
    if (!meta.completionPolicy || typeof meta.completionPolicy !== "object" || Array.isArray(meta.completionPolicy)) {
      issues.push(`DOC_META.completionPolicy must be an object in ${docHref}`);
    } else {
      const mode = meta.completionPolicy.mode;
      if (mode !== "required_sections_pct" && mode !== "manual") {
        issues.push(`DOC_META.completionPolicy.mode must be "required_sections_pct" or "manual" in ${docHref}`);
      }
      if (mode === "required_sections_pct") {
        const pct = Number(meta.completionPolicy.pct);
        if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
          issues.push(`DOC_META.completionPolicy.pct must be 1-100 in ${docHref}`);
        }
        if (!Array.isArray(meta.requiredSections) || meta.requiredSections.length === 0) {
          issues.push(`DOC_META.completionPolicy requires requiredSections in ${docHref}`);
        }
      }
    }
  }
}

function main() {
  const payload = buildPayload();
  const issues = [];

  const seenDocIds = new Map();
  const seenHref = new Set();

  payload.roadmaps.forEach((r) => {
    (r.docs || []).forEach((d, i, arr) => {
      if (!d.docId) issues.push(`Missing docId: ${d.href}`);
      if (seenDocIds.has(d.docId)) issues.push(`Duplicate docId "${d.docId}" in ${d.href} and ${seenDocIds.get(d.docId)}`);
      else seenDocIds.set(d.docId, d.href);

      if (!d.href) issues.push(`Missing href in ${r.name}`);
      else seenHref.add(d.href);

      const abs = path.join(ROOT, d.href);
      if (!fs.existsSync(abs)) issues.push(`Missing file for href: ${d.href}`);

      const expectedPrev = i > 0 ? arr[i - 1].href : null;
      const expectedNext = i < arr.length - 1 ? arr[i + 1].href : null;
      if (d.prev !== expectedPrev) issues.push(`Prev mismatch in ${d.href}: got ${d.prev}, expected ${expectedPrev}`);
      if (d.next !== expectedNext) issues.push(`Next mismatch in ${d.href}: got ${d.next}, expected ${expectedNext}`);
    });
  });

  if (payload.warnings && payload.warnings.length) {
    payload.warnings.forEach((w) => issues.push(`Metadata warning: ${w}`));
  }

  payload.roadmaps.forEach((r) => {
    (r.docs || []).forEach((d) => {
      const abs = path.join(ROOT, d.href);
      if (!fs.existsSync(abs)) return;
      const html = fs.readFileSync(abs, "utf8");
      validateDocMetaContract(d.href, html, issues);
      const links = collectRelativeLinks(html);
      links.forEach((href) => {
        if (!href || href.startsWith("#") || isExternal(href) || href.startsWith("data:")) return;
        const target = path.resolve(path.dirname(abs), href);
        if (!fs.existsSync(target)) {
          issues.push(`Broken relative link in ${d.href}: ${href}`);
        }
      });
    });
  });

  if (issues.length) {
    console.error(`Validation failed with ${issues.length} issue(s):`);
    issues.forEach((i) => console.error(`- ${i}`));
    process.exitCode = 1;
    return;
  }

  console.log("Validation passed.");
}

if (require.main === module) {
  main();
}
