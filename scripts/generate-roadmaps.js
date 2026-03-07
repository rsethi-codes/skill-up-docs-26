#!/usr/bin/env node
/**
 * Scans the repo for folders containing .html docs and generates roadmaps.json.
 * Run from project root: node scripts/generate-roadmaps.js
 * New plan folders (e.g. DSA, FE-plan, full-stack-plan) will appear automatically.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_JSON = path.join(ROOT, 'roadmaps.json');
const OUT_JS = path.join(ROOT, 'roadmaps-data.js');
const IGNORE = new Set(['node_modules', '.git', 'scripts', '.cursor']);

function humanize(str) {
  return str
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/ \d+ /g, (m) => m.trim() + ' ')
    .trim();
}

function getFolderLabel(folderPath) {
  const parts = folderPath.replace(/\\/g, '/').split('/').filter(Boolean);
  const name = parts[parts.length - 1];
  const withParent = parts.length > 1 ? parts.slice(-2).join(' — ') : name;
  return parts.length > 1 ? humanize(withParent) : humanize(name);
}

function scanDir(dir, relativeTo = ROOT) {
  const roadmapsByFolder = new Map();

  function walk(currentDir, prefix = '') {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const ent of entries) {
      if (IGNORE.has(ent.name)) continue;
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      const full = path.join(currentDir, ent.name);
      if (ent.isDirectory()) {
        walk(full, rel);
      } else if (ent.isFile() && ent.name.endsWith('.html') && ent.name.toLowerCase() !== 'index.html') {
        const folderKey = prefix || path.dirname(rel);
        if (!roadmapsByFolder.has(folderKey)) {
          roadmapsByFolder.set(folderKey, []);
        }
        const href = rel.replace(/\\/g, '/');
        let title = path.basename(ent.name, '.html');
        title = humanize(title.replace(/-/g, ' '));
        roadmapsByFolder.get(folderKey).push({ title, href });
      }
    }
  }

  walk(dir, '');
  return roadmapsByFolder;
}

function main() {
  const roadmapsByFolder = scanDir(ROOT);
  const roadmaps = [];

  for (const [folderPath, docs] of roadmapsByFolder) {
    const sorted = docs.sort((a, b) => a.href.localeCompare(b.href));
    const docsWithNav = sorted.map((d, i) => ({
      ...d,
      prev: i > 0 ? sorted[i - 1].href : null,
      next: i < sorted.length - 1 ? sorted[i + 1].href : null,
    }));
    roadmaps.push({
      id: folderPath.replace(/[/\\]/g, '-').toLowerCase(),
      name: getFolderLabel(folderPath),
      path: folderPath.replace(/\\/g, '/'),
      docs: docsWithNav,
    });
  }

  roadmaps.sort((a, b) => a.name.localeCompare(b.name));
  const payload = { generated: new Date().toISOString(), roadmaps };

  fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync(
    OUT_JS,
    'window.ROADMAPS_DATA = ' + JSON.stringify(payload) + ';\n',
    'utf8'
  );
  console.log('Wrote', OUT_JSON, 'and', OUT_JS, 'with', roadmaps.length, 'roadmap(s).');
}

main();
