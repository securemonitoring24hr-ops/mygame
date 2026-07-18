import { PoseTracker } from './pose.js';
import { PunchClassifier } from './punchClassifier.js';
import { DefenseDetector } from './defense.js';
import { Zombie } from './zombie.js';

// Orchestrates pose tracking -> punch classification / defense detection ->
// zombie AI -> two-way damage -> win/lose state.

const PLAYER_MAX_HEALTH = 100;
const VILLAIN_HIT_DAMAGE = 15; // ~7 unblocked hits and you're out

const PUNCH_LABELS = { straight: 'JAB!', hook: 'HOOK!', uppercut: 'UPPERCUT!' };
// Uppercuts and hooks are harder to land clean than a straight punch, so
// they're rewarded with more damage.
const PUNCH_DAMAGE_MULTIPLIER = { straight: 0.85, hook: 1.1, uppercut: 1.35 };

export class Game {
  constructor(dom) {
    this.dom = dom;

    this.poseTracker = new PoseTracker(dom.videoEl, dom.canvasEl);
    this.punchClassifier = new PunchClassifier();
    this.defenseDetector = new DefenseDetector();
    this.zombie = new Zombie({
      canvasEl: dom.spriteCanvasEl,
      containerEl: dom.enemyEl,
      healthFillEl: dom.healthFillEl,
      arenaEl: dom.arenaEl,
      onStrike: () => this._onZombieStrike(),
    });

    this.playerHealth = PLAYER_MAX_HEALTH;
    this.hitCount = 0;
    this.state = 'idle'; // idle -> loading -> playing -> win | lose

    window.addEventListener('resize', () => this.zombie.resize());
  }

  async start() {
    this.state = 'loading';
    await this.poseTracker.init();
    this.zombie.resize();

    this._resetRound();

    this.poseTracker.start((screenKeypoints, worldKeypoints, timestampMs) => {
      this._onFrame(screenKeypoints, worldKeypoints, timestampMs);
    });

    this._renderLoop();
  }

  restart() {
    this._resetRound();
  }

  stop() {
    this.poseTracker.stop();
    this.zombie.deactivate();
    this._rendering = false;
  }

  _resetRound() {
    const now = performance.now();
    this.zombie.reset(now);
    this.zombie.activate(now);
    this.punchClassifier.reset();
    this.defenseDetector.reset();
    this.playerHealth = PLAYER_MAX_HEALTH;
    this.hitCount = 0;
    this.dom.hitCounterEl.textContent = 'Hits: 0';
    this._updatePlayerHealthBar();
    this.state = 'playing';
  }

  // The zombie's rig needs to keep animating (shamble motion) even on
  // frames where no pose is detected, so it's driven by its own rAF loop
  // rather than only ticking inside _onFrame.
  _renderLoop() {
    this._rendering = true;
    const loop = (now) => {
      if (!this._rendering) return;
      if (this.state === 'playing' || this.state === 'win' || this.state === 'lose') {
        this.zombie.update(now);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  _onFrame(screenKeypoints, worldKeypoints, timestampMs) {
    if (this.state !== 'playing') return;

    this.defenseDetector.update(worldKeypoints, screenKeypoints);
    this.dom.guardIndicatorEl.classList.toggle(
      'visible',
      this.defenseDetector.guarding || this.defenseDetector.dodging
    );

    const punches = this.punchClassifier.update(worldKeypoints, timestampMs);
    for (const punch of punches) {
      this._registerHit(punch, timestampMs);
    }
  }

  _registerHit(punch, timestampMs) {
    if (this.zombie.isDead()) return;

    this.hitCount += 1;
    this.dom.hitCounterEl.textContent = `Hits: ${this.hitCount}`;

    const damage = this.zombie.damagePerHit * (PUNCH_DAMAGE_MULTIPLIER[punch.type] ?? 1);
    this.zombie.takeDamage(timestampMs, damage);
    this.zombie.announcePunch(PUNCH_LABELS[punch.type] ?? 'HIT!');

    if (this.zombie.isDead()) {
      this.state = 'win';
      this.zombie.deactivate();
      this.dom.onWin({ hitCount: this.hitCount });
    }
  }

  // Called by the zombie at the moment its punch lands.
  // Returns 'blocked' | 'dodged' | 'hit' so the zombie can show feedback.
  _onZombieStrike() {
    if (this.state !== 'playing') return 'dodged';

    if (this.defenseDetector.guarding) return 'blocked';
    if (this.defenseDetector.dodging) return 'dodged';

    this.playerHealth = Math.max(0, this.playerHealth - VILLAIN_HIT_DAMAGE);
    this._updatePlayerHealthBar();
    this._flashDamage();

    if (this.playerHealth <= 0) {
      this.state = 'lose';
      this.zombie.deactivate();
      this.dom.onLose({ hitCount: this.hitCount });
    }
    return 'hit';
  }

  _updatePlayerHealthBar() {
    const pct = (this.playerHealth / PLAYER_MAX_HEALTH) * 100;
    this.dom.playerHealthFillEl.style.width = `${pct}%`;
  }

  _flashDamage() {
    const el = this.dom.damageFlashEl;
    el.classList.remove('active');
    void el.offsetWidth; // restart animation
    el.classList.add('active');
  }
}
