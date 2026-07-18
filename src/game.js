import { PoseTracker } from './pose.js';
import { PunchDetector } from './punchDetector.js';
import { DefenseDetector } from './defense.js';
import { Villain } from './villain.js';

// Orchestrates pose tracking -> punch/defense detection -> villain AI ->
// two-way damage -> win/lose state.

const PLAYER_MAX_HEALTH = 100;
const VILLAIN_HIT_DAMAGE = 15; // ~7 unblocked hits and you're out

export class Game {
  constructor(dom) {
    this.dom = dom;

    this.poseTracker = new PoseTracker(dom.videoEl, dom.canvasEl);
    this.punchDetector = new PunchDetector();
    this.defenseDetector = new DefenseDetector();
    this.villain = new Villain({
      elements: {
        enemyEl: dom.enemyEl,
        spriteCanvasEl: dom.spriteCanvasEl,
        healthFillEl: dom.healthFillEl,
        arenaEl: dom.arenaEl,
      },
      onStrike: () => this._onVillainStrike(),
    });

    this.playerHealth = PLAYER_MAX_HEALTH;
    this.hitCount = 0;
    this.state = 'idle'; // idle -> loading -> playing -> win | lose
  }

  async start() {
    this.state = 'loading';
    await this.poseTracker.init();

    this._resetRound();

    this.poseTracker.start((keypointsByName, timestampMs) => {
      this._onFrame(keypointsByName, timestampMs);
    });
  }

  restart() {
    this._resetRound();
  }

  stop() {
    this.poseTracker.stop();
    this.villain.deactivate();
  }

  _resetRound() {
    const now = performance.now();
    this.villain.reset(now);
    this.villain.activate(now);
    this.punchDetector.reset();
    this.defenseDetector.reset();
    this.playerHealth = PLAYER_MAX_HEALTH;
    this.hitCount = 0;
    this.dom.hitCounterEl.textContent = 'Hits: 0';
    this._updatePlayerHealthBar();
    this.state = 'playing';
  }

  _onFrame(keypointsByName, timestampMs) {
    if (this.state !== 'playing') return;

    this.defenseDetector.update(keypointsByName);
    this.dom.guardIndicatorEl.classList.toggle(
      'visible',
      this.defenseDetector.guarding || this.defenseDetector.dodging
    );

    const punches = this.punchDetector.update(keypointsByName, timestampMs);
    for (const punch of punches) {
      this._registerHit(punch, timestampMs);
    }

    this.villain.update(timestampMs);
  }

  _registerHit(punch, timestampMs) {
    if (this.villain.isDead()) return;

    this.hitCount += 1;
    this.dom.hitCounterEl.textContent = `Hits: ${this.hitCount}`;
    this.villain.takeDamage(timestampMs);

    if (this.villain.isDead()) {
      this.state = 'win';
      this.villain.deactivate();
      this.dom.onWin({ hitCount: this.hitCount });
    }
  }

  // Called by the villain at the moment its punch lands.
  // Returns 'blocked' | 'dodged' | 'hit' so the villain can show feedback.
  _onVillainStrike() {
    if (this.state !== 'playing') return 'dodged';

    if (this.defenseDetector.guarding) return 'blocked';
    if (this.defenseDetector.dodging) return 'dodged';

    this.playerHealth = Math.max(0, this.playerHealth - VILLAIN_HIT_DAMAGE);
    this._updatePlayerHealthBar();
    this._flashDamage();

    if (this.playerHealth <= 0) {
      this.state = 'lose';
      this.villain.deactivate();
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
