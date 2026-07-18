// Webcam + MoveNet pose tracking. Depends on the global `tf` and `poseDetection`
// objects loaded via <script> tags in index.html (TensorFlow.js UMD builds).
//
// Tuned for mobile: low camera resolution (less work per frame), MoveNet's
// built-in temporal smoothing, plus a light EMA filter over keypoints to tame
// the jitter typical of phone cameras in imperfect lighting.

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

const MIN_KEYPOINT_SCORE = 0.25;
const SMOOTHING_ALPHA = 0.55; // 1 = raw (jittery), lower = smoother but laggier

export class PoseTracker {
  constructor(videoEl, canvasEl) {
    this.videoEl = videoEl;
    this.canvasEl = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.detector = null;
    this.running = false;
    this.rafId = null;
    this.smoothed = {}; // name -> {x, y}
  }

  async requestWebcam() {
    // 640x480 is plenty for MoveNet Lightning (it downscales to 192x192
    // internally) and keeps frame grabs cheap on phone GPUs.
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
    try {
      await tf.setBackend('webgl');
    } catch (_) {
      await tf.setBackend('cpu');
    }
    await tf.ready();

    this.detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        enableSmoothing: true,
      }
    );

    // Warm up the model so the first real frame isn't a multi-second stall.
    if (this.videoEl.readyState >= 2) {
      await this.detector.estimatePoses(this.videoEl, { flipHorizontal: false });
    }
  }

  async init() {
    await this.requestWebcam();
    await this.loadModel();
  }

  // Begins the render/detection loop. onPose(keypointsByName, timestampMs) fires every frame.
  start(onPose) {
    this.running = true;

    const loop = async () => {
      if (!this.running) return;

      if (this.videoEl.readyState >= 2) {
        const poses = await this.detector.estimatePoses(this.videoEl, {
          flipHorizontal: false,
        });

        this.ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);

        if (poses.length > 0) {
          const keypointsByName = {};
          for (const kp of poses[0].keypoints) {
            keypointsByName[kp.name] = this._smooth(kp);
          }

          this._drawSkeleton(keypointsByName);
          onPose(keypointsByName, performance.now());
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

  _smooth(kp) {
    // Low-confidence detections reset the filter instead of dragging it around.
    if (kp.score < MIN_KEYPOINT_SCORE) {
      delete this.smoothed[kp.name];
      return kp;
    }

    const prev = this.smoothed[kp.name];
    if (!prev) {
      this.smoothed[kp.name] = { x: kp.x, y: kp.y };
      return kp;
    }

    prev.x += SMOOTHING_ALPHA * (kp.x - prev.x);
    prev.y += SMOOTHING_ALPHA * (kp.y - prev.y);
    return { name: kp.name, score: kp.score, x: prev.x, y: prev.y };
  }

  _drawSkeleton(keypointsByName) {
    const ctx = this.ctx;

    ctx.lineWidth = 4;
    ctx.strokeStyle = '#00e5ff';
    for (const [a, b] of SKELETON_CONNECTIONS) {
      const ka = keypointsByName[a];
      const kb = keypointsByName[b];
      if (!ka || !kb) continue;
      if (ka.score < MIN_KEYPOINT_SCORE || kb.score < MIN_KEYPOINT_SCORE) continue;

      ctx.beginPath();
      ctx.moveTo(ka.x, ka.y);
      ctx.lineTo(kb.x, kb.y);
      ctx.stroke();
    }

    for (const kp of Object.values(keypointsByName)) {
      if (kp.score < MIN_KEYPOINT_SCORE) continue;
      const isWrist = kp.name === 'left_wrist' || kp.name === 'right_wrist';

      ctx.beginPath();
      ctx.arc(kp.x, kp.y, isWrist ? 10 : 5, 0, 2 * Math.PI);
      ctx.fillStyle = isWrist ? '#ffd400' : '#00e5ff';
      ctx.fill();
    }
  }
}
