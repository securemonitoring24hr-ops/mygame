# PLAN — Zombie Survival Fitness Game (Phase 1)

*Status: awaiting approval. No implementation has been started.*

---

## 0. Where the project actually stands (correcting the brief)

The brief says the MVP uses TensorFlow.js MoveNet. That was true two iterations
ago; the current code (`src/pose.js`) uses **MediaPipe BlazePose** (PoseLandmarker,
"lite" model), which emits **3D world landmarks** per joint. This matters for this
plan: squat, jump, and dodge detection all need 3D or at least robust full-body
tracking, and BlazePose is the right foundation for that — the migration is already
done and will be preserved. Also already in place and reused going forward:

- `src/bodyFrame.js` — body-local coordinate frame (torso-relative up/right/forward)
- `src/punchClassifier.js` — jab/hook/uppercut classification from 3D wrist motion
- `src/defense.js` — guard + lateral-dodge detection
- A Three.js render loop layered over the webcam feed (`src/zombie.js`)
- Git repo with meaningful history, deployed to GitHub Pages

---

## 1. Engine: Three.js (recommended) vs Unity WebGL

**Recommendation: Three.js. Unity is the wrong tool for this specific project.**

| | Three.js | Unity WebGL |
|---|---|---|
| Integration with existing JS pose pipeline | Native — same page, same JS, pose data flows directly into game logic | Awkward. Camera + MediaPipe must run in page JS, then stream landmark data into the Unity runtime through a `jslib` interop bridge every frame. Workable but a permanent tax on every feature |
| Existing code | `pose.js`, `bodyFrame.js`, `punchClassifier.js`, `defense.js` carry over unchanged | All game-side logic rewritten in C# |
| Build/deploy | No build step; push → GitHub Pages, seconds | 30–100 MB builds, minutes per build, slow phone load times |
| Mobile performance | Tight but controllable (we choose every draw call) | WebGL builds are notoriously heavy on mobile browsers; memory pressure on phones is a real failure mode |
| Tooling you'd need to install | Nothing | Unity Hub + Editor (~10+ GB), plus me driving it through you since I can't operate a GUI editor |
| What we give up | Unity's animation state machine tooling, physics, editor scene tools | — |

The honest version of the tradeoff: Unity's editor tooling is genuinely better for
authoring complex 3D scenes and animation blending — **if a human artist/designer is
sitting in the editor**. Nobody will be. Everything here gets authored in code, and
for code-authored 3D, Three.js's `GLTFLoader` + `AnimationMixer` (load a rigged
glTF, crossfade between its named clips) covers exactly what this game needs, with
none of the interop or build overhead.

