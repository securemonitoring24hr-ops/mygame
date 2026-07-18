# The Last Gym

*(Formerly "Zombie Brawl" — now evolving into a zombie-survival fitness game
per `PLAN.md`. This README describes the current build: Phase 2 of that plan.)*

Browser-based, webcam motion-controlled boxing game. No backend, no build step —
plain HTML/CSS/JS, everything loaded from CDN as ES modules:

- **Pose tracking**: MediaPipe Tasks Vision, `PoseLandmarker` (BlazePose). Chosen
  over the previous MoveNet setup specifically because it emits real 3D
  `worldLandmarks` (x/y/z in meters), which is what makes distinguishing a jab
  from a hook from an uppercut actually possible — 2D-only tracking can't do that.
- **Zombie rendering**: Three.js. The zombie is a procedurally rigged (plain
  `Object3D` hierarchy, no GLTF) and procedurally animated (sine-wave shamble,
  eased attack/hurt/death poses — no baked animation clips) low-poly character
  drawn on a transparent canvas layered over the webcam feed.

## Run it

Browsers block camera access on `file://` pages, so serve the folder over HTTP:

```
python -m http.server 8080
```

Then open `http://localhost:8080` and click **Enable Camera & Start**.

(Any static server works — `npx serve`, VS Code Live Server, etc. `localhost` counts
as a secure context even without HTTPS. On a phone, HTTPS — e.g. GitHub Pages — is
required.)

## How it works

- **`src/pose.js`** — requests the webcam (640x480, cheap on phones), loads the
  MediaPipe `PoseLandmarker` (BlazePose "lite" model, GPU delegate with CPU
  fallback), and runs a `requestAnimationFrame` loop that emits both 2D screen
  keypoints (for the skeleton overlay, EMA-smoothed to tame camera jitter) and 3D
  world keypoints (for classification).
- **`src/bodyFrame.js`** — from 3D world landmarks, builds a per-frame body-local
  coordinate frame (up / right / forward unit vectors, self-correcting sign via
  nose position) so punch and guard direction are judged relative to the
  player's own torso orientation, not raw camera axes. Shared by the punch
  classifier and the defense detector.
- **`src/punchClassifier.js`** — detects a punch (3D wrist speed + displacement
  past a threshold, normalized by shoulder width, per-wrist cooldown) and then
  classifies its **type** by decomposing the wrist's motion onto the body-local
  axes: dominant vertical+upward → uppercut; dominant lateral with the elbow
  staying bent → hook; otherwise → straight (jab/cross). This is a geometry-based
  heuristic, not a trained ML classifier, but it's judging actual punch shape
  instead of "any fast wrist movement counts."
- **`src/defense.js`** — guarding: both wrists at/above shoulder height along the
  body's own up-axis (works even if the phone/torso is tilted). Dodging: shoulders
  shifted sideways from their resting screen position.
- **`src/scene.js`** — the 3D arena: one fullscreen Three.js renderer, a night
  graveyard assembled from Kenney's CC0 Graveyard Kit (fence line, gravestones,
  crypts, pines in fog), moonlight + the gym's floodlight. The webcam feed is a
  PiP "form-check mirror" in the corner, not the background.
- **`src/actors.js`** — glTF loading + the AnimatedActor pattern: base looping
  clip (Idle/Walk) with one-shot overlays (Punch/HitReact) that crossfade back
  automatically. Both characters below build on it.
- **`src/survivor.js`** — the player's avatar (Quaternius survivor, CC0),
  standing at the barricade mirroring the player: Punch clips when you punch,
  a crouched Duck guard when your fists are up, sidesteps when you dodge,
  HitReact/Death/Wave as the fight goes.
- **`src/zombieActor.js`** — the zombie (Quaternius Zombie_Basic, CC0): Walk
  shamble at the broken fence, Idle_Attack windup as the telegraph, Punch with
  a physical lunge toward the survivor on strike, HitReact on damage, Death
  clip on defeat. Same attack state machine and gameplay contract as before.
- **`src/game.js`** — wires pose → punch classification / defense detection →
  zombie AI → two-way damage → win/lose state together. Punch type affects
  damage (uppercut > hook > straight, rewarding harder-to-land shots).
- **`src/main.js`** — DOM bootstrapping, start/loading/win/lose screen wiring,
  camera permission error handling.

## Tuning punch detection

In `src/punchClassifier.js`:

- `SPEED_THRESHOLD` / `MIN_DISPLACEMENT` — how fast and how far (in shoulder-widths)
  a wrist has to move to register as a punch at all.
- `COOLDOWN_MS` — minimum time between hits from the same wrist.
- `_classify()` — the axis-dominance thresholds that decide straight vs. hook vs.
  uppercut; the `0.5` radian elbow-extension check is what keeps a hook from
  being misread as a weak straight punch.

## Swapping in real 3D assets

`src/zombie.js` currently builds the character procedurally from boxes — no
external files. If you generate a rigged, animated zombie model (GLB/GLTF, with
walk/attack/hurt/death clips) or a 3D environment, they can replace the rig
construction and animation blending in that file; the state machine, damage,
and strike-timing contract (`activate/deactivate/update/takeDamage/reset`) that
`game.js` depends on would stay the same.

## Not built yet (by design)

Multiple zombies, levels, an RPG leveling system tied to real exercise reps,
and online multiplayer are all planned but intentionally out of scope for now.
