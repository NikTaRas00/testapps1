# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Single-file PWA calculator (`index.html`) with no build tooling, no npm, no framework. All CSS and JS are inlined so the file works standalone (important for the Claude Preview panel, which can't serve sibling files). The manifest, service worker, and icons are separate files for PWA compliance.

## Local development

```bash
python -m http.server 8000   # or: npx serve .
```

Open http://localhost:8000. Service workers and the PWA manifest work on `localhost` without HTTPS. There are no build steps, linters, or test suites — edit `index.html` and reload.

## Architecture

Everything lives in `index.html` in three sections:

**CSS (`<style>`)** — CSS custom properties drive all five themes (`[data-theme="midnight"]` etc.). The animated gradient background is two `::before`/`::after` pseudo-elements plus a `.blob` div, all animated with `@keyframes float-*`. Glass effect on surfaces uses `backdrop-filter: blur(20px) saturate(180%)`. Layout is a flex column (`100dvh`) with `env(safe-area-inset-*)` padding for iPhone notch/home-indicator.

**HTML** — Minimal skeleton. Keypads, the convert panel, and the graph canvas are all rendered by JS into `#keypad-wrap`. The history and settings drawers are static HTML shown/hidden via `.open` CSS class + a backdrop overlay.

**JS (`<script>`)** — One IIFE, no modules. Key sections:

- **Expression evaluator** (`tokenize` → `evaluate`): recursive-descent parser supporting implicit multiplication (`2pi`, `2(3+4)`), postfix `!`/`%`, right-associative `^`, and named functions/constants. `liveEval` wraps it with graceful failure (auto-closes parens, trims trailing operators) for the live-preview result shown while typing.
- **State object** — single `state` literal persisted to `localStorage` via `persistState()`. Includes mode, expr, ans, memory, theme, angle mode, precision, and all convert/graph preferences.
- **`renderKeypad()`** — tears down `#keypad-wrap` and rebuilds it for the current mode. Called on every mode switch. The convert panel and graph canvas are built entirely here.
- **Mode handlers** — `handleKey()` for Basic/Sci, `handleProgKey()` for Programmer (uses `BigInt` throughout for exact arithmetic). Convert keys are wired inline in `renderConvert()`. Graph draws to `<canvas>` via `drawGraph()`.
- **Drawers** — history and settings slide in from the right; controlled by `openDrawer()` / `closeDrawers()` toggling `.open` on the drawer and `.drawer-backdrop`.

## Key constraints

- **Single file** — inline all CSS/JS changes into `index.html`. Do not re-introduce external `styles.css` or `app.js`; they were deleted because the Claude Preview panel can't load them.
- **No dependencies** — no npm, no CDN imports, no build step.
- **Service worker cache version** — bump `CACHE = 'calc-vN'` in `service-worker.js` whenever `index.html` changes, so installed PWAs get the update.
- **Icons** — the actual icon PNGs have spaces in their names (`icon-192 (1).png`). If renaming them, update `manifest.webmanifest` and `service-worker.js` ASSETS list to match.
- **BigInt serialisation** — `state.progValue` is a `BigInt` and intentionally excluded from `persistState()` because `JSON.stringify` does not handle `BigInt`.
- **`%` operator** — always means postfix `/100` in the expression parser. It does NOT implement iOS-style contextual percent (e.g. `100+10%` evaluates to `100.1`, not `110`).
