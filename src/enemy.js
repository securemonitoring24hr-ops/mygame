// A single enemy: health tracking + DOM rendering (sprite, health bar, hit fx).
// Kept deliberately dumb (no AI/attacks yet) - just something to punch.

const HITS_TO_DEFEAT = 8;

export class Enemy {
  constructor({ elements, maxHealth = 100 }) {
    this.el = elements.enemyEl;
    this.spriteEl = elements.spriteEl;
    this.healthFillEl = elements.healthFillEl;
    this.arenaEl = elements.arenaEl;

    this.maxHealth = maxHealth;
    this.damagePerHit = maxHealth / HITS_TO_DEFEAT;
    this.health = maxHealth;
  }

  takeDamage(amount = this.damagePerHit) {
    if (this.isDead()) return;

    this.health = Math.max(0, this.health - amount);
    this._updateHealthBar();
    this._playHitEffect();

    if (this.isDead()) {
      this.el.classList.add('dead');
      this.spriteEl.textContent = '💫';
    }
  }

  isDead() {
    return this.health <= 0;
  }

  reset() {
    this.health = this.maxHealth;
    this.el.classList.remove('dead');
    this.spriteEl.textContent = '🥷';
    this._updateHealthBar();
  }

  _updateHealthBar() {
    const pct = (this.health / this.maxHealth) * 100;
    this.healthFillEl.style.width = `${pct}%`;
  }

  _playHitEffect() {
    this.el.classList.remove('hit');
    // force reflow so the animation restarts if it's already mid-play
    void this.el.offsetWidth;
    this.el.classList.add('hit');

    const popup = document.createElement('div');
    popup.className = 'hit-popup';
    popup.textContent = 'HIT!';
    this.arenaEl.appendChild(popup);
    setTimeout(() => popup.remove(), 550);
  }
}
