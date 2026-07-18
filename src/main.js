import { Game } from './game.js';

const startScreen = document.getElementById('start-screen');
const loadingScreen = document.getElementById('loading-screen');
const winScreen = document.getElementById('win-screen');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const startError = document.getElementById('start-error');
const winStats = document.getElementById('win-stats');

const dom = {
  videoEl: document.getElementById('webcam'),
  canvasEl: document.getElementById('overlay'),
  enemyEl: document.getElementById('enemy'),
  spriteEl: document.getElementById('enemy-sprite'),
  healthFillEl: document.getElementById('health-bar-fill'),
  arenaEl: document.getElementById('arena'),
  hitCounterEl: document.getElementById('hit-counter'),
  onWin: ({ hitCount }) => {
    winStats.textContent = `Defeated in ${hitCount} punches.`;
    winScreen.classList.remove('hidden');
  },
};

const game = new Game(dom);

startBtn.addEventListener('click', async () => {
  startError.textContent = '';
  startBtn.disabled = true;
  startScreen.classList.add('hidden');
  loadingScreen.classList.remove('hidden');

  try {
    await game.start();
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

function describeError(err) {
  if (err && err.name === 'NotAllowedError') {
    return 'Camera access was denied. Please allow camera permission and try again.';
  }
  if (err && err.name === 'NotFoundError') {
    return 'No camera was found on this device.';
  }
  return 'Something went wrong starting the camera or pose model. Please try again.';
}
