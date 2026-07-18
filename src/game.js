import { PoseTracker } from './pose.js';
import { PunchDetector } from './punchDetector.js';
import { Enemy } from './enemy.js';

// Orchestrates pose tracking -> punch detection -> enemy damage -> win state.
// This is the seam where future features hook in: multiple enemies, levels,
// XP/leveling tied to reps, multiplayer sync, etc.

export class Game {
  constructor(dom) {
    this.dom = dom;

    this.poseTracker = new PoseTracker(dom.videoEl, dom.canvasEl);
    this.punchDetector = new PunchDetector();
    this.enemy = new Enemy({
      elements: {
        enemyEl: dom.enemyEl,
        spriteEl: dom.spriteEl,
        healthFillEl: dom.healthFillEl,
        arenaEl: dom.arenaEl,
      },
    });

    this.hitCount = 0;
    this.state = 'idle'; // idle -> loading -> playing -> win
  }

  async start() {
    this.state = 'loading';
    await this.poseTracker.init();

    this.enemy.reset();
    this.punchDetector.reset();
    this.hitCount = 0;
    this.dom.hitCounterEl.textContent = 'Hits: 0';

    this.state = 'playing';
    this.poseTracker.start((keypointsByName, timestampMs) => {
      this._onFrame(keypointsByName, timestampMs);
    });
  }

  restart() {
    this.enemy.reset();
    this.punchDetector.reset();
    this.hitCount = 0;
    this.dom.hitCounterEl.textContent = 'Hits: 0';
    this.state = 'playing';
  }

  stop() {
    this.poseTracker.stop();
  }

  _onFrame(keypointsByName, timestampMs) {
    if (this.state !== 'playing') return;

    const punches = this.punchDetector.update(keypointsByName, timestampMs);
    for (const punch of punches) {
      this._registerHit(punch);
    }
  }

  _registerHit(punch) {
    this.hitCount += 1;
    this.dom.hitCounterEl.textContent = `Hits: ${this.hitCount}`;
    this.enemy.takeDamage();

    if (this.enemy.isDead()) {
      this.state = 'win';
      this.dom.onWin({ hitCount: this.hitCount });
    }
  }
}
