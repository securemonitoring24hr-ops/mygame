// Shared glTF loading + animated-actor plumbing for characters.
//
// AnimatedActor wraps a loaded skinned character: an AnimationMixer, its
// clips indexed by name, and a small "base loop + one-shot overlay" pattern —
// crossfade between looping states (Idle/Walk), fire one-shot clips (Punch,
// HitReact) that automatically return to the current base loop when finished.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

export function loadGltf(url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

// Normalizes a character to a target height (meters) regardless of the
// authored unit scale, and returns its root ready to place in the scene.
export function normalizeHeight(object3d, targetHeight) {
  const box = new THREE.Box3().setFromObject(object3d);
  const height = box.max.y - box.min.y;
  if (height > 0.0001) {
    const s = targetHeight / height;
    object3d.scale.setScalar(s);
  }
  // Sit feet on y=0 after scaling.
  const box2 = new THREE.Box3().setFromObject(object3d);
  object3d.position.y -= box2.min.y;
  return object3d;
}

export class AnimatedActor {
  constructor(gltf, { targetHeight = 1.75 } = {}) {
    this.root = new THREE.Group();
    this.model = gltf.scene;
    normalizeHeight(this.model, targetHeight);
    this.root.add(this.model);

    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const clip of gltf.animations) {
      this.actions[clip.name] = this.mixer.clipAction(clip);
    }

    this.baseAction = null; // current looping state
    this.oneShot = null;

    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.oneShot) {
        this.oneShot = null;
        if (this.baseAction) {
          this.baseAction.enabled = true;
          e.action.crossFadeTo(this.baseAction, 0.25, false);
        }
      }
    });
  }

  hasClip(name) {
    return !!this.actions[name];
  }

  // Crossfade to a looping clip (Idle, Walk, ...). No-op if already playing it.
  playLoop(name, { fade = 0.3, timeScale = 1 } = {}) {
    const action = this.actions[name];
    if (!action) return;
    if (this.baseAction === action && action.isRunning()) return;

    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.timeScale = timeScale;
    action.enabled = true;
    action.play();

    if (this.baseAction && this.baseAction !== action) {
      this.baseAction.crossFadeTo(action, fade, false);
    } else {
      action.fadeIn(fade);
    }
    this.baseAction = action;
  }

  // Play a clip once on top of the base loop; returns to the base loop after.
  // clamp=true freezes on the last frame instead (Death).
  playOnce(name, { fade = 0.12, timeScale = 1, clamp = false } = {}) {
    const action = this.actions[name];
    if (!action) return null;

    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = clamp;
    action.timeScale = timeScale;
    action.enabled = true;
    action.play();

    const from = this.oneShot || this.baseAction;
    if (from && from !== action) {
      from.crossFadeTo(action, fade, false);
    } else {
      action.fadeIn(fade);
    }

    if (clamp) {
      // A clamped clip (Death) becomes the terminal state — stop tracking a base loop.
      this.baseAction = null;
      this.oneShot = null;
    } else {
      this.oneShot = action;
    }
    return action;
  }

  stopAll() {
    this.mixer.stopAllAction();
    this.baseAction = null;
    this.oneShot = null;
  }

  update(deltaSeconds) {
    this.mixer.update(deltaSeconds);
  }
}
