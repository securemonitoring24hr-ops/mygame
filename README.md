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

- **`src/pose.js`** — requests the webcam, loads the MoveNet (SINGLEPOSE_LIGHTNING)
  model, and runs a `requestAnimationFrame` loop that estimates the player's pose
  each frame and draws the skeleton overlay.
- **`src/punchDetector.js`** — tracks wrist position history over a short time
  window and fires a "punch" event when wrist speed (normalized by shoulder width,
  so it works at any distance from the camera) exceeds a threshold. No jab/hook/
  uppercut classification yet — any fast wrist movement counts as a hit, with a
  per-wrist cooldown so one swing doesn't register multiple times.
- **`src/enemy.js`** — health, damage-per-hit, and the DOM/CSS hit feedback
  (shake, flash, "HIT!" popup, death state).
- **`src/game.js`** — wires pose → punch detection → enemy damage → win state
  together. This is the seam for future features.
- **`src/main.js`** — DOM bootstrapping, start/loading/win screen wiring, camera
  permission error handling.

## Tuning punch detection

In `src/punchDetector.js`:

- `SPEED_THRESHOLD` — lower = more sensitive (easier to trigger, more false
  positives from casual movement). Raise if idle movement is registering hits.
- `COOLDOWN_MS` — minimum time between hits from the same wrist.
- `HISTORY_WINDOW_MS` — how far back speed is measured over; shorter reacts
  faster but is noisier.

## Not built yet (by design — this is the MVP)

Multiple enemies, levels, punch classification (jab/hook/uppercut), an RPG
leveling system tied to real exercise reps, and online multiplayer are all
planned but intentionally out of scope for this first version.
