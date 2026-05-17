# Calc — installable iPhone calculator (PWA)

A single-file Progressive Web App calculator. Drop the folder on any HTTPS host, open it in Safari on iPhone, **Share → Add to Home Screen**, and it installs as a fullscreen offline app.

It's intentionally bigger than the iOS Calculator app:

| | Calc | iOS Calculator |
|---|---|---|
| **Basic** with live expression evaluation as you type | yes | no |
| **Scientific** (sin/cos/tan, log, ln, √, ∛, x², x³, xʸ, !, π, e, asinh/acosh/...) | yes | yes |
| **Programmer** with HEX/DEC/OCT/BIN simultaneous display + bitwise ops (AND, OR, XOR, NOT, <<, >>, MOD) | yes | yes |
| **Convert** — length, mass, temperature, time, volume, area, speed, data, angle | yes (offline) | needs network |
| **Graph** — plot y = f(x) with pan/zoom | yes | no |
| Persistent history with tap-to-reuse | yes | partial |
| Memory (via `ans` & `mem` in expressions) | yes | yes |
| 5 themes (Midnight, Aurora, Sunset, Forest, Mono) with animated gradient backgrounds | yes | no |
| Haptic feedback on key press | yes | yes |
| Keyboard shortcuts on desktop | yes | n/a |
| Swipe-left on display to delete a character | yes | yes |
| Long-press display to copy result to clipboard | yes | partial |
| Adjustable angle mode (RAD/DEG) & precision (6/10/12 sig figs) | yes | yes |
| Works fully offline once installed | yes | yes |

## Files
```
index.html               # the entire app (CSS + JS inlined)
manifest.webmanifest     # PWA manifest
service-worker.js        # offline cache
icons/
  icon-192.png
  icon-512.png
  apple-touch-icon.png   # 180x180, required by iOS
tools/generate-icons.html  # one-time icon exporter (not deployed)
```

## One-time setup: generate icons

1. Open `tools/generate-icons.html` in any browser (double-click works).
2. Click each **Download** button.
3. Put the three downloaded files into an `icons/` folder next to `index.html`.

If you have your own art, just drop three PNGs named `icon-192.png`, `icon-512.png`, and `apple-touch-icon.png` (180×180) into `icons/`.

## Test locally

```bash
# Python
python -m http.server 8000

# or Node
npx serve .
```

Open <http://localhost:8000>. Service workers and the manifest also work on `localhost` without HTTPS.

## Deploy (any static HTTPS host)

iOS Safari requires **HTTPS** for service workers and a polished Add-to-Home-Screen install. Pick any of these:

- **GitHub Pages**: push to a repo, enable Pages on `main` / root.
- **Netlify** / **Vercel** / **Cloudflare Pages**: drag-and-drop the folder.
- **Any web host**: upload the files.

## Install on iPhone

1. Open the deployed URL in **Safari** (iOS Chrome can't install PWAs the same way).
2. Tap the **Share** button (square with the up arrow).
3. Scroll down → **Add to Home Screen**.
4. Confirm. The icon appears on the home screen.
5. Tap it — launches fullscreen, no Safari chrome, fully offline.

## Keyboard shortcuts (desktop)

- Digits `0`–`9`, `.` for decimal
- `+`, `-`, `*`, `/`, `^` for operators
- `(`, `)`, `!`, `%`
- Letters type into the expression — useful for `sin`, `log`, `sqrt`, `pi`, `ans`, etc.
- `Enter` or `=` for equals
- `Backspace` to delete last character
- `Esc` for AC

## Expression syntax (Basic / Sci mode)

The live expression box accepts:

- Operators: `+ - * / ^ !` (factorial postfix) and `%` (postfix divide-by-100)
- Parentheses, with **implicit multiplication**: `2pi`, `2(3+4)`, `(1+2)(3+4)`
- Constants: `pi`, `π`, `e`, `tau`, `phi`, `ans` (previous result), `mem`
- Functions: `sin cos tan asin acos atan sinh cosh tanh asinh acosh atanh log log2 log10 ln sqrt cbrt abs sign floor ceil round exp fact min max mod pow gcd lcm rand hypot`
- Scientific notation: `1e5`, `2.3e-4`
- Auto-completes dangling parens for the live preview (the result shown while typing)

## Convert mode

- Switch category at the top (Length, Mass, Temp, Time, Vol, Area, Speed, Data, Angle).
- Tap the unit pill on either side to pick a different unit.
- Type into the "from" field via the embedded keypad; "to" updates live.
- Tap **Copy result** to copy the converted value.
- Tap the round arrow between the rows to swap units.

## Programmer mode

- Tap the small **HEX / DEC / OCT / BIN** chips in the badge row to switch base.
- The display shows the current number in all four bases simultaneously.
- Bitwise ops: AND, OR, XOR, NOT, `<<`, `>>`, MOD (`%`).
- 64-bit two's complement representation.

## Graph mode

- Type any expression in `x`, e.g. `sin(x)`, `x^2 - 4x + 3`, `1/x`, `exp(-x^2)`.
- Drag to pan, scroll wheel or pinch to zoom, **+/−** buttons in the corner zoom in/out, **⟲** resets the view.
- Pick an example expression from the chips below the canvas.
