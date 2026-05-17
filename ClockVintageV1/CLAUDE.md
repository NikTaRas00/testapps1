# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

No build step, no dependencies. Serve with any static file server — the service worker requires HTTP, not `file://`:

```powershell
python -m http.server 8080
# open http://localhost:8080
```

## Architecture

Single-file PWA. All CSS, JS, and HTML live in `index.html`. Supporting files:

- `manifest.webmanifest` — PWA install metadata
- `service-worker.js` — cache-first offline strategy; caches `index.html`, `cities.json`, manifest, and icons
- `cities.json` — 530-city dataset `[name, country, IANA_tz, lat, lon]`; **also embedded inline** in `index.html` as `<script type="application/json" id="cities-data">` so it works without a server
- `icons/` — PNG icons generated via `tools/generate-icons.html` (canvas → download)

## State model

All state lives in `localStorage`, hydrated on boot by `load()`, written via `persist(key)`:

| Key | Contents |
|---|---|
| `clock.settings` | `{ use24h, activeTab }` |
| `clock.world` | `[{ id, name, country, tz, lat, lon, order }]` |
| `clock.alarms` | `[{ id, label, time, days, enabled, snoozeMin, vibration, snoozedUntil, lastFired }]` |
| `clock.timers` | `[{ id, label, durationMs, endsAt, remainingAtPauseMs, running, finished }]` |
| `clock.stopwatch` | `{ startedAt, accumulatedMs, running, laps }` |

Timer remaining time is always derived from `endsAt - Date.now()` (never decremented), so it survives tab backgrounding.

## Render loop

- **rAF loop** (`tick()`): updates analog clock hands and digital readout at 60 fps; paused on `visibilitychange` hidden
- **1 Hz `setInterval`**: runs `alarmTick()` and `timerTick()` — continues while tab is backgrounded

## Key functions

- `makeCityCard(city)` / `makeAlarmCard(alarm)` / `makeTimerCard(t)` — each returns a `.swipe-wrap` wrapper (not the card itself) after calling `attachSwipeDelete(card, onDelete)`
- `attachSwipeDelete(card, onDelete)` — wraps card in `.swipe-wrap` with a red bg; handles horizontal touch/mouse swipe; bg starts at `opacity:0` and fades in proportional to swipe distance; animates card off-screen then collapses height before calling `onDelete`
- `attachDragReorder(card)` — world clock drag-to-reorder; operates on `card.parentElement` (`.swipe-wrap`) within `#world-list`
- `sunriseSunsetUTC(date, lat, lng)` — NOAA solar position algorithm
- `moonPhase(date)` — synodic-month formula, returns 0–1 mapped to 8 glyphs
- `playChime({ fadeInS, peakGain })` — Web Audio: two triangle oscillators (660+880 Hz) with LFO tremolo and linear gain ramp
- `nextUntitled(existingLabels)` — returns "Untitled", "Untitled 1", "Untitled 2"… for auto-naming alarms/timers when no label is entered
- `loadCities()` — reads synchronously from `#cities-data` DOM element; returns `Promise.resolve(cache)`

## Palette

`--bg-deep:#0b0a14` · `--gold:#e8c587` · `--gold-deep:#c9a35a` · `--accent:#f4b860` · `--danger:#ef6b6b` · `--good:#7ed3a1` · `--red:#e25b4a` · `--surface:rgba(255,255,255,0.05)` · `--text:#f5efe0`

## Gotchas

- Card backgrounds are `rgba(255,255,255,0.05)` (nearly transparent) — any absolutely-positioned element behind a card must start at `opacity:0` or it bleeds through.
- All `make*Card()` functions return the `.swipe-wrap` wrapper, not the inner card. `querySelector` on the wrapper still finds card children.
- `attachDragReorder` expects `card.parentElement` = `.swipe-wrap` and `card.parentElement.parentElement` = `#world-list`.
- `.alarm-card` must have `position:relative` so the absolutely-positioned swipe bg doesn't render above it.
- Timer creation uses `<input type="time" step="1">` (native H:M:S picker). Parse with `val.split(':').map(Number)`.
- Alarm/timer saving with empty label calls `nextUntitled(Store.*.map(x => x.label))` — no validation block.
