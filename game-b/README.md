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

On a phone or tablet the game switches to touch controls automatically: a virtual
stick appears wherever you press on the left half (push it to the edge to sprint),
drag anywhere on the right half to look around, and the buttons handle **BRAKE** /
handbrake, **GET IN / GET OUT** and **REWIND**. The scene is also lightened a little
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

You get six loops. Fail and the echoes keep repeating your mistakes forever.

## Under the hood

Everything is generated at runtime — no models, no textures, no audio files.

- `world.js` — procedural city. The street network (asphalt, kerbs, lane dashes, crosswalks) is
  painted into one 2048² canvas texture. Buildings are boxes whose UVs are scaled to their real
  dimensions, so window rows never stretch, then merged into a **single draw call** for the
  whole skyline. Colliders go into a uniform grid for broad-phase lookup.
- `actors.js` — arcade car physics (longitudinal/lateral velocity split, so you can drift on the
  handbrake), plus box-built cars and people, traffic that navigates the road grid, pedestrians
  that flinch out of the way, and police that bias onto the street grid when pursuing from far off.
- `game.js` — the loop machinery. Player state is recorded at 20 Hz into a ring of frames; each
  finished run becomes an `Echo` that resamples and interpolates those frames on the next loop's
  clock. Relays, the vault, the wanted level, arrest meter, minimap and timeline all live here.
- `audio.js` — Web Audio synthesis. The engine is three detuned oscillators through a moving
  lowpass driven by speed; sirens, tyre scrub, crashes and the rewind sweep are all generated.

The city uses a fixed seed, so it's the same every session — which is the whole point. Your
echoes can only be trusted if the world is.

Add `#debug` to the URL to expose the game state on `window.__echo`.
