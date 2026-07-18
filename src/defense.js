// Detects whether the player is defending: guarding (both wrists raised to
// face height, like a boxing guard) or dodging (torso leaned well off its
// usual center line).

const MIN_KEYPOINT_SCORE = 0.25;
const BASELINE_ALPHA = 0.02; // slow EMA — the "usual" standing position
const DODGE_OFFSET_FACTOR = 0.55; // shoulder-widths of lean that counts as a dodge

export class DefenseDetector {
  constructor() {
    this.baselineX = null;
    this.guarding = false;
    this.dodging = false;
  }

  update(k) {
    const ls = k.left_shoulder;
    const rs = k.right_shoulder;
    const lw = k.left_wrist;
    const rw = k.right_wrist;

    const shouldersOk =
      ls && rs && ls.score >= MIN_KEYPOINT_SCORE && rs.score >= MIN_KEYPOINT_SCORE;

    // Guard: both wrists visible and above shoulder height (screen y grows down).
    this.guarding =
      shouldersOk &&
      lw && rw &&
      lw.score >= MIN_KEYPOINT_SCORE &&
      rw.score >= MIN_KEYPOINT_SCORE &&
      lw.y < ls.y &&
      rw.y < rs.y;

    if (!shouldersOk) {
      this.dodging = false;
      return;
    }

    const midX = (ls.x + rs.x) / 2;
    const shoulderWidth = Math.max(10, Math.hypot(ls.x - rs.x, ls.y - rs.y));

    if (this.baselineX === null) {
      this.baselineX = midX;
    } else {
      this.baselineX += BASELINE_ALPHA * (midX - this.baselineX);
    }

    this.dodging = Math.abs(midX - this.baselineX) > DODGE_OFFSET_FACTOR * shoulderWidth;
  }

  reset() {
    this.baselineX = null;
    this.guarding = false;
    this.dodging = false;
  }
}
