# Handoff Spec: Calc PWA

## Overview

A single-file Progressive Web App calculator targeting iPhone Safari via Add-to-Home-Screen install. Launches fullscreen (no browser chrome), works fully offline, and covers five modes: Basic, Scientific, Programmer, Convert, Graph. The entire app — CSS, JS, and HTML — lives in `index.html`. No build tooling.

---

## Design Tokens

All tokens are CSS custom properties on `:root` / `[data-theme]`. Theming is done by swapping `data-theme` on `<html>`.

### Shared structural tokens (all themes)

| Token | Role |
|---|---|
| `--surface` | Glass card background (low) |
| `--surface-2` | Glass card background (mid) |
| `--surface-strong` | Glass card background (pressed / active) |
| `--border` | Glass card border |
| `--border-strong` | Active-state border |
| `--text` | Primary text |
| `--text-dim` | Secondary text (~62% opacity) |
| `--text-faint` | Tertiary text / labels (~36% opacity) |
| `--accent` | Caret, active badges, live-result highlight |
| `--accent-2` | Secondary highlight |
| `--op` | Operator key background |
| `--op-text` | Operator key text |
| `--equals` | Equals key background |
| `--equals-text` | Equals key text |
| `--danger` | AC key text, error state text |
| `--good` | Success state (reserved) |
| `--shadow` | `0 10px 40px rgba(0,0,0,0.45)` — modal / drawer shadow |
| `--shadow-soft` | `0 4px 20px rgba(0,0,0,0.25)` — card shadow |
| `--blob-a/b/c` | Animated background blob colors |

### Theme values

| Token | Midnight (default) | Aurora | Sunset | Mono | Forest |
|---|---|---|---|---|---|
| `--bg-1` | `#07071a` | `#0a0418` | `#1a0410` | `#000` | `#04140c` |
| `--blob-a` | `#4f46e5` | `#a855f7` | `#f97316` | `#1a1a1a` | `#10b981` |
| `--blob-b` | `#06b6d4` | `#06b6d4` | `#f43f5e` | `#2a2a2a` | `#84cc16` |
| `--blob-c` | `#ec4899` | `#f472b6` | `#fbbf24` | `#1a1a1a` | `#06b6d4` |
| `--accent` | `#818cf8` | `#c084fc` | `#fb923c` | `#fff` | `#34d399` |
| `--op` | `#f59e0b` | `#ec4899` | `#f43f5e` | `#fff` | `#14b8a6` |
| `--equals` | `#6366f1` | `#a855f7` | `#f97316` | `#fff` | `#10b981` |

---

## Layout

```
┌──────────────────────────────────┐  ← env(safe-area-inset-top) + 10px
│  [⏱]  [Basic|Sci|Prog|Conv|Graph]  [⚙]  │  topbar — flex row, gap 8px
├──────────────────────────────────┤
│  [badge] [badge]                 │
│                                  │
│                       1+2*3 |    │  ← expression — clamp(34px, 9vw, 56px), weight 300
│                       = 6        │  ← live result — 18px, weight 500, var(--text-dim)
├──────────────────────────────────┤
│  keypad (flex: 1, min-height: 0) │  ← fills remaining height
│  ...                             │
└──────────────────────────────────┘  ← env(safe-area-inset-bottom) + 12px
```

- **App container**: `max-width: 520px`, centered, `height: 100dvh`, `flex-direction: column`, `gap: 10px`, `padding: 10px 12px 12px` + safe-area insets on all sides.
- **Display panel**: `min-height: 110px`, `padding: 14px 16px 12px`, `border-radius: 22px`, glass surface.
- **Keypad wrap**: `flex: 1`, `min-height: 0` — absorbs all remaining vertical space. Content is rebuilt by JS on every mode switch.

---

## Typography

| Role | Size | Weight | Color |
|---|---|---|---|
| Expression | `clamp(34px, 9vw, 56px)` | 300 | `--text` |
| Live result | 18px | 500 | `--text-dim` |
| Key label (basic) | `clamp(18px, 5.5vw, 26px)` | 500 | `--text` |
| Key label (sci, small) | `clamp(13px, 3.5vw, 16px)` | 600 | `--text` |
| Key sub-label | 55% of parent em | 500 | `--text-faint` |
| Badge | 10px | 700 | varies |
| Mode tab | 13px | 600 | `--text-dim` / `--text` |
| History expression | 13px, monospace | — | `--text-dim` |
| History result | 22px | 600 | `--text` |

