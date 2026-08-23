# ECHO CITY

A GTA-shaped open-world heist game in the browser, built with **Three.js** — with one twist.

You have a city, a car, cops, a wanted level and a bank vault. What you don't have is a crew.
The vault under Nakamura Tower needs **four people**: three standing on relay plates spread
across the city, and one at the door when it opens.

So you use the only crew available. Yourself, four times over.

Every loop lasts **eighty seconds**. When it ends the city snaps back exactly as it was — same
traffic, same pedestrians, same parked cars — but your last run doesn't reset. It walks back out
onto the street as a **solid cyan echo**, repeating every step, every turn, every mistake you made,
on exactly the same clock. Do it again and there are two of them. Then three.

Then the plates go live at the same moment, and the vault opens.

The cops chase the echoes too. So does the alarm.

---

## Play

It's an ES-module project, so it needs to be served over HTTP (opening `index.html` from the
file system will not work — browsers block module imports on `file://`).

```bash
cd game-b
python3 -m http.server 8000
# then open http://localhost:8000/
```

Any static host works too. Three.js is vendored in `vendor/`, so there is nothing to install
and no network access required at runtime.

**Deploying to Vercel:** the included `vercel.json` is only read when the Vercel project's
Root Directory is set to `game-b`. If instead you deploy the whole repo, the game lives at
`/game-b/` and that config file is ignored — which is fine, everything still works.

## Controls

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` | move on foot / drive |
| Mouse | look around (click to lock the pointer) |
| `Shift` | sprint on foot / handbrake in a car |
| `Space` | brake |
| `F` | get in / out of the nearest car |
| `R` | rewind the loop early |
| `Esc` | pause |
| `M` | mute |
| `I` | invert vertical look |

On a phone or tablet the game switches to touch controls automatically: a virtual
stick appears wherever you press on the left half (push it to the edge to sprint),
drag anywhere on the right half to look around, and the buttons handle **BRAKE** /
handbrake, **GET IN / GET OUT**, **REWIND** and pause.

Dragging up looks up. If you want it the other way, the **Invert look** toggle on the
title and pause screens flips it, and the choice is remembered on that device. The scene is also lightened a little
and the camera widens for portrait framing.

## How the job works

1. **Take a car.** One is always parked at the van where you start. Any other car on the street
   works too — but pulling a driver out gets you a star straight away.
2. **Stand in a relay ring** (there are three, scattered around the plaza). You have to be *on
   foot* inside the ring — park, get out, stand on it. Standing on the first one trips the
   silent alarm.
3. **Rewind** with `R`, or run the clock out. That run becomes an echo.
4. Repeat until three echoes are covering all three relays *at the same moment on the clock*.
   The **echo timeline** panel on the left shows exactly when each relay is covered, with a
   playhead for the current second — read it, and fill the gaps.
5. When all three are live, be standing at the vault. It cracks in about a second and a half.
6. **Take the case, get it to the van.** Five stars will be on you by then.

The map is about 1.3km across and each loop is 115 seconds, so routing between the three
relays is most of the puzzle. You get six loops. Fail and the echoes keep repeating your mistakes forever.

## Under the hood

Everything is generated at runtime — no models, no textures, no audio files.

- `world.js` — a 1.3km procedural city. Nothing is baked into one giant ground texture: at city
  scale that gives ~3 pixels per metre and reads as mush. Instead the tarmac, pavement and grass
  use **tiling detail textures** (8m asphalt tile at 512px = 64 px/m), kerbs are real raised
  geometry, and every road marking is a painted quad sitting on the surface. A daytime sky is
  drawn to an equirectangular canvas and run through `PMREMGenerator`, so it lights the scene and
  glass genuinely reflects it. Buildings carry a storefront band at street level and UV-scaled
  facades above. Static geometry is merged per material **and per district chunk**, so both the
  camera and the shadow pass frustum-cull whole neighbourhoods.
- `actors.js` — arcade car physics (longitudinal/lateral velocity split, so you can drift on the
  handbrake). Cars are built by tapering box volumes into a real silhouette — raked greenhouse,
  bonnet and boot decks, arches, bumpers, separate tyres and rims. People are capsule-built with
  swinging feet. Plus traffic that navigates the road grid, pedestrians
  that flinch out of the way, and police that bias onto the street grid when pursuing from far off.
- `game.js` — the loop machinery. Player state is recorded at 20 Hz into a ring of frames; each
  finished run becomes an `Echo` that resamples and interpolates those frames on the next loop's
  clock. Relays, the vault, the wanted level, arrest meter, minimap and timeline all live here.
- `audio.js` — Web Audio synthesis. The engine is three detuned oscillators through a moving
  lowpass driven by speed; sirens, tyre scrub, crashes and the rewind sweep are all generated.

The city uses a fixed seed, so it's the same every session — which is the whole point. Your
echoes can only be trusted if the world is.

Add `#debug` to the URL to expose the game state on `window.__echo`.
