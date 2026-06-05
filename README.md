# KPSS Çalışma Paneli

Offline-first study tracker for the Turkish KPSS exam. Tracks per-topic mistakes
on practice tests, full mock exams (with automatic net calculation), spaced-repetition
review queues, and an analytics dashboard (charts, mastery scores, study streaks).

Data is stored **on the server** (a small Node API on the Raspberry Pi), one
JSON file per account.

## Login

The app requires login. Two options:

- **E-posta + şifre** — register with a name, email, password, and an exam
  profile (KPSS Lisans GY-GK or AGS · Okul Öncesi Öğretmenliği). Passwords are
  hashed server-side with Node's built-in `crypto.scrypt`.
- **Google ile giriş** — Google Sign-In (GIS). The browser obtains an ID token
  which the server verifies via Google's `tokeninfo` endpoint. First-time Google
  users pick their exam profile right after signing in.

Sessions are kept in an `HttpOnly` cookie (`kpss_sid`); accounts live in
`users.json` and sessions in `sessions.json` (both in the data dir). Each
account's exam profile drives the sections/topics shown across the app.

Set the Google OAuth Client ID via the `GOOGLE_CLIENT_ID` env var on the server
(the same value is configured in `src/auth.js` for the front-end button).

Use **Ayarlar → Dışa Aktar** to back up your data to JSON and **İçe Aktar** to
restore. Help / questions: **ankayca2121@gmail.com**.

## Tech stack

- Vanilla JS, split into ES modules and bundled with **Vite**
- **Chart.js** for the analytics charts
- **Server-side persistence**: a zero-dependency Node HTTP API (`server/`)
  storing per-user JSON, behind a small swappable `Store` interface
- **Vitest** for unit tests of the pure logic layer

## Getting started

```bash
npm install      # install dependencies
npm run server   # start the storage API on http://localhost:8090
npm run dev      # start the Vite dev server (proxies /api → :8090)
npm run build    # production build into dist/
npm run preview  # preview the production build
npm test         # run the unit tests
```

Run `npm run server` and `npm run dev` together during development. Locally the
API writes JSON files to `server/data/` (git-ignored); on the Pi it uses
`/var/lib/kpss-dashboard`.

## Project structure

```
index.html              Markup only (no inline styles or scripts)
server/
  server.js             Zero-dependency storage + auth API (per-account JSON on disk)
src/
  main.js               Bootstrap / init (auth gate + profile)
  config.js             Exam profiles (sections/topics), reasons, intervals
  auth.js               Login/register/Google sign-in + login screen UI
  store.js              Server API client (the only place coupled to storage)
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
- Storage is isolated in `store.js`, which speaks to the Node API in `server/`
  over `fetch`. The interface (`open / all / put / del / clear / getMeta /
  setMeta` + `setUser`) is unchanged, so swapping backends stays a one-file job.
- Each user studies for a different exam, so `config.js` holds a profile per
  user. `setActiveProfile()` (called once at boot) points `SECTIONS` /
  `SECTION_KEYS` at the active user's sections before anything renders.
- All untrusted input (server rows, imported JSON) passes through `data.js`
  normalizers, which drop or clamp invalid records.