**Nothing for you to install.** Three.js stays a CDN ES-module import; no build
step for now. If the codebase outgrows that (it won't in the phases below), moving
to Vite later is a mechanical change.

---

## 2. Honest scope assessment

**Achievable and planned (stylized low-poly 3D):**
- A real 3D scene: ground, barricades, props, fog, lighting, day/night mood
- Rigged, professionally-animated characters (walk, run, attack, hit, death —
  these ship *inside* the CC0 asset packs; I load and sequence them, I don't author them)
- 3–5 zombies on screen simultaneously on a mid-range phone; more on desktop
- Wave spawning, pathing toward the player, attack telegraphs, hit reactions
- Exercise detection driving all combat (details in §4)
- Cohesive look: one asset family (Quaternius) + fog + consistent palette does a
  lot of visual heavy lifting for free

**Not achievable by code generation — do not expect:**
- Photorealism, or anything approaching AAA. Stylized low-poly is the ceiling and
  also the smart target (it hides the absence of an artist)
- Custom character animations that don't exist in a pack (e.g. a zombie doing a
  specific scripted cinematic). I can blend and retime existing clips, not author new ones
- Facial animation, cloth/hair simulation, motion-captured cutscenes
- Large open environments. One arena, well-dressed, is the right scope
- 60fps with 10+ skinned zombies *plus* BlazePose on a low-end phone. Physics of
  the frame budget. Mitigations: lite pose model, capped zombie count, capped
  pixel ratio, low-poly meshes — target 30fps on mid-range phones, honest

**Where a real 3D artist would eventually be needed:** a distinctive hero
character, custom animation sets, environment art beyond kit-bashing, VFX beyond
particles/shaders. None of this blocks a good game at our scope.

---

## 3. Assets (verified licenses)

| Asset | Source | License | Notes |
|---|---|---|---|
| **Zombie Apocalypse Kit** (primary) | quaternius.com | **CC0** | 4 playable characters × 20 animations, 4 enemies, 2 dogs, props + vehicles. **Ships glTF directly** — loads straight into Three.js, no Blender conversion step. This one kit plausibly covers survivor + zombies + props in one cohesive style |
| Animated Zombie Pack (backup/variety) | quaternius.com | CC0 | FBX/OBJ/Blend only — would need a Blender conversion pass, so second choice |
| **Graveyard Kit** (environment) | kenney.nl | CC0 | 90 low-poly models (fences, graves, props), glTF included. Kenney also has City Kits if we prefer urban ruins |
| Poly Pizza (gap-filler) | poly.pizza | per-model CC0/CC-BY | Aggregator; filter to CC0. For one-off props only |
| Mixamo (fallback only) | mixamo.com | Free incl. commercial; **no standalone redistribution** | ⚠️ Honest flag: this game lives in a **public GitHub repo**, so every GLB is publicly downloadable as a raw file. That sits uncomfortably close to Mixamo's "no redistribution as standalone assets" clause. Since Quaternius covers our animation needs as true CC0, **plan is to avoid Mixamo entirely** unless we hit a specific animation gap — and revisit the hosting question if we do |

Your offer to generate 3D assets: gladly accepted **later, as swaps** — the
architecture will load characters from GLB files, so a generated hero model with
standard clips can replace a Quaternius one without code changes. But Phase 2
starts from the CC0 kits so we're never blocked on asset generation.

**What I need from you for assets: nothing yet.** The kits are direct downloads;
I'll fetch and commit them (CC0 permits this) in Phase 2. If a download is blocked
from this machine I'll ask you to grab a zip.

---

## 4. Exercise → action mapping

Detection constraints first, honestly: one front-facing camera, player standing
2–2.5 m back, **full body in frame** (this is a new requirement — the current game
only needs the upper body; the start screen will gain a framing check that shows
your live skeleton and confirms ankles + head are visible before letting you fight).

| Exercise | Detection (BlazePose signals) | Game action | Confidence |
|---|---|---|---|
| **Punches** (jab / hook / uppercut) | Already working — 3D wrist velocity decomposed on body axes | Attack. Type matters: jab = fast light hit, hook = wide hit (can stagger two adjacent zombies), uppercut = heavy launcher, highest damage | Proven in current build |
| **Squat** | Hip height drops toward knee height + knee angle < ~100° + returns upright. Rep counted on full down-up cycle | **Power charge**: each squat charges a shockwave meter; full meter auto-releases a ground slam staggering every zombie in range. Also the "brace" pose — while at the bottom of a squat you take reduced damage | High — squats are the single most tractable exercise for pose detection |
| **Jump** | Both ankles + hips rise sharply and land together | **Evade lunging zombies / clear obstacles**: some attacks are low sweeps telegraphed with a ground marker — jump to avoid | High, with landing-detection care to avoid double-counts |
| **Lateral dodge** (side lean/step) | Already working — shoulder midline shifts vs. baseline | Evade a grab; positions you against the correct flank ("zombie approaching LEFT — dodge RIGHT") | Proven in current build |
| **Guard** (fists up) | Already working — both wrists above shoulder line | Block a swipe (chip damage instead of full) | Proven in current build |
| **High knees** (running in place) | Alternating knee raises above hip line, cadence tracked | **Sprint/repositioning** between arena zones during intermissions, and "escape" QTE when grabbed: hit a cadence for 3 s to break free | Medium-high |
| **Jumping jacks** | Simultaneous arm raise + leg spread cycles | **Rally/heal**: between waves, jacks restore health — rest becomes active recovery | Medium-high |
| **Pushups** | ❌ **Being honest: cut from MVP.** Pushups put you on the floor, in profile, mostly out of a fixed front camera's frame — detection would be unreliable garbage and unreliable controls are worse than absent ones. Options if you want them later: a dedicated between-wave "fortify" phase where the game explicitly instructs re-aiming the camera at floor level (clunky but workable), or accepting wall-pushups (detectable standing, arms toward camera). Not silently faking it | — |

Design rule underneath all of this: **attack = arms, survive = legs.** Punches
kill, but everything defensive/mobility is lower-body — so a full wave genuinely
exercises the whole body, and skipping leg work gets you killed.

---

## 5. Core loop, pacing, difficulty

**Loop (one "night" ≈ one workout session, 15–25 min):**

1. **Framing check** — skeleton preview, full body confirmed, quick calibration
   (one squat, one jump — sets your personal depth/height thresholds so a tall
   player and a short player both get fair detection)
2. **Wave** (45–90 s) — zombies shamble/run in from the fog in small groups.
   Fight with punches; dodge/jump/block/squat as telegraphed. Kill count + form
   quality feed a wave score
3. **Respite** (30–45 s) — deliberate rest interval, framed as in-world downtime
   (barricade creaks, distant groans). Optional jumping jacks to heal; standing
   still is also fine and never punished. This is interval training pacing —
   work/rest — wearing a game costume
4. Repeat with escalation; a night is 5–8 waves. Survive the night → debrief
   screen: reps by exercise, calories-ish estimate (honest label: rough), kills,
   best streak

**Difficulty progression across waves:** more simultaneous zombies (2 → 5), then
faster variants (the kit's runner enemy), then mixed telegraphs that demand
different responses in sequence (low sweep → jump, into flank grab → dodge).
Difficulty comes from **variety and tempo, not damage sponges** — late-wave
zombies shouldn't take 20 punches; that's just arm fatigue with no decision-making.

**Fail/retry:** health hits zero → knocked down, night ends, debrief still shows
everything you did (the workout happened; the game acknowledges it). Retry
restarts the *night* with waves 1–2 compressed so restarting isn't a grind.
No lives, no permadeath, no losing progression.

**Adaptive difficulty (opt-in, on by default, visible in settings):** if the
player's punch rate drops hard mid-wave (fatigue), the wave quietly trims spawn
count rather than letting them get overwhelmed. This is a fitness product first —
the failure state to avoid is "too exhausted, feels unfair, closes tab."

---

## 6. Story wrapper

**THE LAST GYM**

The outbreak didn't end the world in fire — it ended it in silence. Cities
emptied, the grid died, and the things that used to be people wander the fog
looking for the living. You were a trainer at a small gym on the edge of town.
When the evacuation convoy left without you, you did what you knew how to do:
you barricaded the doors, dragged the racks against the windows, and kept
training. Strong things survive. That's the whole religion now.

The gym's generator runs the floodlights for a few hours a night, and light
draws them. So every night is the same contract: they come through the fog to
the chain-link, and you meet them at the barricade — because if you don't thin
them out at the fence, tomorrow there are more. Every punch thrown is one less
set of hands pulling at the boards. Every night survived, the radio crackles a
little clearer: other survivors, other holdouts, maybe a convoy coming back.

They're getting faster. So are you.

*(Delivered as: a title screen paragraph, one to two lines of radio chatter
between waves, and debrief flavor text. No cutscenes, no dialogue trees — a
sense of place and a reason to swing, not a novel.)*

---

## 7. Engagement design — respecting the player

Principles, and mechanisms that implement them:

- **Effort is always visible and always credited.** Every rep is counted and
  shown in the debrief even on a loss. The workout is the real progress bar;
  the game never pretends otherwise
- **Fair challenge, readable telegraphs.** Every attack has a distinct visual +
  audio wind-up long enough to physically react to (~1 s minimum; exercise
  responses are slower than button presses). Deaths should feel diagnosable
  ("I ignored the sweep"), never random
- **Flow pacing.** Work/rest intervals; wave intensity ramps within a night;
  the adaptive trim (§5) keeps players at the edge of ability, not past it
- **Session shape with an end.** Nights are finite. The debrief is a cool-down:
  summary, one highlighted achievement, "same time tomorrow?" — and that's it.
  The game tells you to stop; it never nags to continue
- **Progression between sessions (localStorage):** unlock survivor characters
  (the kit has 4), harder night types, cosmetic barricade upgrades — earned by
  cumulative reps, not consecutive-day streaks
- **Explicitly rejected:** guilt-based streak mechanics ("your streak dies at
  midnight!"), loss-aversion timers, notification nagging, energy systems, fake
  scarcity, pay-anything, celebrating over-training. If a player does three
  nights back-to-back, the debrief suggests rest — the fitness-domain-correct
  answer, and the trust-building one

---

## 8. Implementation phases (each ends playable, committed, deployed)

- **Phase 2 — 3D scene + survivor.** Load Graveyard/Apocalypse Kit environment
  into a proper Three.js scene (fog, lighting, ground, barricade). Load one
  animated survivor character. Existing punch/guard/dodge detection still works.
  *Playable: current combat inside a real 3D place.*
- **Phase 3 — full movement vocabulary.** Squat/jump/high-knees/jacks detectors
  (new `exerciseDetectors.js` beside the existing classifier), calibration +
  framing check, on-screen action feedback. *Playable: a training-dummy mode to
  validate every exercise before combat depends on it.*
- **Phase 4 — one real zombie + one wave.** Kit zombie with walk/attack/hit/death
  clips, approach AI, telegraphed attacks mapped to defenses, health both ways,
  one full wave with win/lose. *Playable: the actual game in miniature.*
- **Phase 5 — the night loop.** 5–8 waves, respite phases, escalation, debrief,
  fail/retry, story text. *Playable: a complete session.*
- **Phase 6 — polish + progression.** Second zombie variant, adaptive difficulty,
  localStorage unlocks, audio, performance pass on real phone.

Stopping for your approval at each phase boundary. Existing pose/classification
code is preserved throughout; `zombie.js` (the procedural placeholder) is the
only module Phase 4 replaces.

**Known risks, stated up front:** (1) Mobile perf is the big one — skinned meshes
+ BlazePose on one phone GPU; budgeted for, but real-device testing in Phase 2,
not Phase 6. (2) Exercise detection thresholds always need a tuning pass against
real bodies — Phase 3's dummy mode exists precisely so we tune before combat
depends on it. (3) Asset downloads from this machine may hit blocks; fallback is
asking you for a zip. (4) I cannot playtest with a webcam myself — you are the
playtest loop, and the phases are sized so each hands you something concrete to test.
