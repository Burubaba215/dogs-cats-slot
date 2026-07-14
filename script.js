const ASSET = "assets/";
const GAME_DURATION_MS = 120000;
const MAX_ACTIVE_BALLS = 6;
const STORAGE_KEY = "wannyan-pachinko-physics-state-v2";
const CAT_TARGET_SPAWN_RATE = 0.1;
const CAT_TARGET_HIT_RATE = 0.7;
const DOG_REACH_VIDEO_RATE = 0.08;
const DOG_REACH_VIDEO_HIT_RATE = 0.7;
const CAT_MODE_VIDEO_RATE = 0.1;
const CAT_MODE_VIDEO_HIT_RATE = 0.7;

const dogEvents = [
  { title: "チワワが走る！", label: "犬リーチ", image: "dog_reach_chihuahua.png" },
  { title: "柴犬ダッシュ！", label: "犬リーチ", image: "dog_reach_shiba.png" },
  { title: "ゴールデン救出！", label: "犬リーチ", image: "dog_reach_golden.png" },
  { title: "秋田犬・忠犬リーチ！", label: "激熱犬リーチ", image: "dog_reach_akita.png" },
  { title: "犬群通過！", label: "大チャンス", image: "dog_reach_pack.png" },
];

const catEvents = [
  { title: "猫じゃらしリーチ！", label: "猫リーチ", image: "cat_reach_toy.png" },
  { title: "毛糸ころころ！", label: "猫リーチ", image: "hold_yarn.png" },
  { title: "段ボールリーチ！", label: "猫リーチ", image: "cat_reach_box.png" },
  { title: "招き猫出現！", label: "激熱猫リーチ", image: "cat_reach_lucky.png" },
];

const reelSymbols = ["symbol_esa.png", "symbol_hone.png", "symbol_inu7.png"];

const defaultState = {
  mode: "dog",
  balls: 60,
  totalSpins: 0,
  catLeft: 0,
  streak: 0,
};

let state = loadState();
let reelBusy = false;
let holdQueue = [];
let activeBalls = [];
let dragging = null;
let nextBallId = 1;
let catTarget = null;
let gameOver = false;
let gameStartedAt = Date.now();
let audioCtx = null;
let lastAimSoundAt = 0;
let lastBounceSoundAt = 0;
let gongPlayed = false;
let timeUpSoundPlayed = false;
let bgmStarted = false;
let currentBgmMode = null;
let reelSpinAudio = null;
const bgmTracks = {};

const els = {
  balls: document.querySelector("#balls"),
  modeName: document.querySelector("#modeName"),
  spinCount: document.querySelector("#spinCount"),
  catLeft: document.querySelector("#catLeft"),
  streak: document.querySelector("#streak"),
  holdCount: document.querySelector("#holdCount"),
  machine: document.querySelector("#machine"),
  machineTimer: document.querySelector("#machineTimer"),
  modeTelop: document.querySelector("#modeTelop"),
  modeBadge: document.querySelector("#modeBadge"),
  lcdLead: document.querySelector("#lcdLead"),
  lcdTitle: document.querySelector("#lcdTitle"),
  reel1: document.querySelector("#reel1"),
  reel2: document.querySelector("#reel2"),
  reel3: document.querySelector("#reel3"),
  reachImage: document.querySelector("#reachImage"),
  reachLabel: document.querySelector("#reachLabel"),
  reachTitle: document.querySelector("#reachTitle"),
  canvas: document.querySelector("#gameCanvas"),
  jackpotOverlay: document.querySelector("#jackpotOverlay"),
  jackpotImage: document.querySelector("#jackpotImage"),
  jackpotText: document.querySelector("#jackpotText"),
  jackpotSubText: document.querySelector("#jackpotSubText"),
  reachVideoOverlay: document.querySelector("#reachVideoOverlay"),
  reachVideo: document.querySelector("#reachVideo"),
  gameOverOverlay: document.querySelector("#gameOverOverlay"),
  finalScoreText: document.querySelector("#finalScoreText"),
  retryBtn: document.querySelector("#retryBtn"),
  quickRetryBtn: document.querySelector("#quickRetryBtn"),
};

