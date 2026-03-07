# skill-up-docs-26

Structured learning roadmaps (DSA, Frontend, Full Stack, etc.). Open `index.html` to see all plans.

## Features

- **Index page**: Hub with all roadmaps and doc links; **search** filters by roadmap name and doc titles.
- **Shared assets**: `assets/docs.css` and `assets/docs.js` provide layout, scroll progress, TOC highlight, copy code, reveal answer, and scroll-reveal. Use the migrate script so existing docs use them.
- **Prev/Next**: Generator adds prev/next links per doc; data is in `roadmaps.json` and `roadmaps-data.js`.

## Adding a new roadmap

1. Create a folder (e.g. `my-plan`) and add `.html` doc files inside it.
2. From the project root run:
   ```bash
   node scripts/generate-roadmaps.js
   ```
3. The new folder will appear on the index automatically. No need to edit `index.html` by hand.

## Using shared assets (optional)

If you add full self-contained HTML docs (e.g. from Claude) and want them to use shared CSS/JS:

1. Run the migration script on one file or all docs:
   ```bash
   node scripts/migrate-doc-to-shared.js path/to/doc.html
   # or migrate all:
   node scripts/migrate-doc-to-shared.js
   ```
2. Use `--dry-run` to see what would change without writing:
   ```bash
   node scripts/migrate-doc-to-shared.js --dry-run
   ```
3. The script creates a `.bak` backup before overwriting. Docs that already link to `docs.css` are skipped.
4. Then run `node scripts/generate-roadmaps.js` to refresh the index data.
