import { PoseTracker } from './pose.js';
import { PunchClassifier } from './punchClassifier.js';
import { DefenseDetector } from './defense.js';
import { GameScene } from './scene.js';
import { Survivor } from './survivor.js';
import { ZombieActor } from './zombieActor.js';

// Orchestrates pose tracking -> punch classification / defense detection ->
// survivor avatar mirroring -> zombie AI -> two-way damage -> win/lose state,
// all inside one Three.js scene.

const PLAYER_MAX_HEALTH = 100;
const ZOMBIE_HIT_DAMAGE = 15; // ~7 unblocked hits and you're out

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

    this.scene = new GameScene(dom.gameCanvasEl);
    this.survivor = new Survivor();
    this.zombie = new ZombieActor({
      elements: {
        warningEl: dom.warningEl,
        healthFillEl: dom.healthFillEl,
        arenaEl: dom.arenaEl,
      },
      onStrike: () => this._onZombieStrike(),
    });

    this.playerHealth = PLAYER_MAX_HEALTH;
    this.hitCount = 0;
    this.state = 'idle'; // idle -> loading -> playing -> win | lose
    this._lastFrameTime = 0;

    window.addEventListener('resize', () => this.scene.resize());
  }

  async start(onProgress) {
    this.state = 'loading';

    // Camera+model and 3D assets load in parallel; both are needed.
    const report = (msg) => onProgress && onProgress(msg);
    await Promise.all([
      this.poseTracker.init().then(() => report('camera + pose model ready')),
      this.scene
        .load((done, total) => report(`environment ${done}/${total}`))
        .then(() => report('environment ready')),
      this.survivor.load(this.scene).then(() => report('survivor ready')),
      this.zombie.load(this.scene).then(() => report('zombie ready')),
    ]);
    this.scene.resize();

    this._resetRound();

    this.poseTracker.start((screenKeypoints, worldKeypoints, timestampMs) => {
      this._onPose(screenKeypoints, worldKeypoints, timestampMs);
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
    this.survivor.reset();
    this.punchClassifier.reset();
    this.defenseDetector.reset();
    this.playerHealth = PLAYER_MAX_HEALTH;
    this.hitCount = 0;
    this.dom.hitCounterEl.textContent = 'Hits: 0';
    this._updatePlayerHealthBar();
    this.state = 'playing';
  }

  // The 3D world animates every frame regardless of whether a pose came in.
  _renderLoop() {
    this._rendering = true;
    this._lastFrameTime = performance.now();
    const loop = (now) => {
      if (!this._rendering) return;
      const dt = Math.min(0.1, (now - this._lastFrameTime) / 1000);
      this._lastFrameTime = now;

      this.survivor.update(dt);
      this.zombie.update(now, dt);
      this.scene.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  _onPose(screenKeypoints, worldKeypoints, timestampMs) {
    if (this.state !== 'playing') return;

    this.defenseDetector.update(worldKeypoints, screenKeypoints);
    const defending = this.defenseDetector.guarding || this.defenseDetector.dodging;
    this.dom.guardIndicatorEl.classList.toggle('visible', defending);

    this.survivor.setGuarding(this.defenseDetector.guarding);
    this.survivor.setDodge(this.defenseDetector.dodgeDirection);

    const punches = this.punchClassifier.update(worldKeypoints, timestampMs);
    for (const punch of punches) {
      this._registerHit(punch, timestampMs);
    }
  }

  _registerHit(punch, timestampMs) {
    if (this.zombie.isDead()) return;

    this.hitCount += 1;
    this.dom.hitCounterEl.textContent = `Hits: ${this.hitCount}`;
    this.survivor.onPunch(punch);

    const damage = this.zombie.damagePerHit * (PUNCH_DAMAGE_MULTIPLIER[punch.type] ?? 1);
    this.zombie.takeDamage(timestampMs, damage);
    this.zombie.announcePunch(PUNCH_LABELS[punch.type] ?? 'HIT!');

    if (this.zombie.isDead()) {
      this.state = 'win';
      this.zombie.deactivate();
      this.survivor.onWin();
      this.dom.onWin({ hitCount: this.hitCount });
    }
  }

  // Called by the zombie at the moment its punch lands.
  _onZombieStrike() {
    if (this.state !== 'playing') return 'dodged';

    if (this.defenseDetector.guarding) return 'blocked';
    if (this.defenseDetector.dodging) return 'dodged';

    this.playerHealth = Math.max(0, this.playerHealth - ZOMBIE_HIT_DAMAGE);
    this._updatePlayerHealthBar();
    this._flashDamage();
    this.survivor.onHit();

    if (this.playerHealth <= 0) {
      this.state = 'lose';
      this.zombie.deactivate();
      this.survivor.onDeath();
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