Font stack: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif`  
Feature settings: `"ss01", "cv11", "tnum"` (tabular numerals for the display)

---

## Components

### Glass surface

Shared pattern used on display, key, convert panel, graph panel, drawers, icon buttons:

```css
background: var(--surface);
border: 1px solid var(--border);
backdrop-filter: blur(20px) saturate(180%);
-webkit-backdrop-filter: blur(20px) saturate(180%);
```

Each key also has a `::before` shine overlay:
```css
background: linear-gradient(135deg, rgba(255,255,255,0.08), transparent 60%);
opacity: 0.7;
```

### Calculator key

| Variant | Background | Text | Border |
|---|---|---|---|
| Default digit | `--surface` | `--text` | `--border` |
| Function (fn) | `--surface-2` | `--text` | `--border` |
| Operator (op) | `--op` | `--op-text` | transparent |
| Equals | `--equals` | `--equals-text` | transparent |
| Danger (AC) | `--surface-2` | `--danger` | `--border` |
| Disabled (Prog) | same | `--text` @ 30% | same |

- **Border radius**: 18px (keys), 22px (panels, display)
- **Press animation**: `transform: scale(0.92)`, `background: --surface-strong` — `120ms cubic-bezier(0.34, 1.56, 0.64, 1)` (spring overshoot on release)
- **Active operator**: `outline: 2px solid var(--text); outline-offset: -3px` + `color-mix(in oklab, --op 80%, white 20%)`
- **Zero key**: `grid-column: span 2`, left-aligned text with `padding-left: 32px`, `aspect-ratio: auto`

### Mode switcher

Pill-shaped container (`border-radius: 14px`, `padding: 3px`, `gap: 2px`) holding five equal-width tabs. Active tab gets `--surface-strong` background + inset highlight box-shadow. Tab transition: `200ms ease` for color/background, `120ms ease` for scale on press.

### Top bar icon buttons

40×40px, `border-radius: 14px`. SVG icons 20×20px, stroke-only, `stroke-width: 2`.

### Display badges

10px text, 700 weight, `padding: 2px 8px`, `border-radius: 8px`, all-caps. States:
- Default: `--surface-2` background, `--text-dim` text
- Active (mode indicator): `--accent` solid background, white text
- Memory: `rgba(245,158,11,0.18)` background, `--op` text, amber border

### Caret

2px wide, `height: 0.9em`, `background: --accent`. Blinks via `steps(2)` at 1s interval.

### Drawers (History + Settings)

- Slide in from right: `transform: translateX(100%)` → `translateX(0)`, `320ms cubic-bezier(0.32, 0.72, 0, 1)`.
- Width: `min(380px, 90vw)`.
- Backdrop: `rgba(0,0,0,0.55)` with `backdrop-filter: blur(4px)`, `opacity` fades `250ms ease`.
- Padding respects safe-area insets.
- `box-shadow: -20px 0 60px rgba(0,0,0,0.4)`.

### Toast

- Fixed, centered horizontally at `bottom: env(safe-area-inset-bottom) + 24px`.
- Pill shape: `border-radius: 999px`, `padding: 10px 18px`.
- Colors inverted from theme: `background: --text`, `color: --bg-1`.
- Enter: `translateY(0)` + `opacity 1`, `200ms ease`. Auto-dismiss after 1600ms.

### Unit picker (Convert mode)

- Full-screen overlay with `align-items: flex-end` (sheet slides up from bottom).
- Card: `border-radius: 22px 22px 16px 16px`, animates `slideUp` — `280ms cubic-bezier(0.32, 0.72, 0, 1)`.

---

## States and Interactions

| Element | Trigger | Behavior |
|---|---|---|
| Any key | Tap | `scale(0.92)` spring, `--surface-strong` bg, vibrate 8ms |
| Any key | Release | Springs back to `scale(1)` with overshoot |
| Operator key | Active (pending op) | White 2px outline, lightened bg via `color-mix` |
| Display | Long-press (500ms) | Copies current result to clipboard, toast "Copied", vibrate 20ms |
| Display | Swipe left | Deletes last character from expression, vibrate 10ms |
| Mode tab | Tap | Rebuilds keypad, transitions display visibility |
| Theme swatch | Tap | Swaps `data-theme` on `<html>`, updates `<meta theme-color>`, `400ms` bg transition |
| History item | Tap | Inserts result into expression |
| History item | Long-press (500ms) | Inserts full expression |
| Convert swap button | Tap | Swaps from/to units, rotates `180deg` on `:active` |
| Graph canvas | Drag | Pans viewport (pointer capture) |
| Graph canvas | Scroll wheel | Zooms centered on cursor |
| Graph canvas | Pinch (touch) | Zooms |

---

## Animations / Motion

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Key press | Tap down | `scale(0.92)` + bg darken | 120ms | `cubic-bezier(0.34, 1.56, 0.64, 1)` |
| Key release | Tap up | Springs to `scale(1)` | 120ms | same (overshoot built in) |
| Background blob A | Continuous | `translate(30vw, 20vh) scale(1.15)` | 28s | ease-in-out, alternate |
| Background blob B | Continuous | `translate(-20vw, -25vh) scale(0.9)` | 32s | ease-in-out, alternate |
| Background blob C | Continuous | `translate(-15vw, 25vh) rotate(60deg)` | 38s | ease-in-out, alternate |
| Blobs blur | — | `filter: blur(80px)`, opacity 0.55 | — | — |
| Drawer open | State change | `translateX(100%)` → `translateX(0)` | 320ms | `cubic-bezier(0.32, 0.72, 0, 1)` |
| Backdrop | State change | Opacity 0 → 1 | 250ms | ease |
| Unit picker sheet | Open | `slideUp` — `translateY(40px)` + fade | 280ms | `cubic-bezier(0.32, 0.72, 0, 1)` |
| Toast in | Show | `translateY(20px)` → `translateY(0)` + opacity | 200ms | ease |
| Theme switch | Swatch tap | Background-color on body | 400ms | ease |
| Caret blink | Continuous | Opacity 1 → 0 → 1 | 1s, `steps(2)` | — |
| Mode tab | Tap | Color + background | 200ms | ease |
| Convert swap | Tap | `rotate(180deg)` | 250ms | ease |

---

## Responsive Behavior

| Breakpoint | Changes |
|---|---|
| Default (mobile portrait) | Full layout as designed. Max-width 520px centered. |
| `max-height: 660px` (short screens / landscape) | Keys shrink to `clamp(16px, 4.5vw, 22px)`, gap drops to 6px, display min-height 80px, expression clamps to `clamp(28px, 8vw, 44px)` |
| `max-width: 360px` (small phones) | Mode tab font 11px, padding `7px 2px` |

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| Very long expression | `.expr-row` scrolls horizontally; left edge fades via `mask-image` gradient (`transparent 0 → opaque at 32px`) |
| Result overflows display width | `text-overflow: ellipsis`, `overflow: hidden` on `.result` |
| `÷ 0` | Parser returns `NaN`, display shows "Error" in `--danger`, haptic pattern `[10, 30, 10]` |
| `∞` result | Shows `∞` or `-∞` |
| Incomplete expression (live preview) | Parser auto-closes open parens and trims trailing operators; hides preview if still invalid |
| Number > 15 digits or < 1e-9 | Shown in scientific notation (`e` format) |
| Memory = 0 | Memory badge hidden |
| Graph with discontinuity (`tan`, `1/x`) | Detected by `|Δy| > 2 × (yMax - yMin)`; path restarted, no vertical line drawn |
| localStorage unavailable (private mode) | All persistence wrapped in try/catch; app still works, state resets on close |
| Background animation disabled | Blobs set to `animationPlayState: paused`, body bg falls back to solid `--bg-1` |
| iOS not installed as PWA | Install hint banner auto-shows after 1.5s delay; dismissed state stored in `localStorage` |
| Programmer mode, hex digit in non-hex base | Button `disabled`, `opacity: 0.3` |

---

## Accessibility

- `role="application"` on app root, `aria-label="Calculator"`.
- Mode switcher: `role="tablist"`, tabs have `role="tab"`.
- Display: `aria-live="polite"` (via history drawer) and explicit `aria-label` on icon buttons.
- Drawers: `aria-hidden="true"` when closed, `"false"` when open.
- Toast: `aria-live="polite"`.
- All interactive surfaces are `<button>` elements (no div-with-click).
- Focus visible on keyboard (browser default, not suppressed).
- Keyboard coverage: digits, operators, `(`, `)`, `!`, `%`, `^`, `Enter`/`=`, `Escape` (AC), `Backspace`, letters for function names.
- `user-scalable=no` in viewport — intentional for calculator UX; users can still zoom via accessibility settings.

---

## PWA / Platform

| Concern | Implementation |
|---|---|
| Standalone launch | `apple-mobile-web-app-capable: yes` + manifest `display: standalone` |
| Status bar | `black-translucent` — content renders under status bar, `safe-area-inset-top` adds padding |
| Home-screen icon (iOS) | `<link rel="apple-touch-icon">` at 180×180 — manifest icons alone don't work on iOS |
| Offline | Cache-first service worker (`calc-v2`); caches `index.html`, manifest, icons |
| SW update | Bump `CACHE = 'calc-vN'` in `service-worker.js` on every deploy |
| Theme color | `<meta name="theme-color">` updated programmatically per theme via `applyTheme()` |
| Notch / home indicator | `viewport-fit=cover` + `env(safe-area-inset-*)` padding on all sides |
