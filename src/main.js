import { Game } from './game.js';

const startScreen = document.getElementById('start-screen');
const loadingScreen = document.getElementById('loading-screen');
const loadingDetail = document.getElementById('loading-detail');
const winScreen = document.getElementById('win-screen');
const loseScreen = document.getElementById('lose-screen');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const retryBtn = document.getElementById('retry-btn');
const startError = document.getElementById('start-error');
const winStats = document.getElementById('win-stats');
const loseStats = document.getElementById('lose-stats');

const dom = {
  videoEl: document.getElementById('webcam'),
  canvasEl: document.getElementById('overlay'),
  gameCanvasEl: document.getElementById('game-canvas'),
  warningEl: document.getElementById('attack-warning'),
  healthFillEl: document.getElementById('health-bar-fill'),
  playerHealthFillEl: document.getElementById('player-health-fill'),
  arenaEl: document.getElementById('arena'),
  hitCounterEl: document.getElementById('hit-counter'),
  guardIndicatorEl: document.getElementById('guard-indicator'),
  damageFlashEl: document.getElementById('damage-flash'),
  onWin: ({ hitCount }) => {
    winStats.textContent = `Put down in ${hitCount} punches. The radio crackles a little clearer tonight.`;
    winScreen.classList.remove('hidden');
  },
  onLose: ({ hitCount }) => {
    loseStats.textContent = `You landed ${hitCount} punches before going down. Keep your guard up!`;
    loseScreen.classList.remove('hidden');
  },
};

const game = new Game(dom);

startBtn.addEventListener('click', async () => {
  startError.textContent = '';
  startBtn.disabled = true;
  startScreen.classList.add('hidden');
  loadingScreen.classList.remove('hidden');

  try {
    await game.start((msg) => {
      loadingDetail.textContent = msg;
    });
    loadingScreen.classList.add('hidden');
  } catch (err) {
    console.error(err);
    loadingScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    startBtn.disabled = false;
    startError.textContent = describeError(err);
  }
});

restartBtn.addEventListener('click', () => {
  winScreen.classList.add('hidden');
  game.restart();
});

retryBtn.addEventListener('click', () => {
  loseScreen.classList.add('hidden');
  game.restart();
});

function describeError(err) {
  if (err && err.name === 'NotAllowedError') {
    return 'Camera access was denied. Please allow camera permission and try again.';
  }
  if (err && err.name === 'NotFoundError') {
    return 'No camera was found on this device.';
  }
  return 'Something went wrong starting the camera, pose model, or 3D assets. Please try again.';
}
