// Webcam + MediaPipe PoseLandmarker (BlazePose) tracking.
//
// Switched from MoveNet to BlazePose specifically because MoveNet only gives
// 2D (x, y) keypoints — there's no way to tell a jab from a hook from that,
// they all just look like "fast wrist movement". BlazePose also emits
// `worldLandmarks`: real 3D coordinates (meters, hip-centered) per joint,
// which is what makes actual punch-type classification possible (see
// bodyFrame.js + punchClassifier.js).
//
// Uses the "lite" model variant and a modest camera resolution — both
// chosen for mobile framerate, since this now runs alongside a Three.js
// render loop for the zombie every frame too.

import {
  FilesetResolver,
  PoseLandmarker,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm';

const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

// BlazePose's 33 landmarks, named the same as the old MoveNet subset we use
// elsewhere so downstream code (skeleton drawing, classifiers) didn't need
// to change its vocabulary.
const LANDMARK_NAMES = {
  0: 'nose',
  11: 'left_shoulder',
  12: 'right_shoulder',
  13: 'left_elbow',
  14: 'right_elbow',
  15: 'left_wrist',
  16: 'right_wrist',
  23: 'left_hip',
  24: 'right_hip',
  25: 'left_knee',
  26: 'right_knee',
  27: 'left_ankle',
  28: 'right_ankle',
};

const SKELETON_CONNECTIONS = [
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'],
  ['right_knee', 'right_ankle'],
];

const MIN_VISIBILITY = 0.4;
const SMOOTHING_ALPHA = 0.5; // EMA over screen-space points, tames camera jitter

export class PoseTracker {
  constructor(videoEl, canvasEl) {
    this.videoEl = videoEl;
    this.canvasEl = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.landmarker = null;
    this.running = false;
    this.rafId = null;
    this.smoothedScreen = {}; // name -> {x, y} in canvas pixels
    this.lastVideoTime = -1;
  }

  async requestWebcam() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });
    this.videoEl.srcObject = stream;

    await new Promise((resolve) => {
      this.videoEl.onloadedmetadata = () => resolve();
    });
    await this.videoEl.play();

    this.canvasEl.width = this.videoEl.videoWidth;
    this.canvasEl.height = this.videoEl.videoHeight;
  }

  async loadModel() {
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE);

    const tryCreate = (delegate) =>
      PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
      });

    try {
      this.landmarker = await tryCreate('GPU');
    } catch (_) {
      this.landmarker = await tryCreate('CPU');
    }
  }

  async init() {
    await this.requestWebcam();
    await this.loadModel();
  }

  // Begins the detection loop. onPose(screenKeypoints, worldKeypoints, timestampMs)
  // fires every frame a pose is detected. screenKeypoints are in canvas pixel
  // space (for drawing); worldKeypoints are 3D meters, hip-centered (for
  // punch/guard classification).
  start(onPose) {
    this.running = true;

    const loop = () => {
      if (!this.running) return;

      if (this.videoEl.readyState >= 2 && this.videoEl.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = this.videoEl.currentTime;
        const result = this.landmarker.detectForVideo(this.videoEl, performance.now());

        this.ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);

        if (result.landmarks.length > 0) {
          const screenKeypoints = this._toScreenKeypoints(result.landmarks[0]);
          const worldKeypoints = this._toWorldKeypoints(result.worldLandmarks[0]);

          this._drawSkeleton(screenKeypoints);
          onPose(screenKeypoints, worldKeypoints, performance.now());
        }
      }

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    const stream = this.videoEl.srcObject;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  }

  _toScreenKeypoints(landmarks) {
    const w = this.canvasEl.width;
    const h = this.canvasEl.height;
    const out = {};

    for (const [idx, name] of Object.entries(LANDMARK_NAMES)) {
      const lm = landmarks[idx];
      if (!lm) continue;
      const raw = { x: lm.x * w, y: lm.y * h };
      out[name] = { name, score: lm.visibility ?? 1, ...this._smoothScreen(name, raw) };
    }
    return out;
  }

  _smoothScreen(name, raw) {
    const prev = this.smoothedScreen[name];
    if (!prev) {
      this.smoothedScreen[name] = { x: raw.x, y: raw.y };
      return raw;
    }
    prev.x += SMOOTHING_ALPHA * (raw.x - prev.x);
    prev.y += SMOOTHING_ALPHA * (raw.y - prev.y);
    return { x: prev.x, y: prev.y };
  }

  _toWorldKeypoints(worldLandmarks) {
    const out = {};
    for (const [idx, name] of Object.entries(LANDMARK_NAMES)) {
      const lm = worldLandmarks[idx];
      if (!lm) continue;
      out[name] = { name, score: lm.visibility ?? 1, x: lm.x, y: lm.y, z: lm.z };
    }
    return out;
  }

  _drawSkeleton(keypointsByName) {
    const ctx = this.ctx;

    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.7)';
    for (const [a, b] of SKELETON_CONNECTIONS) {
      const ka = keypointsByName[a];
      const kb = keypointsByName[b];
      if (!ka || !kb) continue;
      if (ka.score < MIN_VISIBILITY || kb.score < MIN_VISIBILITY) continue;

      ctx.beginPath();
      ctx.moveTo(ka.x, ka.y);
      ctx.lineTo(kb.x, kb.y);
      ctx.stroke();
    }

    for (const kp of Object.values(keypointsByName)) {
      if (kp.score < MIN_VISIBILITY) continue;
      const isWrist = kp.name === 'left_wrist' || kp.name === 'right_wrist';

      ctx.beginPath();
      ctx.arc(kp.x, kp.y, isWrist ? 9 : 4, 0, 2 * Math.PI);
      ctx.fillStyle = isWrist ? '#ffd400' : 'rgba(0, 229, 255, 0.8)';
      ctx.fill();
    }
  }
}
