// A procedurally rigged, procedurally animated low-poly zombie, rendered
// with Three.js onto a transparent canvas layered over the webcam feed.
//
// "Procedural" means: no GLTF/GLB file, no skinned mesh, no animation clips.
// The skeleton is a plain Three.js Object3D hierarchy (Group per bone) and
// every frame we compute joint rotations directly from sine waves / eased
// transitions based on the current state (shamble, windup, strike, hurt,
// dead). This keeps it dependency-free and fully swappable later: if a
// generated GLB model shows up, it can replace `_buildRig()` and everything
// else (state machine, damage, strike timing) stays the same.
//
// The zombie is never fully static: even mid-windup and mid-hurt, the base
// shamble motion (leg shift, torso sway, arm drift, head twitch) keeps
// running underneath, blended with the state-specific pose.

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const HITS_TO_DEFEAT = 8;
const WINDUP_MS = 900;
const STRIKE_HOLD_MS = 380;
const HURT_HOLD_MS = 320;
const ATTACK_DELAY_MIN_MS = 2200;
const ATTACK_DELAY_MAX_MS = 4500;

const COLOR = {
  skin: 0x5b7a52,
  skinDark: 0x435c3c,
  cloth: 0x3a352c,
  clothDark: 0x24211b,
  eye: 0xff2200,
  nail: 0x1a1a16,
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}
function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
function clamp01(t) {
  return Math.max(0, Math.min(1, t));
}

// A limb segment: a box mesh whose geometry is pre-translated so the group's
// local origin sits at the joint. direction 'down' hangs the mesh below the
// origin (legs, hanging arms); 'up' extends it above (spine, neck).
function makeSegment({ length, width, depth, color, direction = 'down' }) {
  const geo = new THREE.BoxGeometry(width, length, depth);
  geo.translate(0, direction === 'up' ? length / 2 : -length / 2, 0);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0.02 });
  const mesh = new THREE.Mesh(geo, mat);
  const group = new THREE.Group();
  group.add(mesh);
  const endY = direction === 'up' ? length : -length;
  return { group, mesh, endY };
}

export class Zombie {
  constructor({ canvasEl, containerEl, healthFillEl, arenaEl, onStrike, maxHealth = 100 }) {
    this.canvasEl = canvasEl;
    this.containerEl = containerEl; // wrapping div — CSS handles shake/lunge/telegraph glow
    this.healthFillEl = healthFillEl;
    this.arenaEl = arenaEl;
    this.onStrike = onStrike;

    this.maxHealth = maxHealth;
    this.damagePerHit = maxHealth / HITS_TO_DEFEAT;
    this.health = maxHealth;

    this.state = 'shamble'; // shamble | windup | strike | hurt | dead
    this.stateStart = 0;
    this.stateUntil = 0;
    this.nextAttackAt = 0;
    this.active = false;

    this.deathProgress = 0;

    this._initRenderer();
    this._buildRig();
    this.resize();
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvasEl,
      alpha: true,
      antialias: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
    this.camera.position.set(0, 1.35, 5.4);
    this.camera.lookAt(0, 1.25, 0);

    const ambient = new THREE.AmbientLight(0x8899aa, 0.9);
    const key = new THREE.DirectionalLight(0xfff2df, 1.1);
    key.position.set(1.5, 3, 2.5);
    const rim = new THREE.DirectionalLight(0x5566ff, 0.5);
    rim.position.set(-2, 1.5, -2);
    this.scene.add(ambient, key, rim);
  }

