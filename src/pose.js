// Webcam + MoveNet pose tracking. Depends on the global `tf` and `poseDetection`
// objects loaded via <script> tags in index.html (TensorFlow.js UMD builds).

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

const MIN_KEYPOINT_SCORE = 0.3;

export class PoseTracker {
  constructor(videoEl, canvasEl) {
    this.videoEl = videoEl;
    this.canvasEl = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.detector = null;
    this.running = false;
    this.rafId = null;
  }

  async requestWebcam() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
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
    await tf.setBackend('webgl');
    await tf.ready();

    this.detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
    );
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

      const poses = await this.detector.estimatePoses(this.videoEl, {
        flipHorizontal: false,
      });

      this.ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);

      if (poses.length > 0) {
        const keypointsByName = {};
        for (const kp of poses[0].keypoints) {
          keypointsByName[kp.name] = kp;
        }

        this._drawSkeleton(keypointsByName);
        onPose(keypointsByName, performance.now());
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
