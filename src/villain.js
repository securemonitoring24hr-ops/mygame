// Pixel-art villain: canvas-rendered sprite, health, and attack AI.
// Sprites are hand-encoded pixel grids drawn to a small canvas and upscaled
// with image-rendering: pixelated (no external assets, works offline).

const PALETTE = {
  K: '#14141f', // outline / dark
  G: '#5aa02c', // orc skin
  g: '#3c6b1e', // skin shade
  R: '#d32f2f', // gi / gloves
  r: '#8e1b1b', // glove shade / belt
  Y: '#ffd400', // eyes
  O: '#ff9100', // eyes (enraged / telegraph)
  W: '#f5f5f5', // teeth / wide eyes
  B: '#26263a', // pants
  H: '#c9a34a', // horns
};

const FRAME_IDLE = [
  '...H............H...',
  '...HH..........HH...',
  '....GGGGGGGGGGGG....',
  '...GGGGGGGGGGGGGG...',
  '...GKYYGGGGGGYYKG...',
  '...GKYYGGGGGGYYKG...',
  '...GGGGGgKKgGGGGG...',
  '...GGKWKWKKWKWKGG...',
  '....GGGGGGGGGGGG....',
  '........GGGG........',
  '..RRRRRRRRRRRRRRRR..',
  '.RRRRRRRRRRRRRRRRRR.',
  '.RRR.RRRRRRRRRR.RRR.',
  '.RRR.RRRRRRRRRR.RRR.',
  '.RRR.rrrrrrrrrr.RRR.',
  '.RRRR.BBBBBBBB.RRRR.',
  '.RRRR.BBBBBBBB.RRRR.',
  '......BBB..BBB......',
  '......BBB..BBB......',
  '......BBB..BBB......',
  '.....KKKK..KKKK.....',
  '.....KKKK..KKKK.....',
];

// Right glove raised beside the head, eyes glowing — the "incoming attack" tell.
const FRAME_WINDUP = [
  '...H............H...',
  '...HH..........HH...',
  '....GGGGGGGGGGGG.RR.',
  '...GGGGGGGGGGGGGGRRR',
  '...GKOOGGGGGGOOKGRRR',
  '...GKOOGGGGGGOOKGRRR',
  '...GGGGGgKKgGGGGGRRR',
  '...GGKWKWKKWKWKGG.RR',
  '....GGGGGGGGGGGG..R.',
  '........GGGG......R.',
  '..RRRRRRRRRRRRRRRR..',
  '.RRRRRRRRRRRRRRRRRR.',
  '.RRR.RRRRRRRRRRRRR..',
  '.RRR.RRRRRRRRRR.....',
  '.RRR.rrrrrrrrrr.....',
  '.RRRR.BBBBBBBB......',
  '.RRRR.BBBBBBBB......',
  '......BBB..BBB......',
  '......BBB..BBB......',
  '......BBB..BBB......',
  '.....KKKK..KKKK.....',
  '.....KKKK..KKKK.....',
];

// Huge glove thrown straight at the camera.
const FRAME_PUNCH = [
  '...H............H...',
  '...HH..........HH...',
  '....GGGGGGGGGGGG....',
  '...GGGGGGGGGGGGGG...',
  '...GKOOGGGGGGOOKG...',
  '...GKOOGGGGGGOOKG...',
  '...GG.RRRRRRRR.GG...',
  '...G.RRRRRRRRRR.G...',
  '.....RRRRRRRRRR.....',
  '....RRRRRRRRRRRR....',
  '....RRRRrrrrRRRR....',
  '....RRRRRRRRRRRR....',
  '.RRR.RRRRRRRRRR.....',
  '.RRR..RRRRRRRR......',
  '.RRR...rrrrrr.......',
  '.RRRR.BBBBBBBB......',
  '.RRRR.BBBBBBBB......',
  '......BBB..BBB......',
  '......BBB..BBB......',
  '......BBB..BBB......',
  '.....KKKK..KKKK.....',
  '.....KKKK..KKKK.....',
];

// Wide white eyes, open mouth — just got punched.
const FRAME_HURT = [
  '...H............H...',
  '...HH..........HH...',
  '....GGGGGGGGGGGG....',
  '...GGGGGGGGGGGGGG...',
  '...GKWWGGGGGGWWKG...',
  '...GKKKGGGGGGKKKG...',
  '...GGGGKKKKGGGGGG...',
  '...GGGKKKKKKGGGGG...',
  '....GGGGGGGGGGGG....',
  '........GGGG........',
  '..RRRRRRRRRRRRRRRR..',
  '.RRRRRRRRRRRRRRRRRR.',
  '.RRR.RRRRRRRRRR.RRR.',
  '.RRR.RRRRRRRRRR.RRR.',
  '.RRR.rrrrrrrrrr.RRR.',
  '.RRRR.BBBBBBBB.RRRR.',
  '.RRRR.BBBBBBBB.RRRR.',
  '......BBB..BBB......',
  '......BBB..BBB......',
  '......BBB..BBB......',
  '.....KKKK..KKKK.....',
  '.....KKKK..KKKK.....',
];

