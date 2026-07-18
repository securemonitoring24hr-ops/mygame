// Detects whether the player is defending: guarding (both wrists raised
// above shoulder height, boxing-guard style — judged along the body's own
// "up" axis so it doesn't break if the player or phone is tilted) or dodging
// (shoulders shifted sideways from their resting position, in camera space).

import { computeBodyFrame, sub, dot } from './bodyFrame.js';

const MIN_VISIBILITY = 0.35;
const BASELINE_ALPHA = 0.02; // slow EMA — the "usual" standing position, in screen space
const DODGE_OFFSET_FACTOR = 0.5; // shoulder-widths of lean that counts as a dodge

export class DefenseDetector {
  constructor() {
    this.baselineScreenX = null;
    this.guarding = false;
    this.dodging = false;
  }

  // worldKeypoints for guard (body-relative), screenKeypoints for dodge (camera-relative).
  update(worldKeypoints, screenKeypoints) {
    this._updateGuard(worldKeypoints);
    this._updateDodge(screenKeypoints);
  }

  _updateGuard(world) {
    const frame = computeBodyFrame(world);
    const lw = world.left_wrist;
    const rw = world.right_wrist;

    if (!frame || !lw || !rw || lw.score < MIN_VISIBILITY || rw.score < MIN_VISIBILITY) {
      this.guarding = false;
      return;
    }

    const lUp = dot(sub(lw, frame.shoulderMid), frame.up);
    const rUp = dot(sub(rw, frame.shoulderMid), frame.up);

    // Both wrists at or above shoulder height along the body's own up axis.
    this.guarding = lUp > -0.05 * frame.scale && rUp > -0.05 * frame.scale;
  }

  _updateDodge(screen) {
    const ls = screen.left_shoulder;
    const rs = screen.right_shoulder;
    const shouldersOk =
      ls && rs && ls.score >= MIN_VISIBILITY && rs.score >= MIN_VISIBILITY;

    if (!shouldersOk) {
      this.dodging = false;
      return;
    }

    const midX = (ls.x + rs.x) / 2;
    const shoulderWidth = Math.max(10, Math.hypot(ls.x - rs.x, ls.y - rs.y));

    if (this.baselineScreenX === null) {
      this.baselineScreenX = midX;
    } else {
      this.baselineScreenX += BASELINE_ALPHA * (midX - this.baselineScreenX);
    }

    this.dodging =
      Math.abs(midX - this.baselineScreenX) > DODGE_OFFSET_FACTOR * shoulderWidth;
  }

  reset() {
    this.baselineScreenX = null;
    this.guarding = false;
    this.dodging = false;
  }
}
