# skill-up-docs-26

Personal learning dashboard + roadmap docs (static, GitHub Pages friendly).

## What Changed In V2

- Dashboard-style `index.html` with:
  - Hero metrics
  - Continue Learning cards
  - Track Overview with filters
  - Today Queue and Recent Activity
  - Command palette (`Ctrl/Cmd + K`)
- Schema v2 roadmap generation (`roadmaps.json`, `roadmaps-data.js`)
- Optional doc metadata contract:
  - `<!-- DOC_META: {"track":"DSA","day":1,"tags":["arrays"],"estimatedMinutes":180} -->`
- Local intelligence keys:
  - `skillup.eventLog`
  - `skillup.docState.<docId>`
  - `skillup.trackState.<trackId>`
- Daily automation scripts:
  - Claude import
  - migrate + generate + validate pipeline
- CI and GitHub Pages deployment workflow

## Project Scripts

```bash
npm run generate   # regenerate roadmaps.json + roadmaps-data.js
npm run validate   # check broken links, duplicate docIds, prev/next integrity
npm run refresh    # migrate docs -> generate -> validate
npm run test       # lightweight generator/data tests
```

## Claude Daily Workflow

1. Import raw Claude HTML into a track folder:

```bash
node scripts/import-claude-doc.js --input ./raw/day3.html --track DSA --day 3 --tags arrays,hashing --estimatedMinutes 180
```

2. Run full refresh:

```bash
npm run refresh
```

3. Open `index.html` (or push to `main` for GitHub Pages deploy).

## Metadata Notes

- Metadata is optional.
- Missing metadata falls back to inferred defaults:
  - `dayNumber` from filename (`day-<n>-*.html`)
  - `status: "todo"`
  - `estimatedMinutes: 90`
  - `difficulty: "medium"`

## GitHub Pages

- Workflow: `.github/workflows/pages.yml`
- Trigger: push to `main`
- Pipeline: generate -> validate -> test -> deploy