const FRAMES = {
  idle: FRAME_IDLE,
  windup: FRAME_WINDUP,
  punch: FRAME_PUNCH,
  hurt: FRAME_HURT,
  ko: FRAME_HURT,
};

const SPRITE_W = 20;
const SPRITE_H = 22;
const PIXEL = 6; // internal canvas scale; CSS does the final upscale

const HITS_TO_DEFEAT = 8;
const WINDUP_MS = 850;
const STRIKE_HOLD_MS = 380;
const HURT_HOLD_MS = 260;
const ATTACK_DELAY_MIN_MS = 2200;
const ATTACK_DELAY_MAX_MS = 4500;

export class Villain {
  // onStrike() is called at the moment the punch lands; it must return
  // 'hit' | 'blocked' | 'dodged' so the villain can react.
  constructor({ elements, maxHealth = 100, onStrike }) {
    this.el = elements.enemyEl;
    this.canvas = elements.spriteCanvasEl;
    this.healthFillEl = elements.healthFillEl;
    this.arenaEl = elements.arenaEl;
    this.onStrike = onStrike;

    this.canvas.width = SPRITE_W * PIXEL;
    this.canvas.height = SPRITE_H * PIXEL;
    this.ctx = this.canvas.getContext('2d');

    this.maxHealth = maxHealth;
    this.damagePerHit = maxHealth / HITS_TO_DEFEAT;
    this.health = maxHealth;

    this.state = 'idle'; // idle | windup | striking | hurt | ko
    this.stateUntil = 0;
    this.nextAttackAt = 0;
    this.active = false;

    this._drawFrame('idle');
  }

  activate(now) {
    this.active = true;
    this._scheduleNextAttack(now);
  }

  deactivate() {
    this.active = false;
    if (this.state === 'windup' || this.state === 'striking') {
      this._setState('idle', 0);
    }
    this.el.classList.remove('telegraph', 'lunge');
  }

  // Drive the attack state machine; call once per frame.
  update(now) {
    if (!this.active || this.state === 'ko') return;

    if (this.state === 'idle' && now >= this.nextAttackAt) {
      this._setState('windup', now + WINDUP_MS);
      this.el.classList.add('telegraph');
      return;
    }

    if (now < this.stateUntil) return;

    if (this.state === 'windup') {
      this.el.classList.remove('telegraph');
      this.el.classList.add('lunge');
      this._setState('striking', now + STRIKE_HOLD_MS);
      const result = this.onStrike();
      this._spawnPopup(
        result === 'blocked' ? 'BLOCKED!' : result === 'dodged' ? 'DODGED!' : 'OOF!',
        result === 'hit' ? 'popup-player-hit' : 'popup-defended'
      );
    } else if (this.state === 'striking') {
      this.el.classList.remove('lunge');
      this._setState('idle', 0);
      this._scheduleNextAttack(now);
    } else if (this.state === 'hurt') {
      this._setState('idle', 0);
    }
  }

  takeDamage(now, amount = this.damagePerHit) {
    if (this.isDead()) return;

    this.health = Math.max(0, this.health - amount);
    this._updateHealthBar();
    this._playHitEffect();

    if (this.isDead()) {
      this.el.classList.remove('telegraph', 'lunge');
      this.el.classList.add('dead');
      this._setState('ko', Infinity);
    } else if (this.state !== 'windup' && this.state !== 'striking') {
      // getting punched interrupts nothing mid-attack — commit to the swing
      this._setState('hurt', now + HURT_HOLD_MS);
    }
  }

  isDead() {
    return this.health <= 0;
  }

  reset(now) {
    this.health = this.maxHealth;
    this.el.classList.remove('dead', 'telegraph', 'lunge');
    this._setState('idle', 0);
    this._updateHealthBar();
    this._scheduleNextAttack(now);
  }

  _setState(state, until) {
    this.state = state;
    this.stateUntil = until;
    this._drawFrame(state);
  }

  _scheduleNextAttack(now) {
    this.nextAttackAt =
      now + ATTACK_DELAY_MIN_MS + Math.random() * (ATTACK_DELAY_MAX_MS - ATTACK_DELAY_MIN_MS);
  }

  _drawFrame(name) {
    const grid = FRAMES[name] || FRAME_IDLE;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (let y = 0; y < grid.length; y++) {
      const row = grid[y];
      for (let x = 0; x < row.length; x++) {
        const color = PALETTE[row[x]];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x * PIXEL, y * PIXEL, PIXEL, PIXEL);
      }
    }
  }

  _updateHealthBar() {
    const pct = (this.health / this.maxHealth) * 100;
    this.healthFillEl.style.width = `${pct}%`;
  }

  _playHitEffect() {
    this.el.classList.remove('hit');
    void this.el.offsetWidth; // restart animation if mid-play
    this.el.classList.add('hit');
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
