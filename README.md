# Motion Boxing

Browser-based, webcam motion-controlled boxing game. No backend, no build step —
plain HTML/CSS/JS, pose detection via TensorFlow.js MoveNet (loaded from CDN).

## Run it

Browsers block camera access on `file://` pages, so serve the folder over HTTP:

```
python -m http.server 8080
```

Then open `http://localhost:8080` and click **Enable Camera & Start**.

(Any static server works — `npx serve`, VS Code Live Server, etc. `localhost` counts
as a secure context even without HTTPS.)

## How it works

- **`src/pose.js`** — requests the webcam (640x480, cheap on phones), loads the
  MoveNet (SINGLEPOSE_LIGHTNING) model with temporal smoothing enabled, applies a
  light EMA filter over keypoints (tames mobile-camera jitter), and runs a
  `requestAnimationFrame` loop that estimates the pose each frame and draws the
  skeleton overlay.
- **`src/punchDetector.js`** — tracks wrist position history over a short time
  window and fires a "punch" event when wrist speed AND total displacement
  (both normalized by shoulder width, so it works at any distance from the
  camera) exceed thresholds. Requiring displacement filters out camera-noise
  false positives. Per-wrist cooldown so one swing doesn't register twice.
- **`src/defense.js`** — detects blocking (both wrists raised above shoulders,
  boxing-guard style) and dodging (torso leaned off its usual center line).
- **`src/villain.js`** — pixel-art villain rendered to a canvas from hand-encoded
  sprite grids (idle / windup / punch / hurt frames), health, hit feedback, and
  an attack AI: every few seconds it telegraphs with a "!" warning and glowing
  windup, then strikes — block or dodge or lose health.
- **`src/game.js`** — wires pose → punch/defense detection → villain AI →
  two-way damage → win/lose state together.
- **`src/main.js`** — DOM bootstrapping, start/loading/win/lose screen wiring,
  camera permission error handling.

## Tuning punch detection

In `src/punchDetector.js`:

- `SPEED_THRESHOLD` — lower = more sensitive (easier to trigger, more false
  positives from casual movement). Raise if idle movement is registering hits.
- `COOLDOWN_MS` — minimum time between hits from the same wrist.
- `HISTORY_WINDOW_MS` — how far back speed is measured over; shorter reacts
  faster but is noisier.

## Not built yet (by design)

Multiple enemies, levels, punch classification (jab/hook/uppercut), an RPG
leveling system tied to real exercise reps, and online multiplayer are all
planned but intentionally out of scope for now.