  _buildRig() {
    const root = new THREE.Group();
    this.root = root;
    this.scene.add(root);

    // ---- Legs (hang down from the hips) ----
    const hips = new THREE.Group();
    hips.position.set(0, 1.75, 0); // ground is y=0; this is standing hip height
    root.add(hips);
    this.hips = hips;

    const pelvisGeo = new THREE.BoxGeometry(0.52, 0.28, 0.3);
    const pelvis = new THREE.Mesh(
      pelvisGeo,
      new THREE.MeshStandardMaterial({ color: COLOR.cloth, roughness: 0.95 })
    );
    hips.add(pelvis);

    this.leftLeg = this._buildLeg(-0.16);
    this.rightLeg = this._buildLeg(0.16);
    hips.add(this.leftLeg.upper.group, this.rightLeg.upper.group);

    // ---- Spine / chest ----
    const spine = makeSegment({ length: 0.62, width: 0.58, depth: 0.34, color: COLOR.cloth, direction: 'up' });
    spine.group.position.set(0, 0.1, 0);
    hips.add(spine.group);
    this.spine = spine;

    const neck = makeSegment({ length: 0.14, width: 0.16, depth: 0.16, color: COLOR.skinDark, direction: 'up' });
    neck.group.position.set(0, spine.endY, 0);
    spine.group.add(neck.group);

    const head = new THREE.Group();
    head.position.set(0, neck.endY, 0);
    neck.group.add(head);
    this.head = head;

    const headMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.42, 0.4),
      new THREE.MeshStandardMaterial({ color: COLOR.skin, roughness: 0.9 })
    );
    headMesh.position.y = 0.21;
    head.add(headMesh);

    const eyeGeo = new THREE.SphereGeometry(0.045, 8, 8);
    const eyeMat = new THREE.MeshStandardMaterial({
      color: COLOR.eye,
      emissive: COLOR.eye,
      emissiveIntensity: 1.2,
    });
    this.eyeMat = eyeMat;
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.11, 0.24, 0.2);
    const rightEye = leftEye.clone();
    rightEye.position.x = 0.11;
    head.add(leftEye, rightEye);

    // Jaw, slightly offset forward+down, for a gaunt zombie silhouette.
    const jaw = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.1, 0.2),
      new THREE.MeshStandardMaterial({ color: COLOR.skinDark, roughness: 0.9 })
    );
    jaw.position.set(0, 0.03, 0.14);
    head.add(jaw);

    // ---- Arms (attach near top of chest) ----
    this.leftArm = this._buildArm(-0.34, spine.endY - 0.1);
    this.rightArm = this._buildArm(0.34, spine.endY - 0.1);
    spine.group.add(this.leftArm.upper.group, this.rightArm.upper.group);

    // Base rest pose: zombie arms hang forward and slightly out ("groping").
    this.leftArm.upper.group.rotation.x = -1.7;
    this.leftArm.upper.group.rotation.z = 0.25;
    this.rightArm.upper.group.rotation.x = -1.7;
    this.rightArm.upper.group.rotation.z = -0.25;
  }

  _buildLeg(xOffset) {
    const upper = makeSegment({ length: 0.5, width: 0.24, depth: 0.24, color: COLOR.cloth });
    upper.group.position.set(xOffset, -0.1, 0);

    const lower = makeSegment({ length: 0.48, width: 0.2, depth: 0.2, color: COLOR.clothDark });
    lower.group.position.set(0, upper.endY, 0);
    upper.group.add(lower.group);

    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.1, 0.32),
      new THREE.MeshStandardMaterial({ color: COLOR.nail, roughness: 0.9 })
    );
    foot.position.set(0, lower.endY - 0.03, 0.08);
    lower.group.add(foot);

    return { upper, lower };
  }

  _buildArm(xOffset, yOffset) {
    const upper = makeSegment({ length: 0.42, width: 0.16, depth: 0.16, color: COLOR.skin });
    upper.group.position.set(xOffset, yOffset, 0);

    const forearm = makeSegment({ length: 0.4, width: 0.13, depth: 0.13, color: COLOR.skinDark });
    forearm.group.position.set(0, upper.endY, 0);
    upper.group.add(forearm.group);

    const hand = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.18, 0.12),
      new THREE.MeshStandardMaterial({ color: COLOR.skin, roughness: 0.9 })
    );
    hand.position.set(0, forearm.endY - 0.06, 0);
    forearm.group.add(hand);

    return { upper, forearm };
  }

  resize() {
    const w = this.canvasEl.clientWidth || 1;
    const h = this.canvasEl.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  activate(now) {
    this.active = true;
    this._scheduleNextAttack(now);
  }

  deactivate() {
    this.active = false;
    if (this.state === 'windup' || this.state === 'strike') {
      this._setState('shamble', performance.now());
    }
    this.containerEl.classList.remove('telegraph', 'lunge');
  }

  // Advances the animation/state machine and renders. Call once per frame.
  update(now) {
    if (this.state === 'dead') {
      this._animateDeath(now);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.active) {
      if (this.state === 'shamble' && now >= this.nextAttackAt) {
        this._setState('windup', now);
        this.stateUntil = now + WINDUP_MS;
        this.containerEl.classList.add('telegraph');
      } else if (this.state === 'windup' && now >= this.stateUntil) {
        this._setState('strike', now);
        this.stateUntil = now + STRIKE_HOLD_MS;
        this.containerEl.classList.remove('telegraph');
        this.containerEl.classList.add('lunge');
        const result = this.onStrike();
        this._spawnPopup(
          result === 'blocked' ? 'BLOCKED!' : result === 'dodged' ? 'DODGED!' : 'OOF!',
          result === 'hit' ? 'popup-player-hit' : 'popup-defended'
        );
      } else if (this.state === 'strike' && now >= this.stateUntil) {
        this._setState('shamble', now);
        this.containerEl.classList.remove('lunge');
        this._scheduleNextAttack(now);
      } else if (this.state === 'hurt' && now >= this.stateUntil) {
        this._setState('shamble', now);
      }
    }

    this._animatePose(now);
    this.renderer.render(this.scene, this.camera);
  }

  // Base continuous shamble motion — always computed, so the zombie is never
  // frozen even while other state-specific poses are blended on top.
  _animatePose(now) {
    const t = now / 1000;
    const walkPhase = t * 3.2;

    // Legs alternate stepping in place.
    this.leftLeg.upper.group.rotation.x = Math.sin(walkPhase) * 0.5;
    this.rightLeg.upper.group.rotation.x = Math.sin(walkPhase + Math.PI) * 0.5;
    this.leftLeg.lower.group.rotation.x = Math.max(0, -Math.sin(walkPhase)) * 0.7;
    this.rightLeg.lower.group.rotation.x = Math.max(0, -Math.sin(walkPhase + Math.PI)) * 0.7;

    // Torso bob + unsteady sway.
    const bob = Math.abs(Math.sin(walkPhase)) * 0.06;
    this.hips.position.y = 1.75 - bob;
    this.root.rotation.z = Math.sin(t * 0.9) * 0.05;
    this.root.rotation.y = Math.sin(t * 0.35) * 0.12;

    // Head twitch.
    this.head.rotation.y = Math.sin(t * 0.5 + 1.3) * 0.25;
    this.head.rotation.z = Math.sin(t * 0.7) * 0.08;

    // Eye glow pulses faster/brighter as an attack approaches.
    let eyeIntensity = 1.0 + Math.sin(t * 2) * 0.15;

    // Base arm sway (groping shamble), overridden by attack poses below.
    let leftArmX = -1.7 + Math.sin(t * 1.1) * 0.08;
    let leftArmZ = 0.25;
    let rightArmX = -1.7 + Math.sin(t * 1.1 + 1.5) * 0.08;
    let rightArmZ = -0.25;
    let leftForearmX = 0.3 + Math.sin(t * 1.3) * 0.1;
    let rightForearmX = 0.3 + Math.sin(t * 1.3 + 1) * 0.1;

    if (this.state === 'windup') {
      const p = easeOutCubic(clamp01((now - this.stateStart) / WINDUP_MS));
      // Right arm draws back and up, ready to swing.
      rightArmX = lerp(rightArmX, -2.6, p);
      rightArmZ = lerp(rightArmZ, -0.9, p);
      rightForearmX = lerp(rightForearmX, 2.0, p);
      // A tremor that builds toward the strike.
      const tremor = Math.sin(now * 0.05) * 0.05 * p;
      rightArmX += tremor;
      eyeIntensity = lerp(eyeIntensity, 2.6, p);
      this.root.position.z = lerp(0, 0.15, p);
    } else if (this.state === 'strike') {
      const p = clamp01((now - this.stateStart) / STRIKE_HOLD_MS);
      const swing = p < 0.4 ? easeOutCubic(p / 0.4) : 1 - easeInOutQuad((p - 0.4) / 0.6);
      rightArmX = lerp(-2.6, -0.5, swing);
      rightArmZ = lerp(-0.9, -0.1, swing);
      rightForearmX = lerp(2.0, 0.1, swing);
      eyeIntensity = 2.6;
      this.root.position.z = lerp(0.15, 0.55, swing);
      this.root.scale.setScalar(lerp(1, 1.08, swing));
    } else if (this.state === 'hurt') {
      const p = clamp01((now - this.stateStart) / HURT_HOLD_MS);
      const recoil = Math.sin(p * Math.PI); // out and back
      this.root.position.z = -0.25 * recoil;
      this.root.rotation.x = 0.18 * recoil;
      leftArmX -= 0.3 * recoil;
      rightArmX -= 0.3 * recoil;
    } else {
      this.root.position.z = lerp(this.root.position.z, 0, 0.15);
      this.root.rotation.x = lerp(this.root.rotation.x, 0, 0.15);
      this.root.scale.setScalar(lerp(this.root.scale.x, 1, 0.15));
    }

    this.leftArm.upper.group.rotation.x = leftArmX;
    this.leftArm.upper.group.rotation.z = leftArmZ;
    this.rightArm.upper.group.rotation.x = rightArmX;
    this.rightArm.upper.group.rotation.z = rightArmZ;
    this.leftArm.forearm.group.rotation.x = leftForearmX;
    this.rightArm.forearm.group.rotation.x = rightForearmX;

    this.eyeMat.emissiveIntensity = eyeIntensity;
  }

  _animateDeath(now) {
    const p = clamp01((now - this.stateStart) / 1400);
    const eased = easeInOutQuad(p);
    this.root.rotation.x = lerp(0, 1.3, eased);
    this.hips.position.y = lerp(1.75, 0.5, eased);
    this.root.position.z = lerp(this.root.position.z, 0.3, eased);

    if (p >= 1 && !this._faded) {
      this._faded = true;
      this._fadeOut();
    }
  }

  _fadeOut() {
    const start = performance.now();
    const meshes = [];
    this.root.traverse((obj) => {
      if (obj.isMesh) {
        obj.material = obj.material.clone();
        obj.material.transparent = true;
        meshes.push(obj.material);
      }
    });
    const step = () => {
      const p = clamp01((performance.now() - start) / 900);
      for (const mat of meshes) mat.opacity = 1 - p;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  takeDamage(now, amount = this.damagePerHit) {
    if (this.isDead()) return;

    this.health = Math.max(0, this.health - amount);
    this._updateHealthBar();
    this._playHitEffect();

    if (this.isDead()) {
      this.containerEl.classList.remove('telegraph', 'lunge');
      this.containerEl.classList.add('dead');
      this._setState('dead', now);
    } else if (this.state !== 'windup' && this.state !== 'strike') {
      // Getting punched mid-attack doesn't interrupt the swing — it commits.
      this._setState('hurt', now);
      this.stateUntil = now + HURT_HOLD_MS;
    }
  }

  isDead() {
    return this.health <= 0;
  }

  announcePunch(label) {
    this._spawnPopup(label, 'popup-punch-type');
  }

  reset(now) {
    this.health = this.maxHealth;
    this.containerEl.classList.remove('dead', 'telegraph', 'lunge');
    this.root.rotation.set(0, 0, 0);
    this.root.position.set(0, 0, 0);
    this.root.scale.setScalar(1);
    this._faded = false;
    this._setState('shamble', now);
    this._updateHealthBar();
    this._scheduleNextAttack(now);
  }

  _setState(state, now) {
    this.state = state;
    this.stateStart = now;
  }

  _scheduleNextAttack(now) {
    this.nextAttackAt =
      now + ATTACK_DELAY_MIN_MS + Math.random() * (ATTACK_DELAY_MAX_MS - ATTACK_DELAY_MIN_MS);
  }

  _updateHealthBar() {
    const pct = (this.health / this.maxHealth) * 100;
    this.healthFillEl.style.width = `${pct}%`;
  }

  _playHitEffect() {
    this.containerEl.classList.remove('hit');
    void this.containerEl.offsetWidth; // restart animation if mid-play
    this.containerEl.classList.add('hit');
    this._spawnPopup('HIT!', 'popup-enemy-hit');
  }

  _spawnPopup(text, className) {
    const popup = document.createElement('div');
    popup.className = `hit-popup ${className}`;
    popup.textContent = text;
    this.arenaEl.appendChild(popup);
    setTimeout(() => popup.remove(), 700);
  }
}
