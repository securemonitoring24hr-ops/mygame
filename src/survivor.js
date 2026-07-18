// The player's avatar: a Quaternius survivor standing at the barricade with
// their back mostly to the camera, mirroring the player's real movements —
// punch clips when you punch, a crouched guard when your fists are up, a
// sidestep when you dodge, a hit react when you take damage.
//
// Clip names available on the survivor characters: Death, Duck, HitReact,
// Idle, Idle_Gun, Jump, Jump_Idle, Jump_Land, No, Punch, Run, Run_Gun,
// Run_Slash, Run_Stab, Slash, Stab, Walk, Walk_Gun, Wave, Yes.

import { AnimatedActor, loadGltf } from './actors.js';

const MODEL_URL = 'assets/characters/Characters_Shaun.gltf';

const DODGE_OFFSET_X = 0.85; // meters of sidestep at full dodge

export class Survivor {
  constructor() {
    this.actor = null;
    this.root = null;
    this.guarding = false;
    this.dead = false;
    this.targetX = 0;
  }

  async load(scene) {
    const gltf = await loadGltf(MODEL_URL);
    this.actor = new AnimatedActor(gltf, { targetHeight: 1.75 });
    this.root = this.actor.root;

    // Near the camera, facing the fence (-z). Quaternius characters face +z
    // at rest, so turn them around.
    this.root.position.set(0, 0, 1.9);
    this.root.rotation.y = Math.PI;

    this.root.add(scene.makeBlobShadow(0.45));
    scene.add(this.root);

    this.actor.playLoop('Idle');
  }

  // punch.type: 'straight' | 'hook' | 'uppercut'; speeds up light punches so
  // the avatar reads as snappy rather than wading through the full clip.
  onPunch(punch) {
    if (this.dead) return;
    const timeScale = punch.type === 'straight' ? 1.9 : punch.type === 'hook' ? 1.5 : 1.3;
    this.actor.playOnce('Punch', { timeScale });
  }

  setGuarding(guarding) {
    if (this.dead || guarding === this.guarding) return;
    this.guarding = guarding;
    if (guarding) {
      this.actor.playLoop('Duck', { fade: 0.15 });
    } else {
      this.actor.playLoop('Idle', { fade: 0.25 });
    }
  }

  // direction: -1 | 0 | +1 in the player's mirrored screen space.
  setDodge(direction) {
    // Mirror: leaning screen-left should move the avatar to ITS left as seen
    // by the player (camera behind avatar → same sign works out).
    this.targetX = direction * DODGE_OFFSET_X;
  }

  onHit() {
    if (this.dead) return;
    this.actor.playOnce('HitReact');
  }

  onWin() {
    if (this.dead) return;
    this.actor.playOnce('Wave', { timeScale: 0.9 });
  }

  onDeath() {
    if (this.dead) return;
    this.dead = true;
    this.actor.playOnce('Death', { clamp: true });
  }

  reset() {
    this.dead = false;
    this.guarding = false;
    this.targetX = 0;
    if (this.root) this.root.position.x = 0;
    if (this.actor) {
      this.actor.stopAll();
      this.actor.playLoop('Idle');
    }
  }

  update(deltaSeconds) {
    if (!this.actor) return;
    // Ease toward the dodge offset.
    const x = this.root.position.x;
    this.root.position.x = x + (this.targetX - x) * Math.min(1, deltaSeconds * 10);
    this.actor.update(deltaSeconds);
  }
}
