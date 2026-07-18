// The zombie: a rigged Quaternius character in the 3D scene, replacing the
// old procedural-boxes version. Same gameplay contract game.js already
// depends on (activate/deactivate/update/takeDamage/isDead/reset), same
// attack state machine — but the visuals are now real animation clips:
// Walk (shamble in place), Idle_Attack (windup tell), Punch (strike, with a
// physical lunge toward the survivor), HitReact, Death.
//
// Available clips on Zombie_Basic: Crawl, Death, HitReact, Idle,
// Idle_Attack, Jump, Jump_Idle, Jump_Land, No, Punch, Run, Run_Arms,
// Run_Attack, Walk, Wave, Yes.

import { AnimatedActor, loadGltf } from './actors.js';

const MODEL_URL = 'assets/characters/Zombie_Basic.gltf';

const HITS_TO_DEFEAT = 8;
const WINDUP_MS = 950;
const STRIKE_MS = 500;
const HURT_MS = 450;
const ATTACK_DELAY_MIN_MS = 2200;
const ATTACK_DELAY_MAX_MS = 4500;

const HOME_Z = -2.7; // its spot at the broken fence
const LUNGE_Z = -0.9; // how close the strike carries it

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}
function clamp01(t) {
  return Math.max(0, Math.min(1, t));
}

export class ZombieActor {
  constructor({ elements, onStrike, maxHealth = 100 }) {
    this.warningEl = elements.warningEl;
    this.healthFillEl = elements.healthFillEl;
    this.arenaEl = elements.arenaEl;
    this.onStrike = onStrike;

    this.maxHealth = maxHealth;
    this.damagePerHit = maxHealth / HITS_TO_DEFEAT;
    this.health = maxHealth;

    this.state = 'shamble'; // shamble | windup | strike | hurt | dead
    this.stateStart = 0;
    this.stateUntil = 0;
    this.nextAttackAt = 0;
    this.active = false;

    this.actor = null;
    this.root = null;
  }

  async load(scene) {
    const gltf = await loadGltf(MODEL_URL);
    this.actor = new AnimatedActor(gltf, { targetHeight: 1.8 });
    this.root = this.actor.root;

    // At the fence gap, facing the survivor (+z).
    this.root.position.set(0, 0, HOME_Z);
    this.root.add(scene.makeBlobShadow(0.5));
    scene.add(this.root);

    this.actor.playLoop('Walk', { timeScale: 0.8 });
  }

  activate(now) {
    this.active = true;
    this._scheduleNextAttack(now);
  }

  deactivate() {
    this.active = false;
    if (this.state === 'windup' || this.state === 'strike') {
      this._toShamble(performance.now());
    }
    this.warningEl.classList.remove('telegraph');
  }

  update(now, deltaSeconds) {
    if (!this.actor) return;

    if (this.state !== 'dead' && this.active) {
      if (this.state === 'shamble' && now >= this.nextAttackAt) {
        this._setState('windup', now, now + WINDUP_MS);
        this.actor.playOnce('Idle_Attack', { timeScale: 0.9 });
        this.warningEl.classList.add('telegraph');
      } else if (this.state === 'windup' && now >= this.stateUntil) {
        this._setState('strike', now, now + STRIKE_MS);
        this.actor.playOnce('Punch', { timeScale: 1.3 });
        this.warningEl.classList.remove('telegraph');
        const result = this.onStrike();
        this._spawnPopup(
          result === 'blocked' ? 'BLOCKED!' : result === 'dodged' ? 'DODGED!' : 'OOF!',
          result === 'hit' ? 'popup-player-hit' : 'popup-defended'
        );
      } else if (this.state === 'strike' && now >= this.stateUntil) {
        this._toShamble(now);
        this._scheduleNextAttack(now);
      } else if (this.state === 'hurt' && now >= this.stateUntil) {
        this._toShamble(now);
      }
    }

    // Physical lunge: slide toward the survivor during the strike, ease home after.
    if (this.state === 'strike') {
      const p = easeOutCubic(clamp01((now - this.stateStart) / STRIKE_MS));
      this.root.position.z = HOME_Z + (LUNGE_Z - HOME_Z) * p;
    } else if (this.state !== 'dead') {
      const z = this.root.position.z;
      this.root.position.z = z + (HOME_Z - z) * Math.min(1, deltaSeconds * 6);
    }

    this.actor.update(deltaSeconds);
  }

  takeDamage(now, amount = this.damagePerHit) {
    if (this.isDead() || !this.actor) return;

    this.health = Math.max(0, this.health - amount);
    this._updateHealthBar();
    this._spawnPopup('HIT!', 'popup-enemy-hit');

    if (this.isDead()) {
      this.warningEl.classList.remove('telegraph');
      this._setState('dead', now, Infinity);
      this.actor.playOnce('Death', { clamp: true });
    } else if (this.state !== 'windup' && this.state !== 'strike') {
      // Mid-attack hits don't interrupt the swing — it commits.
      this._setState('hurt', now, now + HURT_MS);
      this.actor.playOnce('HitReact', { timeScale: 1.2 });
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
    this.warningEl.classList.remove('telegraph');
    this._updateHealthBar();
    this._scheduleNextAttack(now);
    if (this.actor) {
      this.root.position.set(0, 0, HOME_Z);
      this.actor.stopAll();
      this.actor.playLoop('Walk', { timeScale: 0.8 });
    }
    this._setState('shamble', now, 0);
  }

  _toShamble(now) {
    this._setState('shamble', now, 0);
    this.actor.playLoop('Walk', { timeScale: 0.8 });
  }

  _setState(state, now, until) {
    this.state = state;
    this.stateStart = now;
    this.stateUntil = until;
  }

  _scheduleNextAttack(now) {
    this.nextAttackAt =
      now + ATTACK_DELAY_MIN_MS + Math.random() * (ATTACK_DELAY_MAX_MS - ATTACK_DELAY_MIN_MS);
  }

  _updateHealthBar() {
    this.healthFillEl.style.width = `${(this.health / this.maxHealth) * 100}%`;
  }

  _spawnPopup(text, className) {
    const popup = document.createElement('div');
    popup.className = `hit-popup ${className}`;
    popup.textContent = text;
    this.arenaEl.appendChild(popup);
    setTimeout(() => popup.remove(), 700);
  }
}
