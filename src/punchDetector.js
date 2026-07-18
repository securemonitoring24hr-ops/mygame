// Simple, forgiving punch detection: a punch is just a fast wrist movement.
// No jab/hook/uppercut classification - speed alone triggers a hit.
//
// Speed is normalized by shoulder width (a rough proxy for torso scale) so
// detection works whether the player is standing close or far from the camera.

const HISTORY_WINDOW_MS = 150;
const SPEED_THRESHOLD = 3.2; // shoulder-widths per second
const COOLDOWN_MS = 350; // per-wrist, prevents one swing counting as many hits
const MIN_KEYPOINT_SCORE = 0.3;
const FALLBACK_SHOULDER_WIDTH_PX = 150; // used if shoulders aren't visible

const WRISTS = ['left_wrist', 'right_wrist'];

export class PunchDetector {
  constructor() {
    this.history = { left_wrist: [], right_wrist: [] };
    this.lastPunchAt = { left_wrist: 0, right_wrist: 0 };
  }

  // Returns an array of punch events for this frame: [{ hand, speed }]
  update(keypointsByName, timestampMs) {
    const events = [];
    const scale = this._estimateScale(keypointsByName);

    for (const wristName of WRISTS) {
      const kp = keypointsByName[wristName];
      if (!kp || kp.score < MIN_KEYPOINT_SCORE) continue;

      const hist = this.history[wristName];
      hist.push({ x: kp.x, y: kp.y, t: timestampMs });
      while (hist.length > 0 && timestampMs - hist[0].t > HISTORY_WINDOW_MS) {
        hist.shift();
      }

      if (hist.length < 2) continue;
      if (timestampMs - this.lastPunchAt[wristName] < COOLDOWN_MS) continue;

      const oldest = hist[0];
      const newest = hist[hist.length - 1];
      const dt = (newest.t - oldest.t) / 1000;
      if (dt <= 0) continue;

      const dx = newest.x - oldest.x;
      const dy = newest.y - oldest.y;
      const distance = Math.hypot(dx, dy);
      const speed = distance / scale / dt; // shoulder-widths per second

      if (speed > SPEED_THRESHOLD) {
        this.lastPunchAt[wristName] = timestampMs;
        hist.length = 0; // reset so the same swing can't retrigger

        events.push({
          hand: wristName === 'left_wrist' ? 'left' : 'right',
          speed,
        });
      }
    }

    return events;
  }

  _estimateScale(keypointsByName) {
    const ls = keypointsByName.left_shoulder;
    const rs = keypointsByName.right_shoulder;
    if (ls && rs && ls.score >= MIN_KEYPOINT_SCORE && rs.score >= MIN_KEYPOINT_SCORE) {
      const width = Math.hypot(ls.x - rs.x, ls.y - rs.y);
      if (width > 10) return width;
    }
    return FALLBACK_SHOULDER_WIDTH_PX;
  }

  reset() {
    this.history = { left_wrist: [], right_wrist: [] };
    this.lastPunchAt = { left_wrist: 0, right_wrist: 0 };
  }
}
