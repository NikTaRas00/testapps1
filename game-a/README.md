# VOIDRUNNER

A 3D arcade flyer that runs in the browser. One file, no dependencies, no build
step — the whole game (renderer, shaders, physics, audio) lives in
[`index.html`](index.html).

![gameplay](https://img.shields.io/badge/WebGL-3D-6fe3ff) ![deps](https://img.shields.io/badge/dependencies-0-b07cff)

## Play it

**On GitHub Pages** — enable Pages once (repo *Settings → Pages → Source:
**GitHub Actions**), then the included workflow publishes on every push and the
game is live at:

```
https://<user>.github.io/<repo>/game-a/
```

**Locally** — just open `index.html`. It works straight off the filesystem, no
server required. If you'd rather serve it:

```bash
npx http-server . -p 8080     # then visit http://localhost:8080/game-a/
```

## How to play

Fly a hovercraft down a neon canyon that keeps getting faster.

| Action | Keyboard | Touch |
| --- | --- | --- |
| Steer | <kbd>A</kbd>/<kbd>D</kbd> or <kbd>←</kbd>/<kbd>→</kbd> | drag left/right |
| Climb & dive | <kbd>W</kbd>/<kbd>S</kbd> or <kbd>↑</kbd>/<kbd>↓</kbd> | drag up/down |
| Boost | <kbd>Space</kbd> / <kbd>Shift</kbd> | **BOOST** button |
| Pause | <kbd>P</kbd> / <kbd>Esc</kbd> | PAUSE |
| Mute | <kbd>M</kbd> | SOUND |

- **Pillars and bars** cost you a hull segment. Three hits ends the run.
- **Amber shards** top up boost and raise your multiplier.
- **Cyan rings** are worth 180 × multiplier if you fly clean through the middle.
- The multiplier climbs to ×9 and decays after six seconds without a pickup, so
  chaining shards and rings is worth far more than surviving quietly.
- Best score is kept in `localStorage`.

Obstacles come in six flavours — pillar clusters, low walls to climb, ceiling
slabs to duck, gap walls, slaloms, and a rotating bar you have to time.

## How it works

No engine, no libraries. Everything is hand-rolled:

- **Renderer** — raw WebGL. Prefers WebGL2 and falls back to WebGL1 +
  `ANGLE_instanced_arrays`; the shaders are GLSL ES 1.00 so one set works on both.
- **Instancing** — every obstacle, shard, ship part and particle of a given
  shape is drawn in a single instanced call. Each instance carries position,
  half-extents, Euler rotation, colour, emissive mix and alpha (14 floats), and
  the vertex shader builds the model matrix, so the whole frame is ~8 draw calls.
- **Geometry** — box, cylinder, cone, torus and octahedron are generated at
  load. All primitives are built at half-extent 1, so an instance's scale *is*
  its half-size, which makes collision a plain AABB test (rotated into local
  space for the spinning bar).
- **Track** — floor and canyon walls are one unit quad expanded in the vertex
  shader; the grid, pace markers and travelling energy pulse are procedural in
  the fragment shader, with distance-scaled line widths to stop the grid
  aliasing into moiré.
- **Sky** — gradient, hash-based parallax starfield and two soft nebulae, all in
  a fullscreen fragment shader. Fog colour matches the horizon so the canyon
  dissolves into the sky instead of ending at a visible edge.
- **World** — procedurally generated ahead of the ship and culled behind it, so
  memory stays flat no matter how far you get. Pillar lanes are picked
  non-adjacently, which guarantees a flyable gap always exists.
- **Audio** — a small Web Audio synth: a filtered saw + sub for the engine
  (pitch and cutoff track your speed), a band-passed noise bed for wind, and
  generated one-shots. Created lazily on first interaction to respect autoplay
  policy.
- **Frame-rate independence** — all smoothing uses an exponential
  `1 - exp(-rate·dt)` approach rather than a fixed lerp factor, and `dt` is
  clamped, so behaviour is identical at 30, 60 or 144 Hz.

Rendering scales to the device pixel ratio (capped at 2×), pauses on tab blur,
and the HUD is laid out for both desktop and phone.
