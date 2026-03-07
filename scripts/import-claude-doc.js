#!/usr/bin/env node
/**
 * Imports a raw Claude HTML doc into a target track folder with normalized naming
 * and optional DOC_META block.
 *
 * Usage:
 * node scripts/import-claude-doc.js --input ./raw/day1.html --track DSA --day 3 --title "Day 3 Plan"
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function normalizeHtml(html, meta) {
  let out = html;
  const metaComment = `<!-- DOC_META: ${JSON.stringify(meta)} -->`;
  if (/<!--\s*DOC_META:/i.test(out)) {
    out = out.replace(/<!--\s*DOC_META:\s*({[\s\S]*?})\s*-->/i, metaComment);
  } else if (/<body[^>]*>/i.test(out)) {
    out = out.replace(/<body[^>]*>/i, (m) => `${m}\n${metaComment}\n`);
  } else {
    out = `${metaComment}\n${out}`;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args.input ? path.resolve(process.cwd(), args.input) : null;
  const track = args.track ? String(args.track) : null;
  const day = args.day ? Number(args.day) : null;

  if (!input || !track) {
    console.error("Usage: node scripts/import-claude-doc.js --input <file> --track <folder> [--day N] [--title <title>]");
    process.exit(1);
  }
  if (!fs.existsSync(input)) {
    console.error(`Input not found: ${input}`);
    process.exit(1);
  }

  const trackDir = path.join(ROOT, track);
  ensureDir(trackDir);
  const fileName = day ? `day-${day}-plan.html` : path.basename(input);
  const outPath = path.join(trackDir, fileName);
  const html = fs.readFileSync(input, "utf8");

  const meta = {
    track,
    day: Number.isFinite(day) ? day : undefined,
    title: args.title || undefined,
    tags: args.tags ? String(args.tags).split(",").map((x) => x.trim()).filter(Boolean) : [],
    estimatedMinutes: args.estimatedMinutes ? Number(args.estimatedMinutes) : undefined,
    difficulty: args.difficulty || undefined,
    sourceGeneratedDate: new Date().toISOString().slice(0, 10),
    status: "todo",
  };

  Object.keys(meta).forEach((k) => {
    if (meta[k] === undefined || meta[k] === null || meta[k] === "") delete meta[k];
  });

  const normalized = normalizeHtml(html, meta);
  fs.writeFileSync(outPath, normalized, "utf8");
  console.log(`Imported to ${path.relative(ROOT, outPath)}`);
}

if (require.main === module) {
  main();
}