const ctx = els.canvas.getContext("2d");
const spotImage = new Image();
spotImage.src = asset("spot_bowl.png");
const ballImage = new Image();
ballImage.src = asset("pachinko_ball.png");
const catTargetImage = new Image();
catTargetImage.src = asset("cat_target.png");
const board = {
  width: 760,
  height: 720,
  launchers: [
    { id: "left", x: 148, y: 604, side: -1, label: "L" },
    { id: "right", x: 612, y: 604, side: 1, label: "R" },
  ],
  gravity: 0.23,
  damping: 0.992,
  pins: [],
  bumpers: [],
  spot: { x: 380, y: 568, r: 50 },
};

function asset(name) {
  return `${ASSET}${name}`;
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...defaultState, ...JSON.parse(saved) } : { ...defaultState };
  } catch {
    return { ...defaultState };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatBalls(value) {
  return `${value.toLocaleString("ja-JP")}玉`;
}

function timeLeftMs() {
  return Math.max(0, GAME_DURATION_MS - (Date.now() - gameStartedAt));
}

function formatTime(ms) {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function setImage(el, file) {
  el.src = asset(file);
}

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function tone({ type = "sine", freq = 440, endFreq = freq, duration = 0.12, gain = 0.08, delay = 0 }) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  const amp = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(gain, now + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(amp);
  amp.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function noise({ duration = 0.08, gain = 0.08, filter = 1600 }) {
  if (!audioCtx) return;
  const samples = Math.max(1, Math.floor(audioCtx.sampleRate * duration));
  const buffer = audioCtx.createBuffer(1, samples, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < samples; i += 1) data[i] = Math.random() * 2 - 1;
  const source = audioCtx.createBufferSource();
  const amp = audioCtx.createGain();
  const biquad = audioCtx.createBiquadFilter();
  biquad.type = "bandpass";
  biquad.frequency.value = filter;
  biquad.Q.value = 5;
  amp.gain.setValueAtTime(gain, audioCtx.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
  source.buffer = buffer;
  source.connect(biquad);
  biquad.connect(amp);
  amp.connect(audioCtx.destination);
  source.start();
  source.stop(audioCtx.currentTime + duration);
}

function playMediaSfx(file, volume = 0.9) {
  const audio = new Audio(asset(file));
  audio.volume = volume;
  const result = audio.play();
  if (result?.catch) result.catch(() => {});
  return audio;
}

function getBgm(mode) {
  if (!bgmTracks[mode]) {
    const audio = new Audio(asset(mode === "cat" ? "bgm_cat.mp3" : "bgm_dog.mp3"));
    audio.loop = true;
    audio.volume = mode === "cat" ? 0.42 : 0.34;
    bgmTracks[mode] = audio;
  }
  return bgmTracks[mode];
}

function switchBgm(mode) {
  if (!bgmStarted) return;
  if (currentBgmMode === mode) return;
  Object.values(bgmTracks).forEach((audio) => audio.pause());
  const next = getBgm(mode);
  next.currentTime = 0;
  const result = next.play();
  if (result?.catch) result.catch(() => {});
  currentBgmMode = mode;
}

function startBgm() {
  bgmStarted = true;
  switchBgm(state.mode);
}

function stopBgm() {
  Object.values(bgmTracks).forEach((audio) => audio.pause());
  currentBgmMode = null;
}

function resumeBgm() {
  if (!bgmStarted || gameOver) return;
  switchBgm(state.mode);
}

const sfx = {
  gong() {
    ensureAudio();
    playMediaSfx("gong.mp3", 0.86);
  },
  timeUp() {
    playMediaSfx("time_up.mp3", 0.92);
  },
  grab() {
    ensureAudio();
    tone({ type: "triangle", freq: 220, endFreq: 300, duration: 0.08, gain: 0.045 });
  },
  aim(power = 0.4) {
    ensureAudio();
    const now = performance.now();
    if (now - lastAimSoundAt < 120) return;
    lastAimSoundAt = now;
    tone({ type: "sine", freq: 360 + power * 280, endFreq: 390 + power * 320, duration: 0.045, gain: 0.025 });
  },
  launch() {
    ensureAudio();
    noise({ duration: 0.055, gain: 0.11, filter: 900 });
    tone({ type: "square", freq: 180, endFreq: 520, duration: 0.11, gain: 0.055 });
  },
  bounce() {
    ensureAudio();
    const now = performance.now();
    if (now - lastBounceSoundAt < 48) return;
    lastBounceSoundAt = now;
    tone({ type: "triangle", freq: 860 + Math.random() * 420, endFreq: 420, duration: 0.055, gain: 0.035 });
  },
  spot() {
    ensureAudio();
    tone({ type: "sine", freq: 520, endFreq: 880, duration: 0.12, gain: 0.075 });
    tone({ type: "sine", freq: 780, endFreq: 1320, duration: 0.16, gain: 0.055, delay: 0.06 });
  },
  reel() {
    if (reelSpinAudio) {
      reelSpinAudio.pause();
      reelSpinAudio.currentTime = 0;
    }
    reelSpinAudio = playMediaSfx("roulette_spin.mp3", 0.36);
    window.setTimeout(() => {
      if (!reelSpinAudio) return;
      reelSpinAudio.pause();
      reelSpinAudio.currentTime = 0;
      reelSpinAudio = null;
    }, 1000);
  },
  reelStop() {
    playMediaSfx("roulette_stop.mp3", 0.42);
  },
  catAppear() {
    ensureAudio();
    tone({ type: "sawtooth", freq: 420, endFreq: 920, duration: 0.18, gain: 0.06 });
    tone({ type: "sine", freq: 1240, endFreq: 1680, duration: 0.22, gain: 0.05, delay: 0.08 });
  },
  jackpot() {
    ensureAudio();
    [523, 659, 784, 1046].forEach((freq, index) => {
      tone({ type: "triangle", freq, endFreq: freq * 1.35, duration: 0.22, gain: 0.08, delay: index * 0.09 });
    });
    noise({ duration: 0.34, gain: 0.055, filter: 2600 });
  },
};

function playStartGongOnce() {
  if (gongPlayed) return;
  gongPlayed = true;
  sfx.gong();
  startBgm();
}

function enterGameOver() {
  if (!timeUpSoundPlayed) {
    timeUpSoundPlayed = true;
    sfx.timeUp();
  }
  gameOver = true;
  catTarget = null;
  dragging = null;
  stopBgm();
  els.canvas.classList.remove("dragging");
  renderStatus();
}

function buildBoard() {
  const rows = [
    { y: 88, xs: [170, 380, 590] },
    { y: 178, xs: [90, 280, 490, 680] },
    { y: 274, xs: [170, 380, 590] },
    { y: 370, xs: [90, 280, 490, 680] },
    { y: 468, xs: [170, 380, 590] },
  ];
  board.pins = rows.flatMap((row) => row.xs.map((x) => ({ x, y: row.y, r: 14 })));
  board.bumpers = [
    { x: 92, y: 585, r: 32 },
    { x: 260, y: 535, r: 32 },
    { x: 500, y: 535, r: 32 },
    { x: 668, y: 585, r: 32 },
    { x: 202, y: 654, r: 32 },
    { x: 558, y: 654, r: 32 },
  ];
}

function renderStatus() {
  const isCat = state.mode === "cat";
  els.balls.textContent = formatBalls(state.balls);
  els.modeName.textContent = isCat ? "猫モード" : "犬モード";
  els.spinCount.textContent = `${state.totalSpins}回`;
  els.catLeft.textContent = isCat ? `${state.catLeft}回` : "-";
  els.streak.textContent = `${state.streak}連`;
  els.holdCount.textContent = formatTime(timeLeftMs());
  els.machineTimer.querySelector("strong").textContent = formatTime(timeLeftMs());
  els.machineTimer.classList.toggle("danger", timeLeftMs() <= 15000);
  els.modeTelop.textContent = isCat ? "猫モード ～スポットをねらえ！～" : "犬モード ～スポットをねらえ！～";
  els.finalScoreText.textContent = `スコア ${formatBalls(state.balls)}`;
  els.machine.classList.toggle("cat", isCat);
  setImage(els.modeBadge, isCat ? "badge_cat.png" : "badge_dog.png");
  els.modeBadge.alt = isCat ? "猫モード" : "犬モード";
  els.gameOverOverlay.classList.toggle("show", gameOver);
}

function setLcdIdle() {
  if (reelBusy) return;
  const isCat = state.mode === "cat";
  els.lcdLead.textContent = holdQueue.length > 0 ? "保留消化中" : "スポットに入ると抽選開始！";
  els.lcdTitle.textContent = isCat ? "猫モード専用リール" : "両手で連続発射しよう";
  els.reachLabel.textContent = isCat ? "猫モード" : "犬モード";
  els.reachTitle.textContent = isCat ? "100回以内に継続を狙え！" : "犬リーチで大当たりを狙え！";
  setImage(els.reachImage, isCat ? "cat_reach_toy.png" : "dog_reach_chihuahua.png");
}

function weightedEvent(events, hit) {
  if (hit) return events[Math.min(events.length - 1, Math.floor(1 + Math.random() * (events.length - 1)))];
  const roll = Math.random();
  if (roll < 0.48) return events[0];
  if (roll < 0.76) return events[1];
  if (roll < 0.93) return events[2];
  return events[events.length - 1];
}

function enqueueLottery(special = false) {
  if (!reelBusy && holdQueue.length === 0) {
    startLottery({ special });
    return;
  }
  holdQueue.push({ special });
  els.lcdLead.textContent = special ? "激熱猫保留！" : "保留追加！";
  els.lcdTitle.textContent = `内部保留 ${holdQueue.length}`;
  renderStatus();
}

function consumeNextHold() {
  if (reelBusy || holdQueue.length === 0) {
    setLcdIdle();
    checkGameOver();
    return;
  }
  const next = holdQueue.shift();
  renderStatus();
  startLottery(next);
}

function spinReels(hit) {
  const pool = reelSymbols;
  const hitSymbol = "symbol_inu7.png";
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const tease = Math.random() < 0.22;
  const first = pick(pool);
  const misses = pool.filter((item) => item !== first);
  const result = hit
    ? [hitSymbol, hitSymbol, hitSymbol]
    : tease
      ? [first, first, pick(misses)]
      : shuffled;

  sfx.reel();
  els.machine.classList.add("spinning");
  const interval = window.setInterval(() => {
    [els.reel1, els.reel2, els.reel3].forEach((el) => setImage(el, pick(pool)));
  }, 90);

  window.setTimeout(() => {
    setImage(els.reel1, result[0]);
    sfx.reelStop();
  }, 420);
  window.setTimeout(() => {
    setImage(els.reel2, result[1]);
    sfx.reelStop();
  }, 700);
  window.setTimeout(() => {
    setImage(els.reel3, result[2]);
    sfx.reelStop();
    if (reelSpinAudio) {
      reelSpinAudio.pause();
      reelSpinAudio.currentTime = 0;
      reelSpinAudio = null;
    }
    window.clearInterval(interval);
    els.machine.classList.remove("spinning");
  }, 980);
}

function playReachVideo(src, done) {
  let finished = false;
  const video = els.reachVideo;
  stopBgm();

  const finish = () => {
    if (finished) return;
    finished = true;
    video.pause();
    video.removeAttribute("src");
    video.load();
    els.reachVideoOverlay.classList.remove("show");
    done();
    resumeBgm();
  };

  video.onended = finish;
  video.onerror = finish;
  video.src = asset(src);
  video.currentTime = 0;
  els.reachVideoOverlay.classList.add("show");

  const playResult = video.play();
  if (playResult?.catch) {
    playResult.catch(() => {
      window.setTimeout(finish, 1200);
    });
  }
  window.setTimeout(finish, 9000);
}

function finishLotteryResult(hit, isCat, options = {}) {
  if (timeLeftMs() <= 0) {
    enterGameOver();
    reelBusy = false;
    return;
  }
  if (hit) {
    applyHit();
    showJackpot(isCat);
  } else if (options.forceDogOnMiss) {
    state.mode = "dog";
    state.catLeft = 0;
    state.streak = 0;
    switchBgm("dog");
    els.lcdLead.textContent = "猫リーチ失敗";
    els.lcdTitle.textContent = "犬モードへ戻ります";
  } else if (state.mode === "cat" && state.catLeft <= 0) {
    state.mode = "dog";
    state.catLeft = 0;
    state.streak = 0;
    switchBgm("dog");
    els.lcdLead.textContent = "100回転スルー";
    els.lcdTitle.textContent = "犬モードへ戻ります";
  } else {
    els.lcdLead.textContent = "はずれ";
    els.lcdTitle.textContent = holdQueue.length > 0 ? "次の保留へ" : "もう一度スポットを狙おう";
  }
  saveState();
  renderStatus();
  window.setTimeout(() => {
    reelBusy = false;
    consumeNextHold();
  }, hit ? 1400 : 720);
}

function startLottery(options = {}) {
  if (reelBusy) return;
  reelBusy = true;
  const isCat = state.mode === "cat";
  const special = Boolean(options.special);
  const dogVideoReach = !isCat && !special && Math.random() < DOG_REACH_VIDEO_RATE;
  const catVideoReach = isCat && !special && Math.random() < CAT_MODE_VIDEO_RATE;
  const hit = special
    ? Math.random() < CAT_TARGET_HIT_RATE
    : dogVideoReach
      ? Math.random() < DOG_REACH_VIDEO_HIT_RATE
      : catVideoReach
        ? Math.random() < CAT_MODE_VIDEO_HIT_RATE
        : Math.random() < (isCat ? 1 / 70 : 1 / 99);
  const event = special ? catEvents[catEvents.length - 1] : weightedEvent(isCat ? catEvents : dogEvents, hit);

  state.totalSpins += 1;
  if (isCat) state.catLeft -= 1;
  saveState();
  renderStatus();

  els.lcdLead.textContent = special ? "動く猫にヒット！" : "抽選開始！";
  els.lcdTitle.textContent = special ? "激熱 猫リーチ 70%" : isCat ? "猫猫？" : "犬犬？";
  els.reachLabel.textContent = special ? "激熱猫リーチ" : event.label;
  els.reachTitle.textContent = event.title;
  setImage(els.reachImage, event.image);
  spinReels(hit);

  window.setTimeout(() => {
    if (dogVideoReach) {
      playReachVideo(hit ? "dog_reach_hit.mp4" : "dog_reach_miss.mp4", () => finishLotteryResult(hit, isCat));
      return;
    }
    if (catVideoReach) {
      playReachVideo(hit ? "cat_mode_hit.mp4" : "cat_mode_miss.mp4", () => finishLotteryResult(hit, isCat, { forceDogOnMiss: !hit }));
      return;
    }
    if (special) {
      playReachVideo(hit ? "cat_mode_hit.mp4" : "cat_mode_miss.mp4", () => finishLotteryResult(hit, isCat));
      return;
    }
    finishLotteryResult(hit, isCat);
  }, 1180);
}

function applyHit() {
  if (state.mode === "dog") {
    state.balls += 80;
    state.mode = "cat";
    state.catLeft = 100;
    state.streak = 1;
    switchBgm("cat");
  } else {
    state.balls += 120;
    state.catLeft = 100;
    state.streak += 1;
    switchBgm("cat");
  }
  gameOver = false;
}

function showJackpot(wasCatMode) {
  sfx.jackpot();
  setImage(els.jackpotImage, "jackpot_new.png");
  els.jackpotText.textContent = wasCatMode ? "SUPER 大当たり!!" : "大当たり！";
  els.jackpotSubText.textContent = wasCatMode ? "猫モード継続！" : "猫モード突入！";
  els.jackpotOverlay.classList.add("show");
  window.setTimeout(() => els.jackpotOverlay.classList.remove("show"), 1300);
}

function makeBall(launcher, pointer) {
  const dx = launcher.x - pointer.x;
  const dy = launcher.y - pointer.y;
  const power = Math.min(1, Math.hypot(dx, dy) / 145);
  if (power < 0.12 || gameOver || state.balls <= 0 || activeBalls.length >= MAX_ACTIVE_BALLS) return null;

  state.balls -= 1;
  sfx.launch();
  maybeSpawnCatTarget();
  saveState();
  renderStatus();
  return {
    id: nextBallId++,
    x: launcher.x,
    y: launcher.y,
    vx: dx * 0.115,
    vy: dy * 0.115 - 3.2,
    r: 17,
    trail: [],
  };
}

function maybeSpawnCatTarget() {
  if (catTarget || Math.random() >= CAT_TARGET_SPAWN_RATE) return;
  sfx.catAppear();
  catTarget = {
    born: performance.now(),
    duration: 6200,
    baseX: 380,
    y: 122 + Math.random() * 86,
    amp: 210,
    phase: Math.random() * Math.PI * 2,
    r: 44,
  };
  els.lcdLead.textContent = "動く猫スポット出現！";
  els.lcdTitle.textContent = "上を狙うと激熱";
}

function catTargetPosition(now = performance.now()) {
  if (!catTarget) return null;
  const age = now - catTarget.born;
  if (age > catTarget.duration) {
    catTarget = null;
    return null;
  }
  return {
    x: catTarget.baseX + Math.sin(age / 560 + catTarget.phase) * catTarget.amp,
    y: catTarget.y,
    r: catTarget.r,
  };
}

function checkGameOver() {
  if (timeLeftMs() > 0) return;
  enterGameOver();
}

function pointerToBoard(event) {
  const rect = els.canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * board.width,
    y: ((event.clientY - rect.top) / rect.height) * board.height,
  };
}

function hitCircle(ball, circle, bounce) {
  const dx = ball.x - circle.x;
  const dy = ball.y - circle.y;
  const dist = Math.hypot(dx, dy);
  const minDist = ball.r + circle.r;
  if (dist >= minDist || dist === 0) return;

  const nx = dx / dist;
  const ny = dy / dist;
  sfx.bounce();
  ball.x = circle.x + nx * minDist;
  ball.y = circle.y + ny * minDist;
  const dot = ball.vx * nx + ball.vy * ny;
  ball.vx = (ball.vx - 2 * dot * nx) * bounce + (Math.random() - 0.5) * 1.8;
  ball.vy = (ball.vy - 2 * dot * ny) * bounce + (Math.random() - 0.5) * 1.1;
}

function updateBall(ball) {
  ball.vy += board.gravity;
  ball.vx *= board.damping;
  ball.vy *= board.damping;
  ball.x += ball.vx;
  ball.y += ball.vy;

  if (ball.x < ball.r) {
    ball.x = ball.r;
    ball.vx = Math.abs(ball.vx) * 0.78;
  }
  if (ball.x > board.width - ball.r) {
    ball.x = board.width - ball.r;
    ball.vx = -Math.abs(ball.vx) * 0.78;
  }
  if (ball.y < ball.r) {
    ball.y = ball.r;
    ball.vy = Math.abs(ball.vy) * 0.72;
  }

  board.pins.forEach((pin) => hitCircle(ball, pin, 0.84));
  board.bumpers.forEach((bumper) => hitCircle(ball, bumper, 0.92));

  ball.trail.push({ x: ball.x, y: ball.y });
  if (ball.trail.length > 12) ball.trail.shift();

  const cat = catTargetPosition();
  if (cat && Math.hypot(ball.x - cat.x, ball.y - cat.y) < ball.r + cat.r * 0.72) {
    catTarget = null;
    return "cat";
  }

  const spotHit = Math.hypot(ball.x - board.spot.x, ball.y - board.spot.y) < board.spot.r - 4;
  if (spotHit && ball.vy > -2) return "spot";
  if (ball.y > board.height + 60 || ball.x < -80 || ball.x > board.width + 80) return "out";
  return "live";
}

function updatePhysics() {
  checkGameOver();
  if (gameOver) return;
  activeBalls = activeBalls.filter((ball) => {
    const result = updateBall(ball);
    if (result === "spot") {
      sfx.spot();
      enqueueLottery();
      return false;
    }
    if (result === "cat") {
      sfx.catAppear();
      enqueueLottery(true);
      return false;
    }
    return result !== "out";
  });
  catTargetPosition();
  checkGameOver();
}

function drawArrow(fromX, fromY, toX, toY) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const head = 18;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - Math.cos(angle - Math.PI / 6) * head, toY - Math.sin(angle - Math.PI / 6) * head);
  ctx.lineTo(toX - Math.cos(angle + Math.PI / 6) * head, toY - Math.sin(angle + Math.PI / 6) * head);
  ctx.closePath();
  ctx.fill();
}

function drawBall(ball) {
  ball.trail.forEach((point, index) => {
    ctx.fillStyle = `rgba(217, 74, 37, ${0.08 + index * 0.05})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5 + index * 0.35, 0, Math.PI * 2);
    ctx.fill();
  });

  if (ballImage.complete) {
    ctx.drawImage(ballImage, ball.x - ball.r, ball.y - ball.r, ball.r * 2, ball.r * 2);
  } else {
    ctx.fillStyle = "#d8d8d8";
    ctx.strokeStyle = "#777";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawLauncher(launcher) {
  const disabled = state.balls <= 0 || activeBalls.length >= MAX_ACTIVE_BALLS;
  ctx.globalAlpha = disabled ? 0.38 : 1;
  if (ballImage.complete) {
    ctx.drawImage(ballImage, launcher.x - 17, launcher.y - 17, 34, 34);
  } else {
    ctx.fillStyle = "#d8d8d8";
    ctx.strokeStyle = "#777";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(launcher.x, launcher.y, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawDragAssist() {
  if (!dragging) return;
  const launcher = dragging.launcher;
  const pullX = launcher.x - dragging.x;
  const pullY = launcher.y - dragging.y;
  const power = Math.min(1, Math.hypot(pullX, pullY) / 145);
  const aimX = launcher.x + pullX * 1.35;
  const aimY = launcher.y + (pullY - 28) * 1.35;

  ctx.strokeStyle = "rgba(217, 74, 37, 0.48)";
  ctx.lineWidth = 5;
  ctx.setLineDash([8, 10]);
  ctx.beginPath();
  ctx.moveTo(launcher.x, launcher.y);
  ctx.lineTo(dragging.x, dragging.y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = "rgba(25, 130, 74, 0.9)";
  ctx.fillStyle = "rgba(25, 130, 74, 0.9)";
  ctx.lineWidth = 6;
  drawArrow(launcher.x, launcher.y, aimX, aimY);

  const meterX = launcher.x + (launcher.side < 0 ? 34 : -162);
  ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
  ctx.strokeStyle = "rgba(45, 92, 38, 0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(meterX, launcher.y - 28, 128, 20, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = power > 0.72 ? "#d94a25" : "#1b8a55";
  ctx.beginPath();
  ctx.roundRect(meterX + 4, launcher.y - 24, 120 * power, 12, 6);
  ctx.fill();
  ctx.fillStyle = "#201b17";
  ctx.font = "700 13px Yu Gothic, Meiryo, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("発射パワー", meterX + 4, launcher.y - 34);
}

function drawCatTarget() {
  const cat = catTargetPosition();
  if (!cat) return;

  ctx.save();
  ctx.shadowColor = "rgba(255, 232, 92, 0.92)";
  ctx.shadowBlur = 18;
  ctx.strokeStyle = "#ffe85c";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cat.x, cat.y, cat.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  if (catTargetImage.complete) {
    ctx.drawImage(catTargetImage, cat.x - 54, cat.y - 50, 108, 102);
  } else {
    ctx.fillStyle = "#e95895";
    ctx.beginPath();
    ctx.arc(cat.x, cat.y, 34, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#fff6a8";
  ctx.strokeStyle = "rgba(48, 20, 8, 0.72)";
  ctx.lineWidth = 4;
  ctx.font = "900 18px Yu Gothic, Meiryo, sans-serif";
  ctx.textAlign = "center";
  ctx.strokeText("激熱", cat.x, cat.y + 62);
  ctx.fillText("激熱", cat.x, cat.y + 62);
  ctx.restore();
}

function drawBoard() {
  ctx.clearRect(0, 0, board.width, board.height);

  ctx.save();
  if (spotImage.complete) {
    ctx.drawImage(spotImage, board.spot.x - 108, board.spot.y - 54, 216, 148);
  }
  drawCatTarget();
  board.launchers.forEach(drawLauncher);
  drawDragAssist();
  activeBalls.forEach(drawBall);
  ctx.restore();
}

function loop() {
  updatePhysics();
  drawBoard();
  window.requestAnimationFrame(loop);
}

els.canvas.addEventListener("pointerdown", (event) => {
  if (gameOver || state.balls <= 0 || activeBalls.length >= MAX_ACTIVE_BALLS) return;
  const pointer = pointerToBoard(event);
  const launcher = board.launchers.find((item) => Math.hypot(pointer.x - item.x, pointer.y - item.y) < 76);
  if (!launcher) return;
  playStartGongOnce();
  sfx.grab();
  dragging = { launcher, x: pointer.x, y: pointer.y };
  els.canvas.classList.add("dragging");
  els.canvas.setPointerCapture(event.pointerId);
});

els.canvas.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  const pointer = pointerToBoard(event);
  dragging.x = Math.max(20, Math.min(board.width - 20, pointer.x));
  dragging.y = Math.max(388, Math.min(board.height - 42, pointer.y));
  const power = Math.min(1, Math.hypot(dragging.launcher.x - dragging.x, dragging.launcher.y - dragging.y) / 145);
  sfx.aim(power);
});

els.canvas.addEventListener("pointerup", (event) => {
  if (!dragging) return;
  const newBall = makeBall(dragging.launcher, pointerToBoard(event));
  if (newBall) activeBalls.push(newBall);
  dragging = null;
  els.canvas.classList.remove("dragging");
});

els.canvas.addEventListener("pointercancel", () => {
  dragging = null;
  els.canvas.classList.remove("dragging");
});

function resetGame() {
  state = { ...defaultState };
  holdQueue = [];
  activeBalls = [];
  dragging = null;
  catTarget = null;
  reelBusy = false;
  gameOver = false;
  gongPlayed = false;
  timeUpSoundPlayed = false;
  gameStartedAt = Date.now();
  playStartGongOnce();
  switchBgm("dog");
  saveState();
  renderStatus();
  setLcdIdle();
}

els.retryBtn.addEventListener("click", resetGame);
els.quickRetryBtn.addEventListener("click", resetGame);

buildBoard();
renderStatus();
setLcdIdle();
checkGameOver();
loop();
window.setInterval(renderStatus, 250);

