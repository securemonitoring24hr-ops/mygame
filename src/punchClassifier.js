// Classifies punches into jab/cross (straight), hook, or uppercut using real
// 3D wrist motion, decomposed onto the player's own body-local axes (see
// bodyFrame.js) so it works regardless of which way the player is facing or
// how the phone is angled.
//
// The core idea, per boxing biomechanics:
//   - straight (jab/cross): hand drives mostly along the forward axis, arm
//     extends (elbow angle increases a lot).
//   - hook: hand sweeps mostly along the lateral axis in an arc, elbow stays
//     roughly bent throughout (it doesn't extend much).
//   - uppercut: hand rises mostly along the vertical axis, starting below
//     shoulder height and driving upward.
//
// This is a heuristic, not a trained classifier — but it's judging actual
// punch shape instead of "any fast wrist movement", which is what made the
// old detector unable to tell punches apart at all.

import { computeBodyFrame, sub, dot, length } from './bodyFrame.js';

const HISTORY_WINDOW_MS = 220;
const MIN_VISIBILITY = 0.4;

const SPEED_THRESHOLD = 2.6; // body-scales per second
const MIN_DISPLACEMENT = 0.4; // body-scales
const COOLDOWN_MS = 320;

const WRISTS = [
  { wrist: 'left_wrist', elbow: 'left_elbow', shoulder: 'left_shoulder' },
  { wrist: 'right_wrist', elbow: 'right_elbow', shoulder: 'right_shoulder' },
];

function elbowAngle(shoulder, elbow, wrist) {
  const a = sub(shoulder, elbow);
  const b = sub(wrist, elbow);
  const la = length(a);
  const lb = length(b);
  if (la < 1e-6 || lb < 1e-6) return null;
  const cos = Math.max(-1, Math.min(1, dot(a, b) / (la * lb)));
  return Math.acos(cos); // radians; ~0 = fully folded, ~PI = fully straight
}

export class PunchClassifier {
  constructor() {
    this.history = { left_wrist: [], right_wrist: [] };
    this.lastPunchAt = { left_wrist: 0, right_wrist: 0 };
  }

  // Returns an array of punch events: [{ hand, type, speed }]
  // type is 'straight' | 'hook' | 'uppercut'.
  update(worldKeypoints, timestampMs) {
    const events = [];
    const frame = computeBodyFrame(worldKeypoints);
    if (!frame) return events;

    for (const { wrist, elbow, shoulder } of WRISTS) {
      const wristKp = worldKeypoints[wrist];
      const elbowKp = worldKeypoints[elbow];
      const shoulderKp = worldKeypoints[shoulder];

      if (!wristKp || wristKp.score < MIN_VISIBILITY) {
        this.history[wrist].length = 0;
        continue;
      }

      const hist = this.history[wrist];
      hist.push({ pos: wristKp, elbow: elbowKp, shoulder: shoulderKp, t: timestampMs });
      while (hist.length > 0 && timestampMs - hist[0].t > HISTORY_WINDOW_MS) {
        hist.shift();
      }

      if (hist.length < 3) continue;
      if (timestampMs - this.lastPunchAt[wrist] < COOLDOWN_MS) continue;

      const oldest = hist[0];
      const newest = hist[hist.length - 1];
      const dt = (newest.t - oldest.t) / 1000;
      if (dt <= 0) continue;

      const disp = sub(newest.pos, oldest.pos);
      const distance = length(disp) / frame.scale;
      const speed = distance / dt;

      if (speed <= SPEED_THRESHOLD || distance <= MIN_DISPLACEMENT) continue;

      this.lastPunchAt[wrist] = timestampMs;

      const type = this._classify(disp, frame, oldest, newest);

      hist.length = 0; // reset so the same swing can't retrigger

      events.push({
        hand: wrist === 'left_wrist' ? 'left' : 'right',
        type,
        speed,
      });
    }

    return events;
  }

  _classify(disp, frame, oldest, newest) {
    const fComp = dot(disp, frame.forward);
    const rComp = dot(disp, frame.right);
    const uComp = dot(disp, frame.up);

    const absF = Math.abs(fComp);
    const absR = Math.abs(rComp);
    const absU = Math.abs(uComp);

    // Uppercut: dominant, upward vertical drive.
    if (absU >= absF && absU >= absR && uComp > 0) {
      return 'uppercut';
    }

    // Elbow extension distinguishes a straight punch (arm unfolds a lot)
    // from a hook (elbow stays roughly bent, hand just sweeps sideways).
    let elbowExtension = 0;
    if (oldest.shoulder && oldest.elbow && newest.shoulder && newest.elbow) {
      const startAngle = elbowAngle(oldest.shoulder, oldest.elbow, oldest.pos);
      const endAngle = elbowAngle(newest.shoulder, newest.elbow, newest.pos);
      if (startAngle !== null && endAngle !== null) {
        elbowExtension = endAngle - startAngle;
      }
    }

    if (absR > absF && elbowExtension < 0.5) {
      return 'hook';
    }

    return 'straight';
  }

  reset() {
    this.history = { left_wrist: [], right_wrist: [] };
    this.lastPunchAt = { left_wrist: 0, right_wrist: 0 };
  }
}
