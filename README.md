# KPSS Çalışma Paneli

Offline-first study tracker for the Turkish KPSS exam. Tracks per-topic mistakes
on practice tests, full mock exams (with automatic net calculation), spaced-repetition
review queues, and an analytics dashboard (charts, mastery scores, study streaks).

All data lives locally in the browser (**IndexedDB**) — nothing is sent to a server.
Use **Ayarlar → Dışa Aktar** to back up to JSON and **İçe Aktar** to restore.

## Tech stack

- Vanilla JS, split into ES modules and bundled with **Vite**
- **Chart.js** for the analytics charts
- **IndexedDB** for persistence (behind a small swappable `Store` interface)
- **Vitest** for unit tests of the pure logic layer

## Getting started

```bash
npm install      # install dependencies
npm run dev      # start the Vite dev server (http://localhost:5173)
npm run build    # production build into dist/
npm run preview  # preview the production build
npm test         # run the unit tests
```

## Project structure

```
index.html              Markup only (no inline styles or scripts)
src/
  main.js               Bootstrap / init
  config.js             Static config: sections, topics, reasons, intervals
  store.js              IndexedDB layer (the only place coupled to storage)
  data.js               Defensive normalization for DB rows & imported JSON
  state.js              In-memory cache (DB), hydrate, persist, legacy migration
  domain.js             Pure domain logic (mastery, streaks, net, tagging)
  utils.js              DOM/date/escaping/toast helpers
  tagGame.js            "Hızlı etiket" reason-tagging mini-game
  nav.js                Page navigation + responsive sidebar
  theme.js              Dark / light theme
  actions.js            Central event wiring (replaces inline on* handlers)
  refresh.js            Cross-feature render orchestration
  features/
    books.js            Konu Testleri (books + wrong-answer sessions)
    trials.js           Genel Denemeler (mock exams + net calculator)
    reviews.js          Tekrar Kuyruğu (spaced repetition)
    analytics.js        Analiz Paneli (charts, mastery, pace, heatmap)
    settings.js         Ayarlar (exam date, target, export/import, reset)
  styles.css            All styles
test/
  logic.test.js         Unit tests for the pure logic layer
```

## Architecture notes

- The render layer is synchronous and reads from the in-memory `DB` cache.
  Every write goes through `Store` first, then updates the cache, so a failed
  write surfaces an error toast without corrupting the in-memory state.
- Storage is isolated in `store.js`. Moving to a cloud backend only requires
  re-implementing its `open / all / put / del / clear / getMeta / setMeta` API.
- All untrusted input (IndexedDB rows, imported JSON) passes through `data.js`
  normalizers, which drop or clamp invalid records.
