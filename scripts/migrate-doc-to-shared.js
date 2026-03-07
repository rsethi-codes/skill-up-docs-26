#!/usr/bin/env node
/**
 * Migrate a doc HTML file to use shared assets (docs.css, docs.js).
 * Usage: node scripts/migrate-doc-to-shared.js [path-to-doc.html]
 *        If no path given, migrates all .html docs (except index.html).
 * Options: --dry-run  (report only, do not write)
 * Safety: Creates a .bak file before overwriting. Skips if already migrated (has docs.css link).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IGNORE = new Set(['node_modules', '.git', 'scripts', '.cursor']);

function getAssetPath(htmlPath) {
  const rel = path.relative(ROOT, path.dirname(htmlPath)).replace(/\\/g, '/');
  if (!rel || rel === '.') return 'assets/';
  const depth = rel.split('/').length;
  return '../'.repeat(depth) + 'assets/';
}

function isAlreadyMigrated(html) {
  return /docs\.css|docs\.js/.test(html);
}

function migrate(html, assetPath) {
  let out = html;
  let changed = false;

  // Replace first <style>...</style> with link to shared CSS
  const styleRe = /<style[^>]*>[\s\S]*?<\/style>/;
  const styleMatch = out.match(styleRe);
  if (styleMatch) {
    const link = `<link rel="stylesheet" href="${assetPath}docs.css">`;
    out = out.replace(styleRe, link);
    changed = true;
  }

  // Replace the main doc script (contains copyCode / revealAnswer / scroll) with script src
  const scriptBlockRe = /<script>[\s\S]*?<\/script>/g;
  const scriptTag = `<script src="${assetPath}docs.js"></script>`;
  let scriptReplaced = false;
  out = out.replace(scriptBlockRe, (match) => {
    if (!scriptReplaced && /function copyCode|copyCode\s*\(|revealAnswer\s*\(|addEventListener\s*\(\s*["']scroll["']/.test(match)) {
      scriptReplaced = true;
      changed = true;
      return scriptTag;
    }
    return match;
  });

  return { html: out, changed };
}

function getAllDocPaths(dir, prefix = '') {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (IGNORE.has(ent.name)) continue;
    const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      results.push(...getAllDocPaths(full, rel));
    } else if (ent.isFile() && ent.name.endsWith('.html') && ent.name.toLowerCase() !== 'index.html') {
      results.push(path.join(dir, ent.name));
    }
  }
  return results;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fileArg = args.find((a) => !a.startsWith('--'));

  const files = fileArg
    ? [path.isAbsolute(fileArg) ? fileArg : path.resolve(process.cwd(), fileArg)]
    : getAllDocPaths(ROOT);

  let migrated = 0;
  let skipped = 0;

  for (const filePath of files) {
    if (!fs.existsSync(filePath)) {
      console.warn('Skip (not found):', filePath);
      skipped++;
      continue;
    }

    let html = fs.readFileSync(filePath, 'utf8');
    if (isAlreadyMigrated(html)) {
      console.log('Already migrated:', path.relative(ROOT, filePath));
      skipped++;
      continue;
    }

    const assetPath = getAssetPath(filePath);
    const { html: newHtml, changed } = migrate(html, assetPath);

    if (!changed) {
      console.warn('No replacements made:', path.relative(ROOT, filePath));
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log('[dry-run] Would migrate:', path.relative(ROOT, filePath), '-> asset path', assetPath);
      migrated++;
      continue;
    }

    const bakPath = filePath + '.bak';
    fs.writeFileSync(bakPath, html, 'utf8');
    fs.writeFileSync(filePath, newHtml, 'utf8');
    console.log('Migrated:', path.relative(ROOT, filePath), '(backup:', path.relative(ROOT, bakPath) + ')');
    migrated++;
  }

  if (dryRun && migrated > 0) {
    console.log('\nRun without --dry-run to apply changes.');
  }
  console.log('\nDone. Migrated:', migrated, 'Skipped:', skipped);
}

main();
