'use strict';
// ムササビシュート — ゲームの進行・選手とキーパーの動き・ボールの物理・入力・2D の表示(方角リング・ボタン)
//   1. 画面右のサイド(右コーナー・定位置・サイドライン沿い)で走りながら味方のパス(直接・バウンド・山なり)を受ける。
//      受けたら左(ゴール中央の方)へ切れ込みながら1歩ずつ進む
//   2. ダッシュを長押ししたまま3歩目(左足)を踏んだときだけ「ジャンプ」が「ムササビ」に変わる。4歩目・6mラインを踏む・シュート前の着地は失敗
//      ムササビ(プロンジョンシュート)はコート中央側へ跳び込み、滞空の後半で体を大きく倒して角度を広げる
//   3. 着地するまでに ノーマル(まん中) / ループ(上) / 左スピン(左) / 右スピン(右) / バウンド(下) でシュート。
//      方角リングでコース(左右・高低)を決める
// 操作系(方角リング・ひし形のボタン・ナビ・一時停止)はセンターフライ/ジャッカル/コーナーキックと同じ作り。
(() => {
  const $ = (s) => document.querySelector(s);
  const canvas = $('#game');
  const ctx = canvas.getContext('2d');
  const isTouch = window.matchMedia('(pointer: coarse)').matches;

  // ================= 定数 =================
  const GOAL_HW = 1.5;          // ゴール半幅 (m)
  const GOAL_H = 2.0;           // ゴール高さ
  const AREA_R = 6;             // 6mライン
  const G = 9.8;
  const BALL_R = 0.095;
  const RUN_SPEED = 3.2;
  const JOG_SPEED = 2.3, DASH_SPEED = 3.3;  // ふつう / ダッシュ長押し (m/s)
  const STEP_INTERVAL = 0.36;   // 歩数の基準
  const JOG_STEP = 0.42, DASH_STEP = 0.32;  // 1歩の間隔 (秒)
  const TOTAL_SHOTS = 5;
  const DT = 1 / 120;

  // 開始位置(画面右のサイド。右利きがプロンジョンを使う側)。毎回どれかを選び、範囲の中で少しずつ変わる
  //   サイドはゴール左右のコーナー寄りに位置取り、ボールが来る前に走り出して、走り込みながら受ける
  //   path: 走るコース(順に向かう点)。最後は中央へ寄って角度を作る。mate: パスを出す味方の位置
  const START_SPOTS = [
    { name: '右コーナーから', x: [8.6, 9.5], z: [1.4, 2.8], path: [[6.8, 5.4], [1.0, 7.4]],
      mate: { x: [3.6, 5.4], z: [9.8, 11.2] }, hint: 'ゴールライン際から上がって受ける。角度がないので早めに跳ぼう' },
    { name: 'サイドの定位置から', x: [9.0, 9.7], z: [5.0, 7.0], path: [[-0.6, 7.6]],
      mate: { x: [3.6, 5.6], z: [10.2, 11.6] }, hint: '中央へ切れ込んで受ける' },
    { name: 'サイドライン沿いに走り込んで', x: [9.0, 9.6], z: [10.5, 12.5], path: [[8.6, 7.6], [-0.6, 7.2]],
      mate: { x: [1.0, 3.0], z: [12.5, 14.0] }, hint: 'サイドラインに沿って走り、曲線を描いてセンターへ寄る' },
  ];

  const SHOT_TYPES = {
    normal: { name: 'ノーマル', pts: 100 },
    loop: { name: 'ループ', pts: 150 },
    spinL: { name: '左スピン', pts: 180 },
    spinR: { name: '右スピン', pts: 180 },
    bound: { name: 'バウンド', pts: 130 },
  };
  // タイミングによるシュートの種類
  const TIMINGS = {
    step: { name: 'ステップ', mult: 1.0 },
    quick: { name: 'クイック', mult: 1.3 },
    jump: { name: 'ジャンプ', mult: 1.2 },
    fall: { name: '倒れ込み', mult: 1.1 },
    musasabi: { name: 'ムササビ', mult: 2.0 },
  };
  // キーパーのタイプ(立つ位置・動き方・決め打ちのくせ)
  const KEEPER_TYPES = [
    { name: '定位置でじっくり型', z: 0.55, move: 'track', bias: 0.1, react: 0.2, speed: 3.0,
      commit: { star: 1, low: 1, diveL: 0.6, diveR: 0.6, out: 0.4, spread: 0.6, wait: 1.2 } },
    { name: '飛び出し型', z: 0.9, move: 'rush', bias: 0.2, react: 0.18, speed: 3.2,
      commit: { star: 1.0, low: 0.4, diveL: 0.4, diveR: 0.4, out: 1.8, spread: 0.8, wait: 0.2 } },
    { name: 'ニアを固める型', z: 0.6, move: 'track', bias: 0.5, react: 0.22, speed: 2.8,
      commit: { star: 0.6, low: 0.8, diveL: 1.4, diveR: 0.6, out: 0.5, spread: 0.6, wait: 0.6 } },
    { name: '左右に揺さぶる型', z: 0.7, move: 'sway', bias: 0, react: 0.24, speed: 3.4,
      commit: { star: 0.8, low: 0.8, diveL: 1.3, diveR: 1.3, out: 0.4, spread: 0.5, wait: 0.3 } },
    { name: 'フェイント型', z: 0.65, move: 'feint', bias: 0.1, react: 0.2, speed: 3.6,
      commit: { star: 0.7, low: 0.9, diveL: 1.1, diveR: 1.1, out: 0.5, spread: 0.9, wait: 0.4 } },
    { name: 'ゴールライン型', z: 0.3, move: 'restless', bias: -0.1, react: 0.16, speed: 3.0,
      commit: { star: 1.4, low: 1.2, diveL: 0.5, diveR: 0.5, out: 0.3, spread: 0.8, wait: 0.5 } },
    { name: '大の字ジャンプ型', z: 0.8, move: 'advance', bias: 0.1, react: 0.2, speed: 2.8,
      commit: { star: 2.6, low: 0.3, diveL: 0.4, diveR: 0.4, out: 0.6, spread: 0.6, wait: 0.2 } },
  ];
  const COMMIT_LABEL = {
    star: '大の字ジャンプ！', low: 'しゃがんだ！', diveL: '左に倒れた！', diveR: '右に倒れた！',
    out: '前に出てきた！', spread: '両手を広げた！', wait: 'じっと待っている…',
  };
  // ナビ: キーパーの決め打ちに効くシュート(ボタン名とコース)
  const COUNTER = {
    star: { btn: 'bound', jx: 0.8, jy: -0.8 }, low: { btn: 'loop', jx: 0.7, jy: 0.8 },
    diveL: { btn: 'normal', jx: 0.9, jy: 0.5 }, diveR: { btn: 'normal', jx: -0.9, jy: 0.5 },
    out: { btn: 'loop', jx: 0.5, jy: 0.8 }, spread: { btn: 'loop', jx: 0.6, jy: 0.8 },
  };

  // ================= ユーティリティ =================
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  function gauss() {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function weighted(obj) {
    let sum = 0;
    for (const k in obj) sum += obj[k];
    let r = Math.random() * sum;
    for (const k in obj) { r -= obj[k]; if (r <= 0) return k; }
    return Object.keys(obj)[0];
  }
  // ゴールエリア(6m)までの距離
  function areaDist(x, z) {
    const dx = Math.max(0, Math.abs(x) - GOAL_HW);
    return Math.hypot(dx, Math.max(0, z));
  }
  function segDist(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay;
    const l2 = vx * vx + vy * vy || 1e-6;
    const t = clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1);
    return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
  }
  function loadNum(key, def) { try { const v = localStorage.getItem(key); return v == null ? def : JSON.parse(v); } catch (e) { return def; } }
  function saveNum(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* 保存できない環境 */ } }

  // ================= サウンド（ホーンなし・歓声のみ） =================
  let AC = null, master = null, noiseBuf = null, muted = false, murmurGain = null;
  function initAudio() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    AC = new C();
    master = AC.createGain(); master.gain.value = 0.8; master.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // 会場のざわめき
    const n = noise(); const lp = AC.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 450;
    murmurGain = AC.createGain(); murmurGain.gain.value = 0.035;
    n.connect(lp).connect(murmurGain).connect(master); n.start();
  }
  function noise() {
    const s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s;
  }
  function env(g, t, a, peak, hold, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
  }
  function tone(type, f0, f1, dur, vol, at = 0) {
    if (!AC || muted) return;
    const t = AC.currentTime + at;
    const o = AC.createOscillator(); const g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, 0.005, vol, 0, dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function burst(dur, vol, type, freq, q = 1, at = 0) {
    if (!AC || muted) return;
    const t = AC.currentTime + at;
    const n = noise(); const f = AC.createBiquadFilter(); const g = AC.createGain();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    env(g, t, 0.003, vol, 0, dur);
    n.connect(f).connect(g).connect(master); n.start(t, Math.random()); n.stop(t + dur + 0.05);
  }
  const sfx = {
    squeak() { tone('sine', 1900 + Math.random() * 400, 3300, 0.07, 0.04); },
    catch() { tone('sine', 160, 60, 0.12, 0.35); burst(0.05, 0.2, 'bandpass', 1200); },
    jump() { tone('sine', 220, 120, 0.1, 0.12); burst(0.06, 0.08, 'bandpass', 2400); },
    shot() { tone('sine', 140, 50, 0.14, 0.45); burst(0.06, 0.35, 'bandpass', 900, 0.8); },
    bounce() { tone('sine', 120, 60, 0.1, 0.3); },
    net() { burst(0.45, 0.25, 'highpass', 3000, 0.5); },
    save() { tone('sine', 110, 45, 0.18, 0.5); burst(0.08, 0.3, 'lowpass', 700); },
    post() { [520, 1240, 2090, 2900].forEach((f, i) => tone('sine', f, f * 0.98, 0.8, 0.12 / (i + 1))); },
    whistle() {
      if (!AC || muted) return;
      const t = AC.currentTime;
      const o = AC.createOscillator(), lfo = AC.createOscillator(), lg = AC.createGain(), g = AC.createGain();
      o.type = 'sine'; o.frequency.value = 2900; lfo.frequency.value = 28; lg.gain.value = 120;
      lfo.connect(lg).connect(o.frequency);
      env(g, t, 0.02, 0.15, 0.45, 0.1);
      o.connect(g).connect(master); o.start(t); lfo.start(t); o.stop(t + 0.7); lfo.stop(t + 0.7);
    },
    cheer(power = 1) {
      if (!AC || muted) return;
      const t = AC.currentTime;
      const n = noise(); const bp = AC.createBiquadFilter(); const g = AC.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 1000; bp.Q.value = 0.5;
      env(g, t, 0.15, 0.45 * power, 1.4, 2.0);
      n.connect(bp).connect(g).connect(master); n.start(t); n.stop(t + 3.8);
      // 「わーっ」という声
      for (let i = 0; i < 18; i++) {
        const st = t + Math.random() * 0.25;
        const f = rand(170, 420);
        const o = AC.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, st);
        o.frequency.linearRampToValueAtTime(f * 1.3, st + 0.35);
        o.frequency.linearRampToValueAtTime(f * 1.1, st + 2.6);
        const vib = AC.createOscillator(), vg = AC.createGain();
        vib.frequency.value = rand(4, 7); vg.gain.value = f * 0.025;
        vib.connect(vg).connect(o.frequency);
        const fm = AC.createBiquadFilter(); fm.type = 'bandpass'; fm.frequency.value = rand(650, 1100); fm.Q.value = 3;
        const og = AC.createGain(); env(og, st, 0.2, 0.03 * power, 1.2, 1.5);
        o.connect(fm).connect(og).connect(master);
        o.start(st); vib.start(st); o.stop(st + 3.2); vib.stop(st + 3.2);
      }
      // 拍手
      for (let i = 0; i < 40; i++) burst(0.03, 0.12 * power, 'highpass', 1500, 0.7, 0.3 + Math.random() * 2.4);
    },
    groan() {
      if (!AC || muted) return;
      const t = AC.currentTime;
      for (let i = 0; i < 12; i++) {
        const f = rand(150, 300);
        const o = AC.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * 1.15, t); o.frequency.linearRampToValueAtTime(f * 0.8, t + 1.3);
        const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
        const g = AC.createGain(); env(g, t, 0.1, 0.025, 0.5, 0.8);
        o.connect(lp).connect(g).connect(master); o.start(t); o.stop(t + 1.5);
      }
    },
  };

  // ================= ポーズ =================
  const JOINTS = ['head', 'neck', 'hip', 'shL', 'shR', 'elL', 'elR', 'haL', 'haR', 'hiL', 'hiR', 'knL', 'knR', 'ftL', 'ftR'];
  function mirrorPose(p) {
    const o = {};
    for (const k in p) {
      let k2 = k;
      if (k.endsWith('L')) k2 = k.slice(0, -1) + 'R';
      else if (k.endsWith('R')) k2 = k.slice(0, -1) + 'L';
      o[k2] = [-p[k][0], p[k][1], p[k][2]];
    }
    return o;
  }
  // ---- キーパー（こちら向き。xは画面の左右と同じ） ----
  const KP = {
    ready: {
      head: [0, 1.72, 0], neck: [0, 1.5, 0], hip: [0, 0.95, 0], shL: [-0.22, 1.45, 0], shR: [0.22, 1.45, 0],
      elL: [-0.5, 1.32, 0.08], elR: [0.5, 1.32, 0.08], haL: [-0.74, 1.58, 0.12], haR: [0.74, 1.58, 0.12],
      hiL: [-0.13, 0.95, 0], hiR: [0.13, 0.95, 0], knL: [-0.33, 0.5, 0.05], knR: [0.33, 0.5, 0.05],
      ftL: [-0.45, 0.04, 0], ftR: [0.45, 0.04, 0],
    },
    high: {
      head: [0, 1.74, 0], neck: [0, 1.52, 0], hip: [0, 0.98, 0], shL: [-0.22, 1.47, 0], shR: [0.22, 1.47, 0],
      elL: [-0.42, 1.8, 0.05], elR: [0.42, 1.8, 0.05], haL: [-0.56, 2.14, 0.08], haR: [0.56, 2.14, 0.08],
      hiL: [-0.13, 0.98, 0], hiR: [0.13, 0.98, 0], knL: [-0.3, 0.5, 0.05], knR: [0.3, 0.5, 0.05],
      ftL: [-0.4, 0.04, 0], ftR: [0.4, 0.04, 0],
    },
    low: {
      head: [0, 1.15, 0.1], neck: [0, 0.98, 0.08], hip: [0, 0.55, 0], shL: [-0.22, 0.95, 0.08], shR: [0.22, 0.95, 0.08],
      elL: [-0.55, 0.6, 0.12], elR: [0.55, 0.6, 0.12], haL: [-0.92, 0.22, 0.15], haR: [0.92, 0.22, 0.15],
      hiL: [-0.13, 0.55, 0], hiR: [0.13, 0.55, 0], knL: [-0.55, 0.35, 0.05], knR: [0.55, 0.35, 0.05],
      ftL: [-0.95, 0.05, 0], ftR: [0.95, 0.05, 0],
    },
    star: {
      head: [0, 2.02, 0], neck: [0, 1.8, 0], hip: [0, 1.25, 0], shL: [-0.22, 1.75, 0], shR: [0.22, 1.75, 0],
      elL: [-0.6, 1.86, 0.05], elR: [0.6, 1.86, 0.05], haL: [-0.98, 2.05, 0.08], haR: [0.98, 2.05, 0.08],
      hiL: [-0.13, 1.25, 0], hiR: [0.13, 1.25, 0], knL: [-0.4, 0.88, 0.05], knR: [0.4, 0.88, 0.05],
      ftL: [-0.66, 0.52, 0], ftR: [0.66, 0.52, 0],
    },
    diveL: {
      head: [-1.12, 0.78, 0], neck: [-0.92, 0.74, 0], hip: [-0.25, 0.55, 0], shL: [-0.9, 0.86, 0], shR: [-0.88, 0.6, 0],
      elL: [-1.22, 0.98, 0.05], elR: [-1.18, 0.6, 0.05], haL: [-1.5, 1.08, 0.08], haR: [-1.45, 0.55, 0.08],
      hiL: [-0.25, 0.65, 0], hiR: [-0.25, 0.45, 0], knL: [0.15, 0.62, 0], knR: [0.1, 0.25, 0],
      ftL: [0.5, 0.62, 0], ftR: [0.45, 0.05, 0],
    },
  };
  KP.diveR = mirrorPose(KP.diveL);
  KP.out = KP.ready;
  KP.wait = KP.ready;
  KP.lowL = (() => { // 片足を出して低めを守る
    const p = JSON.parse(JSON.stringify(KP.ready));
    p.ftL = [-1.05, 0.08, 0.05]; p.knL = [-0.6, 0.4, 0.05]; p.haL = [-0.85, 0.5, 0.12]; p.elL = [-0.5, 0.95, 0.08];
    p.hip = [-0.1, 0.85, 0]; return p;
  })();
  KP.lowR = mirrorPose(KP.lowL);
  const KEEPER_SEGS = [
    ['neck', 'hip', 0.2], ['shL', 'shR', 0.1], ['hiL', 'hiR', 0.12],
    ['shL', 'elL', 0.08], ['elL', 'haL', 0.08], ['shR', 'elR', 0.08], ['elR', 'haR', 0.08],
    ['hiL', 'knL', 0.1], ['knL', 'ftL', 0.09], ['hiR', 'knR', 0.1], ['knR', 'ftR', 0.09],
  ];

  // ---- シューター（右利き。-zがゴール方向） ----
  function standPose() {
    return {
      head: [0, 1.72, 0], neck: [0, 1.5, 0], hip: [0, 0.95, 0], shL: [-0.21, 1.45, 0], shR: [0.21, 1.45, 0],
      elL: [-0.3, 1.2, -0.05], elR: [0.32, 1.2, -0.1], haL: [-0.3, 0.95, -0.1], haR: [0.34, 1.32, -0.28],
      hiL: [-0.12, 0.95, 0], hiR: [0.12, 0.95, 0], knL: [-0.13, 0.5, -0.04], knR: [0.13, 0.5, -0.04],
      ftL: [-0.14, 0.04, 0], ftR: [0.14, 0.04, 0],
    };
  }
  function runPose(ph, cock) {
    const s = Math.sin(ph);
    const lL = Math.max(0, s), lR = Math.max(0, -s);
    const p = {
      head: [0, 1.68, -0.2], neck: [0, 1.47, -0.15], hip: [0, 0.95, 0], shL: [-0.21, 1.42, -0.13], shR: [0.21, 1.42, -0.13],
      elL: [-0.28, 1.18, 0.12 * s], haL: [-0.3, 0.95, -0.25 * s], elR: [0.33, 1.12, -0.1], haR: [0.3, 1.3, -0.32],
      hiL: [-0.12, 0.95, 0], hiR: [0.12, 0.95, 0],
      knL: [-0.12, 0.5 + 0.15 * lL, -0.3 * s - 0.05], ftL: [-0.12, 0.04 + 0.3 * lL, -0.4 * s + 0.1 * lL],
      knR: [0.12, 0.5 + 0.15 * lR, 0.3 * s - 0.05], ftR: [0.12, 0.04 + 0.3 * lR, 0.4 * s + 0.1 * lR],
    };
    if (cock) { p.elR = [0.42, 1.68, 0.1]; p.haR = [0.4, 1.98, 0.25]; }
    return p;
  }
  function jumpPose() {
    return {
      head: [0, 1.75, -0.05], neck: [0, 1.52, -0.03], hip: [0, 1.0, 0.02], shL: [-0.21, 1.47, 0], shR: [0.21, 1.47, 0],
      elR: [0.42, 1.78, 0.12], haR: [0.38, 2.08, 0.3], elL: [-0.32, 1.4, -0.22], haL: [-0.3, 1.5, -0.45],
      hiL: [-0.12, 1.0, 0], hiR: [0.12, 1.0, 0], knL: [-0.16, 0.62, -0.32], ftL: [-0.16, 0.3, -0.05],
      knR: [0.15, 0.55, 0.08], ftR: [0.16, 0.2, 0.35],
    };
  }
  function throwPose(base) {
    const p = Object.assign({}, base);
    p.elR = [0.3, base.shR[1] + 0.12, -0.28]; p.haR = [0.22, base.shR[1] + 0.02, -0.65];
    p.head = [base.head[0], base.head[1] - 0.03, base.head[2] - 0.12];
    return p;
  }
  function musaPose() {
    return {
      hip: [0, 0.5, 0.35], neck: [0, 0.6, -0.45], head: [0, 0.68, -0.7], shL: [-0.22, 0.6, -0.4], shR: [0.22, 0.6, -0.4],
      elL: [-0.55, 0.68, -0.48], haL: [-0.92, 0.78, -0.55], elR: [0.55, 0.72, -0.42], haR: [0.9, 0.88, -0.45],
      hiL: [-0.14, 0.5, 0.35], hiR: [0.14, 0.5, 0.35], knL: [-0.4, 0.5, 0.75], ftL: [-0.68, 0.6, 1.1],
      knR: [0.4, 0.5, 0.75], ftR: [0.68, 0.6, 1.1],
    };
  }
  function musaThrowPose() {
    const p = musaPose(); p.elR = [0.32, 0.64, -0.75]; p.haR = [0.3, 0.62, -1.08]; return p;
  }
  function slidePose(base) {
    const p = {};
    for (const k in base) p[k] = [base[k][0], Math.max(0.08, base[k][1] - 0.36), base[k][2]];
    return p;
  }
  function landPose() {
    const p = standPose();
    p.hip = [0, 0.82, 0]; p.hiL = [-0.12, 0.82, 0]; p.hiR = [0.12, 0.82, 0];
    p.knL = [-0.16, 0.45, -0.2]; p.knR = [0.16, 0.45, -0.2];
    p.neck = [0, 1.35, -0.12]; p.head = [0, 1.56, -0.18]; p.shL = [-0.21, 1.3, -0.1]; p.shR = [0.21, 1.3, -0.1];
    p.elR = [0.3, 1.2, -0.35]; p.haR = [0.25, 1.05, -0.55];
    return p;
  }
  function copyPose(p) { const o = {}; for (const k in p) o[k] = p[k].slice(); return o; }
  function blendPose(cur, target, a) {
    for (const k of JOINTS) for (let i = 0; i < 3; i++) cur[k][i] = lerp(cur[k][i], target[k][i], a);
  }

  // ---- 追加のポーズ ----
  KP.spread = (() => {
    const p = JSON.parse(JSON.stringify(KP.ready));
    p.elL = [-0.6, 1.42, 0.05]; p.haL = [-1.0, 1.35, 0.1]; p.elR = [0.6, 1.42, 0.05]; p.haR = [1.0, 1.35, 0.1];
    p.knL = [-0.42, 0.48, 0.05]; p.knR = [0.42, 0.48, 0.05]; p.ftL = [-0.62, 0.04, 0]; p.ftR = [0.62, 0.04, 0];
    p.hip = [0, 0.9, 0]; return p;
  })();
  KP.cheer = (() => {
    const p = JSON.parse(JSON.stringify(KP.ready));
    p.elL = [-0.32, 1.85, 0.05]; p.haL = [-0.42, 2.2, 0.05]; p.elR = [0.32, 1.85, 0.05]; p.haR = [0.42, 2.2, 0.05];
    p.knL = [-0.18, 0.5, 0.03]; p.knR = [0.18, 0.5, 0.03]; p.ftL = [-0.22, 0.04, 0]; p.ftR = [0.22, 0.04, 0];
    return p;
  })();
  KP.sad = (() => {
    const p = JSON.parse(JSON.stringify(KP.ready));
    p.head = [0, 1.55, 0.18]; p.neck = [0, 1.43, 0.1]; p.shL = [-0.2, 1.38, 0.06]; p.shR = [0.2, 1.38, 0.06];
    p.elL = [-0.28, 1.12, 0.08]; p.haL = [-0.3, 0.85, 0.1]; p.elR = [0.28, 1.12, 0.08]; p.haR = [0.3, 0.85, 0.1];
    p.knL = [-0.15, 0.5, 0.03]; p.knR = [0.15, 0.5, 0.03]; p.ftL = [-0.2, 0.04, 0]; p.ftR = [0.2, 0.04, 0];
    return p;
  })();
  // ムササビ(プロンジョン): 両手両足を広げ、ボールは頭の近くに構える
  function spreadPose() {
    return {
      head: [0, 1.76, -0.04], neck: [0, 1.53, -0.02], hip: [0, 1.0, 0.02], shL: [-0.21, 1.48, 0], shR: [0.21, 1.48, 0],
      elL: [-0.55, 1.5, -0.08], haL: [-0.9, 1.45, -0.15], elR: [0.4, 1.78, 0.1], haR: [0.36, 2.06, 0.22],
      hiL: [-0.12, 1.0, 0], hiR: [0.12, 1.0, 0], knL: [-0.32, 0.6, 0.05], ftL: [-0.55, 0.25, 0.1],
      knR: [0.2, 0.58, 0.08], ftR: [0.3, 0.22, 0.25],
    };
  }
  function spreadThrowPose() {
    const p = spreadPose(); p.elR = [0.32, 1.66, -0.28]; p.haR = [0.26, 1.58, -0.66]; p.head = [0, 1.74, -0.14]; return p;
  }
  // 体を倒す: roll = 横(+ で右へ)、pitch = 前へ。腰の高さを軸に回す
  function tiltPose(src, roll, pitch) {
    const o = {}, cr = Math.cos(roll), sr = Math.sin(roll), cq = Math.cos(pitch), sq = Math.sin(pitch);
    for (const k of JOINTS) {
      const [x, y, z] = src[k], y0 = y - 1.0;
      const x1 = x * cr + y0 * sr, y1 = -x * sr + y0 * cr;
      const z2 = z * cq - y1 * sq, y2 = z * sq + y1 * cq;
      o[k] = [x1, y2 + 1.0, z2];
    }
    return o;
  }
  function catchPose(ph) {
    const p = runPose(ph, false);
    p.elL = [-0.25, 1.35, -0.3]; p.haL = [-0.15, 1.45, -0.5]; p.elR = [0.25, 1.35, -0.3]; p.haR = [0.15, 1.45, -0.5];
    return p;
  }
  // 味方(パスを出す)
  function passerPose(t) {
    const p = standPose();
    p.haR = [0.32, 1.35, 0.05]; p.elR = [0.3, 1.15, 0.05];
    if (t > 0 && t < 0.2) { const k = t / 0.2; p.elR = [0.4, 1.6, 0.15 * k]; p.haR = [0.35, 1.6 + 0.35 * k, 0.3 * k]; }
    else if (t >= 0.2 && t < 0.7) { p.elR = [0.3, 1.55, -0.3]; p.haR = [0.25, 1.4, -0.65]; }
    return p;
  }

  function celebratePose(t) {
    const p = standPose();
    p.elL = [-0.3, 1.8, 0]; p.haL = [-0.38, 2.15, -0.05]; p.elR = [0.3, 1.8, 0]; p.haR = [0.38, 2.15, -0.05];
    const b = Math.abs(Math.sin(t * 7)) * 0.15;
    for (const k of JOINTS) p[k][1] += b;
    return p;
  }
  function sadPose() {
    const p = standPose();
    p.head = [0, 1.55, -0.2]; p.neck = [0, 1.43, -0.12]; p.haL = [-0.28, 0.85, -0.1]; p.haR = [0.28, 0.85, -0.1];
    p.elL = [-0.27, 1.12, -0.06]; p.elR = [0.27, 1.12, -0.06];
    return p;
  }

  // ================= ゲーム状態 =================
  const game = {
    phase: 'title', score: 0, shotNo: 0, goals: 0, combo: 0, history: [], waitT: 0, time: 0,
    paused: false, slowT: 0, lineFlash: 0, nav: loadNum('musasabi.nav', true), best: loadNum('musasabi.best', 0),
  };
  const input = { jx: 0, jy: 0, dash: false, keys: new Set() };
  let player = null, keeper = null, ball = null, footprints = [], cheer = 0, hintBtn = null, jumpHint = false;
  let mate = null, pass = null;
  const PASS_TYPES = {
    direct: { name: '直接パス', T: 0.5 },
    bounce: { name: 'バウンドパス', T: 0.62 },
    lob: { name: '山なりパス', T: 0.85 },
  };

  function newAttempt() {
    game.shotNo++;
    const spot = pick(START_SPOTS);
    const x = rand(spot.x[0], spot.x[1]), z = rand(spot.z[0], spot.z[1]);
    const path = spot.path.map(([px, pz]) => [px + rand(-0.4, 0.4), pz + rand(-0.4, 0.4)]);
    const base = Math.atan2(path[0][0] - x, -(path[0][1] - z)); // 進む向き: (sin a, -cos a)
    player = {
      x, z, y: 0, vx: 0, vy: 0, vz: 0, base, heading: base, path, spot, state: 'pass', steps: 0, stepT: 0, lean: 0, side: 1,
      musasabi: false, shot: false, airT: 0, shotT: 0, groundT: 0, animPh: 0, slide: false,
      j: copyPose(runPose(0)),
    };
    const kt = pick(KEEPER_TYPES);
    keeper = {
      type: kt, x: 0.6, z: kt.z, baseZ: kt.z, stance: kt.move === 'restless' ? 'high' : 'ready',
      committed: null, commitAt: Infinity, label: '', labelT: 0, reactAt: Infinity, react: null,
      speed: kt.speed, t: 0, j: copyPose(KP.ready), hopT: 0, hopX: 0, feintT: rand(0.3, 0.6), feintX: 0, result: null, resultT: 0,
    };
    ball = null; footprints = [];
    hintBtn = null; jumpHint = false;
    // 左バックの味方からパス。直接・バウンド・山なりのどれか
    const mx = rand(spot.mate.x[0], spot.mate.x[1]), mz = rand(spot.mate.z[0], spot.mate.z[1]);
    mate = { x: mx, z: mz, y: 0, heading: Math.atan2(x - mx, -(z - mz)), j: copyPose(standPose()), t: -rand(0.05, 0.2) };
    const ptype = pick(Object.keys(PASS_TYPES));
    pass = { type: ptype, T: PASS_TYPES[ptype].T, t: 0, released: false, from: null, pos: null };
    game.phase = 'play';
    game.lineFlash = 0;
    showMsg(PASS_TYPES[ptype].name, `${spot.name} ／ GK：${kt.name}`, 'info', 1.6);
    updateHud();
  }

  function startGame() {
    initAudio();
    goLandscape();
    game.score = 0; game.shotNo = 0; game.goals = 0; game.combo = 0; game.history = [];
    game.paused = false; game.newRecord = false;
    $('#title').classList.remove('show');
    $('#result').classList.remove('show');
    $('#pause').classList.remove('show');
    Scene3D.clearConfetti();
    newAttempt();
  }

  function goTitle() {
    game.phase = 'title'; game.paused = false;
    player = null; keeper = null; ball = null; mate = null; pass = null;
    $('#result').classList.remove('show');
    $('#pause').classList.remove('show');
    $('#title').classList.add('show');
    $('#titleBest').textContent = game.best;
  }

  // スマホは全画面・横向きに(対応しているブラウザだけ)
  function goLandscape() {
    if (!isTouch) return;
    const el = document.documentElement;
    try {
      const p = el.requestFullscreen ? el.requestFullscreen() : null;
      if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
    } catch (e) { /* 非対応 */ }
  }

  function endGame() {
    game.phase = 'over';
    const s = game.score;
    const rank = s >= 1700 ? 'S' : s >= 1100 ? 'A' : s >= 600 ? 'B' : s >= 250 ? 'C' : 'D';
    if (s > game.best) { game.best = s; saveNum('musasabi.best', s); game.newRecord = true; }
    $('#rank').textContent = rank;
    $('#finalScore').textContent = `${s} 点 ／ ${game.goals} / ${TOTAL_SHOTS} ゴール（${game.nav ? 'ナビあり' : 'ナビなし'}）`;
    $('#newRecord').textContent = game.newRecord ? 'ベスト記録更新！' : `ベスト ${game.best} 点`;
    $('#history').innerHTML = game.history.map((h) => `<li class="${h.ok ? 'g' : 'x'}">${h.text}</li>`).join('');
    $('#result').classList.add('show');
    if (game.goals >= 3) { Scene3D.confetti(1.6); sfx.cheer(1.2); cheer = 1; }
  }

  function finishAttempt(ok, text) {
    game.phase = 'result';
    game.waitT = ok ? 3.2 : 2.6;
    game.history.push({ ok, text });
    updateHud();
  }

  function foul(title, sub) {
    if (game.phase !== 'play') return;
    sfx.whistle();
    showMsg(title, sub, 'fail', 2.2);
    game.combo = 0;
    if (player.state === 'run') player.state = 'stop';
    keeper.result = 'foul';
    finishAttempt(false, `失敗：${title}`);
    $('#steps').classList.add('foul');
  }

  // ================= 入力の判定 =================
  function canJump() { return game.phase === 'play' && player && player.state === 'run'; }
  // ダッシュを押したまま3歩目を踏んだときだけムササビになる
  function canMusa() { return canJump() && player.steps === 3 && input.dash; }
  function canShoot() {
    return game.phase === 'play' && player && !player.shot && (player.state === 'run' || player.state === 'air');
  }

  // ジャンプボタン: ふだんはジャンプ、ダッシュ中の3歩目だけムササビ
  function pressJump() { if (canMusa()) doJump(true); else doJump(false); }

  function doJump(musa) {
    if (!canJump() || (musa && !canMusa())) return;
    const p = player;
    p.state = 'air'; p.musasabi = musa; p.airT = 0; p.lean = 0;
    const aGoal = Math.atan2(-p.x, p.z);
    if (musa) {
      // ムササビ(プロンジョン): ゴールではなくコート中央側へ跳び込んで角度を広げる。体はゴールに向ける
      const fly = Math.atan2(-1.6 - p.x, -(Math.min(3.6, p.z - 0.6) - p.z));
      const sp = DASH_SPEED * 0.88;
      p.vx = sp * Math.sin(fly); p.vz = -sp * Math.cos(fly);
      p.heading = aGoal;
      p.side = Math.sign(Math.sin(fly - aGoal)) || 1;
    } else {
      // 普通のジャンプ: 走ってきた向きからゴールの方へ
      p.heading = p.heading + angDiff(aGoal, p.heading) * 0.6;
      const sp = (p.speed || JOG_SPEED) * 0.9;
      p.vx = sp * Math.sin(p.heading); p.vz = -sp * Math.cos(p.heading);
    }
    if (musa) {
      p.vy = 4.0;
      showMsg('ムササビ！', '長い滞空時間でキーパーの動きを見極めろ', 'musa', 1.0);
      keeper.commitAt = rand(0.45, 1.15);
    } else {
      p.vy = 4.4;
      keeper.commitAt = rand(0.4, 0.85);
    }
    sfx.jump();
  }

  function shotTiming() {
    if (player.state === 'run') return 'step';
    if (player.musasabi) return 'musasabi';
    if (player.airT < 0.24) return 'quick';
    if (player.vy > -1.2) return 'jump';
    return 'fall';
  }

  function doShoot(type) {
    if (!canShoot()) return;
    const timing = shotTiming();
    player.shot = true; player.shotT = 0; player.timing = timing;
    if (player.state === 'run') player.state = 'stop'; // ステップシュート後は止まる
    const hw = jointWorld(player, 'haR');
    const sx = hw[0], sy = hw[1], sz = Math.max(hw[2], 0.6);
    const dist = Math.hypot(sx, sz);
    // コースのばらつき
    let sig = { step: 0.2, quick: 0.18, jump: 0.13, fall: 0.17, musasabi: 0.085 }[timing];
    sig *= clamp(dist / 7, 0.6, 1.6);
    // ゴールが見える角度が狭いほど(サイドの奥ほど)ぶれる。中央へ跳び込むと角度が広がる
    const view = Math.abs(Math.atan2(GOAL_HW - sx, sz) - Math.atan2(-GOAL_HW - sx, sz));
    sig *= clamp(Math.pow(0.42 / Math.max(0.05, view), 0.8), 0.75, 2.4);
    const spinDir = type === 'spinL' ? -1 : type === 'spinR' ? 1 : 0;
    if (type === 'loop' || spinDir) sig *= 1.15;
    let tx = input.jx * 1.3 + gauss() * sig;
    let ty = 1.0 + input.jy * 0.78 + gauss() * sig * 0.7;
    // 体を倒すほど上のコースは打ちにくい
    if (player.musasabi) ty = Math.min(ty, 1.95 - player.lean * 0.75 + gauss() * 0.05);
    const b = { x: sx, y: sy, z: sz, vx: 0, vy: 0, vz: 0, type, timing, state: 'fly', bounced: false,
      passedKeeper: false, t: 0, trail: [], spin: spinDir, tx, ty, spinAng: 0 };
    if (type === 'normal') {
      setVel(b, tx, ty, 0, dist / (timing === 'step' ? 17 : 16));
    } else if (type === 'loop') {
      ty = clamp(1.55 + input.jy * 0.25 + gauss() * 0.08, 1.2, 2.0 - (player.musasabi ? player.lean * 0.45 : 0));
      setVel(b, tx, ty, 0, 0.5 + dist * 0.075);
    } else {
      // バウンド・スピン: 床に一度当てる
      const zb = clamp(sz * 0.32, 1.1, 2.4);
      const s = (sz - zb) / sz;
      let fakeX = tx;
      if (spinDir) {
        // 左スピンはバウンドしてから左へ、右スピンは右へ切れる。逆側を狙うように見せる
        if (Math.abs(input.jx) < 0.2) tx = spinDir * rand(0.7, 1.05) + gauss() * sig * 0.5;
        fakeX = clamp(tx - spinDir * 1.5, -1.7, 1.7);
      }
      const xb = sx + (fakeX - sx) * s;
      setVel(b, xb, BALL_R, zb, (dist * s) / (spinDir ? 13 : 14.5));
      b.tx = tx; b.ty = ty;
    }
    ball = b;
    sfx.shot();
    if (timing === 'musasabi') game.slowT = 0.55; // ムササビで打った瞬間はスローモーション
    keeperOnShot();
  }

  function setVel(b, tx, ty, tz, T) {
    b.vx = (tx - b.x) / T;
    b.vz = (tz - b.z) / T;
    b.vy = (ty - b.y + 0.5 * G * T * T) / T;
  }

  // ================= 更新 =================
  function jointWorld(p, name) {
    const j = p.j[name];
    const a = p.heading, c = Math.cos(a), s = Math.sin(a);
    return [p.x + j[0] * c - j[2] * s, p.y + j[1], p.z + j[0] * s + j[2] * c];
  }

  // 画面基準の方向(方角リング)をワールドの向きへ
  // 走るコースに沿って向きを決める(次の点に近づいたら次へ)
  function updateBase(p) {
    if (p.path.length > 1 && Math.hypot(p.path[0][0] - p.x, p.path[0][1] - p.z) < 1.3) p.path.shift();
    const t = p.path[0];
    p.base = Math.atan2(t[0] - p.x, -(t[1] - p.z));
  }
  function steerHeading(p) {
    updateBase(p);
    const m = Math.hypot(input.jx, input.jy);
    if (m < 0.15) return p.base;
    const fx = cam.lx - cam.x, fz = cam.lz - cam.z, fl = Math.hypot(fx, fz) || 1;
    const nfx = fx / fl, nfz = fz / fl;            // 画面の奥
    const rx = -nfz, rz = nfx;                     // 画面の右
    const wx = input.jx * rx + input.jy * nfx, wz = input.jx * rz + input.jy * nfz;
    const want = Math.atan2(wx, -wz);
    return p.base + clamp(angDiff(want, p.base), -1.15, 1.15);
  }

  function updatePlayer(dt) {
    const p = player;
    let target;
    if (p.state === 'pass') {
      // パスを受けるまで少し走る(歩数はまだ数えない)
      const h = steerHeading(p);
      p.heading += clamp(angDiff(h, p.heading), -3.2 * dt, 3.2 * dt);
      const sp = input.dash ? JOG_SPEED : JOG_SPEED * 0.75; // 受けるまではゆっくり
      p.speed = sp;
      p.vx = sp * Math.sin(p.heading); p.vz = -sp * Math.cos(p.heading);
      p.x += p.vx * dt; p.z += p.vz * dt;
      p.animPh += dt * Math.PI / STEP_INTERVAL * 0.85;
      target = pass.released && pass.t > pass.T - 0.25 ? catchPose(p.animPh) : runPose(p.animPh, false);
    } else if (p.state === 'run') {
      const h = steerHeading(p);
      p.heading += clamp(angDiff(h, p.heading), -3.2 * dt, 3.2 * dt);
      // ダッシュ長押しで速く・歩幅も大きく
      const sp = input.dash ? DASH_SPEED : JOG_SPEED;
      p.speed = lerp(p.speed || sp, sp, 1 - Math.exp(-6 * dt));
      p.vx = p.speed * Math.sin(p.heading);
      p.vz = -p.speed * Math.cos(p.heading);
      p.x += p.vx * dt; p.z += p.vz * dt;
      p.x = clamp(p.x, -9.7, 9.7);
      const interval = input.dash ? DASH_STEP : JOG_STEP;
      if (game.phase === 'play') {
        p.stepT += dt * STEP_INTERVAL / interval;
        if (p.stepT >= STEP_INTERVAL) {
          p.stepT -= STEP_INTERVAL;
          p.steps++;
          const side = p.steps % 2 ? -1 : 1;
          footprints.push({ x: p.x + Math.cos(p.heading) * 0.13 * side, z: p.z + Math.sin(p.heading) * 0.13 * side, n: p.steps, a: p.heading });
          sfx.squeak();
          if (p.steps === 3) showMsg('3歩！', input.dash ? '左足で踏み切ってムササビ！' : 'ダッシュしていないのでジャンプだけ', input.dash ? 'musa' : 'info', 0.6);
          if (p.steps >= 4) foul('オーバーステップ', '4歩目を踏んでしまった！');
          updateHud();
        }
        if (areaDist(p.x, p.z) < AREA_R) { game.lineFlash = 2; foul('ラインクロス', '6mラインを踏んでしまった！'); }
      }
      p.animPh = (p.steps + p.stepT / STEP_INTERVAL) * Math.PI;
      target = runPose(p.animPh, false);
      if (p.steps === 3 && p.stepT < 0.12) { // 3歩目(左足)で踏み切りの構え
        target = runPose(Math.PI * 1.5, true);
      }
    } else if (p.state === 'stop') {
      p.vx *= Math.exp(-5 * dt); p.vz *= Math.exp(-5 * dt);
      p.x += p.vx * dt; p.z += p.vz * dt;
      p.groundT += dt;
      target = afterPose(p) || (p.shot ? throwPose(standPose()) : standPose());
    } else if (p.state === 'air') {
      p.airT += dt;
      let g = G;
      if (p.musasabi && p.vy < 0.5) g = 2.0;
      p.vy -= g * dt;
      if (p.musasabi) {
        p.vy = Math.max(p.vy, -0.62);
        p.vx *= Math.exp(-0.15 * dt); p.vz *= Math.exp(-0.15 * dt);
      }
      p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
      if (p.z < keeper.z + 0.9) { p.z = keeper.z + 0.9; p.vz = 0; }
      p.x = Math.max(p.x, -3);
      if (p.musasabi) {
        // まず高く跳んでキーパーを見る。滞空の後半で体を大きく広げて倒す
        p.lean = Math.max(p.lean, clamp((p.airT - 0.45) / 0.7, 0, 1));
        let base = p.shot && p.shotT < 0.45 ? spreadThrowPose() : spreadPose();
        const rise = clamp(p.airT / 0.25, 0, 1);
        if (rise < 1) { const j = jumpPose(); for (const k of JOINTS) for (let i = 0; i < 3; i++) base[k][i] = lerp(j[k][i], base[k][i], rise); }
        target = tiltPose(base, p.lean * 1.1 * p.side, p.lean * 0.4);
      } else {
        target = p.shot ? throwPose(jumpPose()) : jumpPose();
      }
      // 着地: 体のどこか(ムササビは手足)が床に着いたら
      if (p.vy < 0 && p.airT > 0.15 && (p.y <= 0 || lowestJoint(p) <= 0.03)) {
        p.state = 'ground'; p.slide = p.musasabi; p.groundT = 0;
        if (!p.musasabi) p.y = 0;
        if (!p.shot) foul('シュートできず', 'シュートする前に着地してしまった！');
        else sfx.bounce();
      }
    } else { // ground
      p.groundT += dt;
      p.vx *= Math.exp(-(p.slide ? 2.5 : 7) * dt); p.vz *= Math.exp(-(p.slide ? 2.5 : 7) * dt);
      p.x += p.vx * dt; p.z += p.vz * dt;
      if (p.z < keeper.z + 0.9) { p.z = keeper.z + 0.9; p.vz = 0; }
      // ムササビは手足で受けて背中の方へ転がる(受け身)
      target = (!p.slide && afterPose(p)) || (p.slide ? tiltPose(spreadPose(), (1.1 + 0.5 * clamp(p.groundT / 0.5, 0, 1)) * p.side, 0.4 - 0.5 * clamp(p.groundT / 0.6, 0, 1)) : landPose());
    }
    if (p.shot) p.shotT += dt;
    blendPose(p.j, target, 1 - Math.exp(-(p.state === 'run' || p.state === 'pass' ? 22 : 12) * dt));
    if (p.state === 'ground' && p.slide) p.y = Math.max(0, p.y - Math.max(0, lowestJoint(p) - 0.07) * Math.min(1, dt * 8) - 0.0);
    if (p.state === 'ground' && p.slide) { const lo = lowestJoint(p); if (lo < 0.05) p.y += 0.05 - lo; else p.y -= Math.min(lo - 0.05, dt * 1.5); }
  }
  function lowestJoint(p) {
    let m = Infinity;
    for (const n of JOINTS) m = Math.min(m, p.y + p.j[n][1]);
    return m;
  }

  // パス: 味方が投げて、走っている選手の手に届く
  function updatePass(dt) {
    mate.t += dt;
    const p = player;
    if (!pass.released && mate.t >= 0.2) {
      pass.released = true;
      pass.from = jointWorld(mate, 'haR');
      pass.t = 0;
      sfx.jump();
    }
    if (mate.t < 1.2) mate.heading += angDiff(Math.atan2(p.x - mate.x, -(p.z - mate.z)), mate.heading) * Math.min(1, dt * 6);
    blendPose(mate.j, game.phase === 'result' && ball && ball.state === 'goal' ? celebratePose(game.time + 1) : passerPose(mate.t), 1 - Math.exp(-14 * dt));
    if (!pass.released || p.state !== 'pass') return;
    pass.t += dt;
    const u = clamp(pass.t / pass.T, 0, 1);
    const to = jointWorld(p, 'haR'), f = pass.from;
    const x = lerp(f[0], to[0], u), z = lerp(f[2], to[2], u);
    let y;
    if (pass.type === 'direct') y = lerp(f[1], to[1], u) + Math.sin(Math.PI * u) * 0.35;
    else if (pass.type === 'lob') y = lerp(f[1], to[1], u) + Math.sin(Math.PI * u) * 2.2;
    else { // バウンド: 6割の所で床に一度つく
      const ub = 0.58;
      if (u < ub) { const k = u / ub; y = lerp(f[1], BALL_R, k) + Math.sin(Math.PI * k) * 0.15 * (1 - k); }
      else { const k = (u - ub) / (1 - ub); y = lerp(BALL_R, to[1], k) + Math.sin(Math.PI * k) * 0.45; }
      if (!pass.bounced && u >= ub) { pass.bounced = true; sfx.bounce(); }
    }
    pass.pos = [x, y, z];
    if (u >= 1) { // キャッチ。ここから歩数を数える
      p.state = 'run'; p.stepT = 0; p.steps = 0;
      sfx.catch();
      showMsg('キャッチ！', '3歩以内に跳べ', 'info', 0.7);
    }
  }

  // 結果が出たあとの喜び・がっかり
  function afterPose(p) {
    if (game.phase !== 'result' || !ball || p.groundT < (p.slide ? 1.0 : 0.5)) return null;
    if (ball.state === 'goal') return celebratePose(game.time);
    return sadPose();
  }

  function keeperOnShot() {
    const k = keeper;
    // 投げられた瞬間の軌道から読む(バウンドの変化は読めない)
    const t = (ball.z - k.z) / Math.max(0.1, -ball.vz);
    let px = ball.x + ball.vx * t;
    let py = ball.y + ball.vy * t - 0.5 * G * t * t;
    let delay = k.type.react + rand(-0.04, 0.08);
    if (player.timing === 'step') delay += 0.09;      // 不意を突かれる
    if (player.timing === 'quick') delay += 0.08;
    if (k.committed) delay += 0.1;
    // 読み違い
    if (!k.committed && Math.random() < 0.22) { px += rand(-0.8, 0.8); py = rand(0.2, 2.0); }
    k.react = { x: px, y: py };
    k.reactAt = k.t + delay;
  }

  function keeperCommit() {
    const k = keeper;
    const c = weighted(k.type.commit);
    k.committed = c;
    k.label = COMMIT_LABEL[c]; k.labelT = 1.6;
    if (c === 'wait') return;
    if (c === 'diveL') k.tx = k.x - 0.35;
    if (c === 'diveR') k.tx = k.x + 0.35;
    if (c === 'out') k.tz = Math.min(2.6, keeper.z + 1.4);
    k.stance = c === 'out' ? 'ready' : c;
  }

  function updateKeeper(dt) {
    const k = keeper, p = player;
    k.t += dt;
    if (k.labelT > 0) k.labelT -= dt;
    let tx = k.x, tz = k.baseZ, speed = k.speed;
    const sx = ball ? ball.x : p.x, sz = Math.max(ball ? ball.z : p.z, 1);
    if (k.result) {
      // 結果のあと: セーブなら喜ぶ、決められたらうなだれる
      k.resultT += dt;
      if (k.resultT > 0.5) k.stance = k.result === 'save' ? 'cheer' : k.result === 'goal' && !k.stance.startsWith('dive') ? 'sad' : k.stance;
      if (k.resultT > 1.2 && k.stance.startsWith('dive')) k.stance = k.result === 'save' ? 'cheer' : 'sad';
      speed = 1.2; tx = k.x;
    } else if (!k.committed || k.committed === 'wait') {
      // 角度を消す位置取り(画面右のサイドからだとニア=右ポスト側)
      tx = sx * (k.z / (sz + k.z)) * 1.4 + Math.sign(sx) * k.type.bias * clamp(Math.abs(sx) / 4, 0, 1);
      const m = k.type.move;
      if (m === 'sway') tx += Math.sin(k.t * 3.2) * 0.45;
      if (m === 'advance') tz = k.baseZ + clamp((11 - p.z) * 0.18, 0, 0.8);
      if (m === 'rush') { // シューターに向かって飛び出し、角度を消す
        const d = Math.hypot(p.x - k.x, p.z - k.z);
        tz = k.baseZ + clamp((9.5 - d) * 0.4, 0, 1.7);
        tx = clamp(p.x * 0.18, -1.3, 1.3);
      }
      if (m === 'feint') { // 片側に寄って見せてから戻る
        k.feintT -= dt;
        if (k.feintT <= 0) {
          k.feintT = rand(0.45, 0.9);
          k.feintX = k.feintX ? 0 : (Math.random() < 0.5 ? -0.6 : 0.6);
          k.stance = k.feintX ? (k.feintX < 0 ? 'lowL' : 'lowR') : 'ready';
        }
        tx += k.feintX;
      }
      if (m === 'restless') {
        k.hopT -= dt;
        if (k.hopT <= 0) { k.hopT = rand(0.35, 0.7); k.hopX = rand(-0.4, 0.4); k.stance = pick(['ready', 'high', 'ready', 'lowL', 'lowR', 'spread']); }
        tx += k.hopX;
      }
      tx = clamp(tx, -1.1, 1.1);
    } else {
      if (k.tx !== undefined) tx = k.tx;
      if (k.tz !== undefined) tz = k.tz;
      speed = k.committed.startsWith('dive') ? 3.5 : 2.5;
    }
    // シュートへの反応
    if (!k.result && k.react && k.t >= k.reactAt) {
      const r = k.react;
      if (!k.committed || k.committed === 'wait' || k.committed === 'out') {
        const off = r.x - k.x;
        if (r.y < 0.55) k.stance = Math.abs(off) > 0.5 ? (off < 0 ? 'lowL' : 'lowR') : 'low';
        else if (Math.abs(off) > 0.65 && Math.random() < 0.6) k.stance = off < 0 ? 'diveL' : 'diveR';
        else k.stance = r.y > 1.45 ? 'high' : 'ready';
        if (k.stance === 'diveL') tx = r.x + 0.75;
        else if (k.stance === 'diveR') tx = r.x - 0.75;
        else if (k.stance === 'lowL') tx = r.x + 0.85;
        else if (k.stance === 'lowR') tx = r.x - 0.85;
        else tx = r.x - Math.sign(off) * 0.45;
        k.react = null; k.tx = tx; k.committed = k.committed || 'react';
        speed = 4.2;
      } else {
        k.react = null; // 決め打ち中は動けない
      }
    }
    if (!k.result && k.committed === 'react') { tx = k.tx; speed = 4.2; }
    tx = clamp(tx, -1.3, 1.3);
    k.x += clamp(tx - k.x, -speed * dt, speed * dt);
    k.z += clamp(tz - k.z, -2.6 * dt, 2.6 * dt);
    // 空中にいる間の決め打ち
    if (!k.result && p.state === 'air' && !p.shot && !k.committed && p.airT >= k.commitAt) keeperCommit();
    // 構えの手を小さく揺らす
    const tgt = KP[k.stance];
    let pose = tgt;
    if (k.stance === 'ready' || k.stance === 'high' || k.stance === 'spread' || k.stance === 'cheer') {
      pose = copyPose(tgt);
      const bob = k.stance === 'cheer' ? Math.abs(Math.sin(k.t * 8)) * 0.18 : 0;
      for (const n of JOINTS) pose[n][1] += bob;
      if (k.stance !== 'cheer') {
        pose.haL[1] += Math.sin(k.t * 6) * 0.05; pose.haR[1] += Math.sin(k.t * 6 + 1.6) * 0.05;
        pose.hip[1] += Math.sin(k.t * 12) * 0.015;
      }
    }
    const fast = k.stance.startsWith('dive') || k.stance === 'star' ? 16 : 11;
    blendPose(k.j, pose, 1 - Math.exp(-fast * dt));
  }

  function keeperHit(bx, by) {
    const k = keeper, j = k.j, rr = BALL_R + 0.02;
    const hd = j.head;
    if (Math.hypot(bx - (k.x + hd[0]), by - hd[1]) < 0.13 + rr) return true;
    for (const [a, b, r] of KEEPER_SEGS) {
      if (segDist(bx, by, k.x + j[a][0], j[a][1], k.x + j[b][0], j[b][1]) < r + rr) return true;
    }
    for (const h of ['haL', 'haR']) {
      if (Math.hypot(bx - (k.x + j[h][0]), by - j[h][1]) < 0.1 + rr) return true;
    }
    return false;
  }

  function updateBall(dt) {
    const b = ball;
    const n = 4, h = dt / n;
    for (let i = 0; i < n; i++) {
      const pz = b.z;
      b.vy -= G * h;
      b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
      b.t += h;
      if (b.y <= BALL_R && b.vy < 0) {
        b.y = BALL_R;
        if (!b.bounced && (b.type === 'bound' || b.spin) && b.state === 'fly') {
          b.bounced = true;
          if (b.spin) {
            b.vy = -b.vy * 0.5; b.vz *= 0.78;
            const tt = b.z / Math.max(0.5, -b.vz);
            b.vx = (b.tx - b.x) / tt;
          } else {
            b.vy = -b.vy * 0.58; b.vz *= 0.9; b.vx *= 0.9;
          }
          sfx.bounce();
        } else {
          b.vy = -b.vy * 0.45; b.vx *= 0.8; b.vz *= 0.8;
          if (Math.abs(b.vy) > 0.8) sfx.bounce();
        }
      }
      if (b.state === 'fly') {
        if (!b.passedKeeper && pz > keeper.z && b.z <= keeper.z) {
          b.passedKeeper = true;
          if (keeperHit(b.x, b.y)) { resolveShot('save'); b.vz = Math.abs(b.vz) * 0.35 + 1; b.vy = rand(1.5, 4); b.vx = rand(-3, 3); }
        }
        if (b.state === 'fly' && pz > 0 && b.z <= 0) {
          const ax = Math.abs(b.x);
          if (ax < GOAL_HW - BALL_R * 0.6 && b.y < GOAL_H - BALL_R * 0.6) {
            resolveShot('goal'); b.vz *= 0.35; b.vx *= 0.4;
          } else if ((ax < GOAL_HW + BALL_R && Math.abs(b.y - GOAL_H) < BALL_R * 1.4) ||
            (Math.abs(ax - GOAL_HW) < BALL_R * 1.4 && b.y < GOAL_H + BALL_R)) {
            resolveShot('post'); b.vz = Math.abs(b.vz) * 0.5; b.vx = -b.vx * 0.4 + rand(-1, 1);
          } else {
            resolveShot('miss');
          }
        }
        if (b.state === 'fly' && (b.t > 3 || b.z > 30)) resolveShot('miss');
      } else if (b.state === 'goal') {
        if (b.z < -0.85) { b.z = -0.85; b.vz = 0; b.vx *= 0.5; }
        if (b.y > GOAL_H - BALL_R) { b.y = GOAL_H - BALL_R; b.vy = 0; }
        b.x = clamp(b.x, -GOAL_HW + BALL_R, GOAL_HW - BALL_R);
      }
    }
    b.spinAng += dt * (b.spin ? 30 : 12);
  }

  function resolveShot(kind) {
    const b = ball;
    b.state = kind;
    if (game.phase !== 'play') return;
    keeper.result = kind === 'save' ? 'save' : kind === 'goal' ? 'goal' : 'miss';
    const label = `${TIMINGS[b.timing].name}・${SHOT_TYPES[b.type].name}シュート`;
    if (kind === 'goal') {
      game.combo++; game.goals++;
      let pts = Math.round(SHOT_TYPES[b.type].pts * TIMINGS[b.timing].mult);
      const corner = Math.abs(b.x) > 1.0 && (b.y > 1.5 || b.y < 0.5);
      if (corner) pts += 50;
      if (game.combo > 1) pts += 50 * (game.combo - 1);
      game.score += pts;
      showMsg('GOAL!!', `${label}　+${pts}${corner ? '（隅！）' : ''}${game.combo > 1 ? `　${game.combo}連続！` : ''}`, 'goal', 2.6);
      sfx.net(); sfx.cheer(b.timing === 'musasabi' ? 1.3 : 1);
      Scene3D.confetti(b.timing === 'musasabi' ? 1.6 : 1);
      cheer = 1;
      finishAttempt(true, `GOAL ${label} +${pts}`);
    } else {
      game.combo = 0;
      if (kind === 'save') { sfx.save(); showMsg('セーブ…', `${label}はキーパーに止められた`, 'fail', 2.2); }
      else if (kind === 'post') { sfx.post(); showMsg('ポスト！', `${label}は枠に嫌われた`, 'fail', 2.2); }
      else showMsg('はずれ…', `${label}は枠の外`, 'fail', 2.2);
      sfx.groan();
      finishAttempt(false, `${{ save: 'セーブ', post: 'ポスト', miss: '枠外' }[kind]}　${label}`);
    }
  }

  // ナビ: 今押すとよいボタン・跳ぶべき時
  function updateNav() {
    hintBtn = null; jumpHint = false;
    if (!game.nav || game.phase !== 'play' || !player) return;
    const p = player;
    if (p.state === 'run') {
      // 次の1歩で6mラインに入る / 4歩目になる → 跳べ
      const left = STEP_INTERVAL - p.stepT;
      const nx = p.x + p.vx * (left + 0.05), nz = p.z + p.vz * (left + 0.05);
      jumpHint = p.steps === 3 || areaDist(nx, nz) < AREA_R + 0.1;
    } else if (p.state === 'air' && !p.shot) {
      const c = COUNTER[keeper.committed];
      if (c) hintBtn = c.btn;
      else if (p.y < 0.35 && p.vy < 0) hintBtn = 'normal'; // 着地しそう
    }
  }

  // ================= カメラ =================
  const cam = { x: 14, y: 3, z: 12, lx: 0, ly: 1, lz: 0, init: false };
  function updateCamera(dt) {
    let tx, ty, tz, lx, ly, lz;
    if (!player) {
      // タイトル: 右サイドからゴールを眺める
      tx = 10 + Math.sin(game.time * 0.15) * 2; ty = 3.4; tz = 10.5;
      lx = 1; ly = 1.2; lz = 1;
    } else {
      const p = player;
      const fx = ball && ball.state === 'fly' ? (p.x + ball.x) / 2 : p.x;
      let dx = fx * 0.75, dz = Math.max(p.z, 1.5) + 1.2;
      const dl = Math.hypot(dx, dz);
      const dist = Math.max(dl + 4.2, 8.5);
      tx = (dx / dl) * dist; tz = (dz / dl) * dist;
      const high = p.state === 'air' || p.state === 'ground' ? (p.musasabi ? 1.6 : 0.8) : 0;
      ty = 2.6 + high + p.y * 0.3;
      lx = p.x * 0.35; ly = 1.0 - high * 0.15; lz = 1.0;
    }
    const a = cam.init ? 1 - Math.exp(-4 * dt) : 1;
    cam.init = true;
    cam.x = lerp(cam.x, tx, a); cam.y = lerp(cam.y, ty, a); cam.z = lerp(cam.z, tz, a);
    cam.lx = lerp(cam.lx, lx, a); cam.ly = lerp(cam.ly, ly, a); cam.lz = lerp(cam.lz, lz, a);
  }

  // ================= 2D 表示(方角リング・ボタンなど) =================
  const H = 640;
  let W = 960, overlayScale = 1;
  const RING = { x: 125, y: 510, r: 95, dead: 14 };
  // 右側のシュートボタン(ひし形): まん中 ノーマル / 上 ループ / 左 左スピン / 右 右スピン / 下 バウンド(地上で押すとステップシュート)
  // その左の列: 上 ジャンプ(ダッシュ中の3歩目だけ自動でムササビに変わる。ずっと表示) / 下 ダッシュ(長押し)
  const BTN = {
    normal: { x: 785, y: 465, r: 50, key: 'U' },
    loop: { x: 785, y: 360, r: 46, key: 'I' },
    spinL: { x: 680, y: 465, r: 46, key: 'J' },
    spinR: { x: 890, y: 465, r: 46, key: 'L' },
    bound: { x: 785, y: 570, r: 46, key: 'K' },
    jump: { x: 560, y: 440, r: 54, key: 'Space' },
    dash: { x: 560, y: 568, r: 50, key: 'Shift' },
  };
  const BTN_SUB = { loop: '高く山なり', normal: '速いシュート', spinL: '左へ切れる', spinR: '右へ切れる', bound: '足元を抜く' };
  const pointers = new Map(); // pointerId -> 'ring' | ボタンの名前 | 'none'
  const ringInput = { active: false, mx: 0, my: 0 };

  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  function buttonOn(name) {
    if (!player || game.phase !== 'play') return false;
    if (name === 'jump') return canJump();
    if (name === 'dash') return player.state === 'run' || player.state === 'pass';
    return canShoot();
  }
  function hitButton(p) {
    let best = null, bd = Infinity;
    for (const name in BTN) {
      const b = BTN[name];
      const d = Math.hypot(p.x - b.x, p.y - b.y) - b.r;
      if (d < bd) { bd = d; best = name; }
    }
    return bd <= (isTouch ? 18 : 8) ? best : null;
  }
  function setRing(p) {
    const dx = p.x - RING.x, dy = p.y - RING.y;
    const d = Math.hypot(dx, dy);
    if (d < RING.dead) { ringInput.mx = 0; ringInput.my = 0; return; }
    // 円の方角合わせ: 16方位にスナップ
    const step = Math.PI / 8;
    const ang = Math.round(Math.atan2(dx, -dy) / step) * step;
    const mag = Math.min(1, (d - RING.dead) / (RING.r * 0.45)); // 少し倒すだけでいっぱい
    ringInput.mx = Math.sin(ang) * mag;
    ringInput.my = Math.cos(ang) * mag;
  }
  function pressButton(name) {
    if (name === 'jump') pressJump();
    else doShoot(name);
  }
  canvas.addEventListener('pointerdown', (e) => {
    initAudio();
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const p = canvasPos(e);
    if (game.paused || game.phase === 'title' || game.phase === 'over') { pointers.set(e.pointerId, 'none'); return; }
    if (Math.hypot(p.x - RING.x, p.y - RING.y) <= RING.r + 30) {
      pointers.set(e.pointerId, 'ring');
      ringInput.active = true;
      setRing(p);
      return;
    }
    const b = hitButton(p);
    if (b && b !== 'dash') pressButton(b);
    pointers.set(e.pointerId, b || 'none');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (pointers.get(e.pointerId) === 'ring') setRing(canvasPos(e));
  });
  function releasePointer(e) {
    if (pointers.get(e.pointerId) === 'ring') { ringInput.active = false; ringInput.mx = 0; ringInput.my = 0; }
    pointers.delete(e.pointerId);
  }
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);

  const KEYMAP = { u: 'normal', i: 'loop', j: 'spinL', l: 'spinR', k: 'bound' };
  window.addEventListener('keydown', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (input.keys.has(k)) return;
    input.keys.add(k);
    initAudio();
    if (game.phase === 'title' || game.phase === 'over') {
      if (k === ' ' || k === 'Enter') startGame();
      return;
    }
    if (k === 'p' || k === 'Escape') { togglePause(); return; }
    if (k === 'm') toggleMute();
    if (k === 'n') toggleNav();
    if (game.paused) return;
    if (k === ' ' || k === 'z') pressJump();
    if (KEYMAP[k]) doShoot(KEYMAP[k]);
  });
  window.addEventListener('keyup', (e) => { input.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key); });
  window.addEventListener('blur', () => input.keys.clear());

  function readInput() {
    const k = input.keys;
    let mx = 0, my = 0;
    if (k.has('ArrowUp') || k.has('w')) my += 1;
    if (k.has('ArrowDown') || k.has('s')) my -= 1;
    if (k.has('ArrowRight') || k.has('d')) mx += 1;
    if (k.has('ArrowLeft') || k.has('a')) mx -= 1;
    if (mx || my) { const m = Math.hypot(mx, my); mx /= m; my /= m; }
    else if (ringInput.active) { mx = ringInput.mx; my = ringInput.my; }
    let dash = k.has('Shift');
    for (const v of pointers.values()) if (v === 'dash') dash = true;
    if (!input.bot) { input.jx = mx; input.jy = my; input.dash = dash; }
  }

  function drawControls() {
    if (!player || (game.phase !== 'play' && game.phase !== 'result')) return;
    // 方角リング
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.arc(RING.x, RING.y, RING.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.stroke();
    const mx = input.jx, my = input.jy, mag = Math.hypot(mx, my);
    const cur = mag > 0.1 ? Math.atan2(mx, my) : null;
    for (let i = 0; i < 16; i++) {
      const ang = i * Math.PI / 8;
      const major = i % 2 === 0;
      const diff = cur == null ? 9 : Math.abs(((ang - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const lit = diff < 0.2;
      ctx.fillStyle = lit ? '#ffe14d' : (major ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)');
      const rr = RING.r - 12;
      ctx.beginPath();
      ctx.arc(RING.x + Math.sin(ang) * rr, RING.y - Math.cos(ang) * rr, lit ? 7 : (major ? 4.5 : 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    const airAim = player.state !== 'run' && player.state !== 'pass';
    ctx.fillText(airAim ? '高く' : '前・高く', RING.x, RING.y - RING.r - 6);
    ctx.fillText(airAim ? '低く' : '後ろ・低く', RING.x, RING.y + RING.r + 15);
    const kx = RING.x + mx * RING.r * 0.6, ky = RING.y - my * RING.r * 0.6;
    ctx.fillStyle = mag > 0.1 ? '#ffe14d' : 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.arc(kx, ky, RING.r * 0.17, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // ボタン
    ctx.save();
    const blink = Math.floor(game.time * 10) % 2 === 0;
    for (const name in BTN) {
      const b = BTN[name];
      const enabled = buttonOn(name);
      let held = false;
      for (const v of pointers.values()) if (v === name) held = true;
      const isJump = name === 'jump';
      const musa = isJump && canMusa();
      const hint = enabled && blink && (hintBtn === name || (isJump && jumpHint && !musa) ||
        (name === 'dash' && game.nav && player.state === 'run' && player.steps === 2 && !input.dash));
      ctx.globalAlpha = enabled ? 0.9 : 0.35;
      const r = musa ? b.r * (1.12 + 0.05 * Math.sin(game.time * 16)) : b.r;
      if (musa) {
        const gr = ctx.createLinearGradient(0, b.y - r, 0, b.y + r);
        gr.addColorStop(0, '#ffcf3a'); gr.addColorStop(1, '#ff8a00');
        ctx.fillStyle = held ? '#ffe14d' : gr;
      } else {
        ctx.fillStyle = held ? 'rgba(255,225,77,0.9)' : hint ? 'rgba(255,140,60,0.85)' : 'rgba(0,0,0,0.42)';
      }
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = musa ? '#fff3c0' : 'rgba(255,255,255,0.7)';
      ctx.lineWidth = musa ? 4 : 2.5; ctx.stroke();
      const fk = b.r / 46;
      // 球筋のアイコン
      if (name === 'dash' && input.dash && enabled) held = true;
      if (!isJump && name !== 'dash') drawShotIcon(name, b, fk, held);
      ctx.fillStyle = held || musa ? '#2a1400' : '#fff';
      ctx.textAlign = 'center';
      if (name === 'dash') {
        ctx.font = `900 ${Math.round(15 * fk)}px sans-serif`;
        ctx.fillText('ダッシュ', b.x, b.y + 2 * fk, r * 1.8);
        ctx.font = `bold ${Math.round(9.5 * fk)}px sans-serif`;
        ctx.fillText('長押し', b.x, b.y + 16 * fk, r * 1.6);
      } else if (isJump) {
        ctx.font = `900 ${Math.round((musa ? 19 : 17) * fk)}px sans-serif`;
        ctx.fillText(musa ? 'ムササビ' : 'ジャンプ', b.x, b.y + 6 * fk, r * 1.8);
      } else {
        ctx.font = `bold ${Math.round(16 * fk)}px sans-serif`;
        ctx.fillText(SHOT_TYPES[name].name, b.x, b.y + 8 * fk, b.r * 1.7);
        ctx.font = `bold ${Math.round(9.5 * fk)}px sans-serif`;
        ctx.fillText(BTN_SUB[name], b.x, b.y + 22 * fk, b.r * 1.6);
      }
      if (!isTouch) { ctx.font = '10px sans-serif'; ctx.fillStyle = held || musa ? '#2a1400' : 'rgba(255,255,255,0.8)'; ctx.fillText(b.key, b.x, b.y + r - 6); }
    }
    ctx.restore();
  }
  function drawShotIcon(name, b, fk, held) {
    ctx.save();
    ctx.translate(b.x, b.y - b.r * 0.42);
    ctx.scale(fk, fk);
    ctx.strokeStyle = held ? '#222' : '#ffe14d'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath();
    if (name === 'loop') { ctx.moveTo(-15, 6); ctx.quadraticCurveTo(0, -18, 15, 6); }
    else if (name === 'normal') { ctx.moveTo(-15, 0); ctx.lineTo(15, 0); ctx.moveTo(9, -5); ctx.lineTo(15, 0); ctx.lineTo(9, 5); }
    else if (name === 'spinL') { ctx.moveTo(-15, -6); ctx.lineTo(4, 6); ctx.lineTo(-8, -6); ctx.moveTo(-8, -6); ctx.lineTo(-3, -6); ctx.moveTo(-8, -6); ctx.lineTo(-7, -1); }
    else if (name === 'spinR') { ctx.moveTo(15, -6); ctx.lineTo(-4, 6); ctx.lineTo(8, -6); ctx.moveTo(8, -6); ctx.lineTo(3, -6); ctx.moveTo(8, -6); ctx.lineTo(7, -1); }
    else { ctx.moveTo(-15, -8); ctx.lineTo(-2, 6); ctx.lineTo(15, -4); }
    ctx.stroke();
    ctx.restore();
  }

  // ゴールの狙い・キーパーの吹き出し・足あとの番号・ナビ
  function drawWorldMarks() {
    if (!player) return;
    // 足あとの番号
    ctx.textAlign = 'center';
    for (const f of footprints) {
      const p = Scene3D.project(f.x, 0.05, f.z);
      if (p.behind) continue;
      ctx.font = 'bold 18px sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.fillStyle = f.n >= 4 ? '#ff4040' : f.n === 3 ? '#ffd84a' : '#fff';
      ctx.strokeText(f.n, p.x, p.y - 10); ctx.fillText(f.n, p.x, p.y - 10);
    }
    // コースの狙い(ゴールの面)
    if (game.phase === 'play' && !player.shot) {
      const p = Scene3D.project(input.jx * 1.3, 1.0 + input.jy * 0.78, 0.02);
      if (!p.behind) {
        const r = 11;
        ctx.strokeStyle = 'rgba(255,230,60,.95)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p.x - r * 1.6, p.y); ctx.lineTo(p.x + r * 1.6, p.y);
        ctx.moveTo(p.x, p.y - r * 1.6); ctx.lineTo(p.x, p.y + r * 1.6); ctx.stroke();
      }
    }
    // キーパーの吹き出し
    const k = keeper;
    if (k && k.labelT > 0 && k.label) {
      const top = Scene3D.project(k.x, 2.65, k.z);
      if (!top.behind) {
        const fs = 18;
        ctx.font = `bold ${fs}px sans-serif`;
        const w = ctx.measureText(k.label).width + 18;
        ctx.globalAlpha = clamp(k.labelT * 2, 0, 1);
        ctx.fillStyle = 'rgba(255,255,255,.95)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(top.x - w / 2, top.y - fs - 10, w, fs + 14, 9); else ctx.rect(top.x - w / 2, top.y - fs - 10, w, fs + 14);
        ctx.fill();
        ctx.beginPath(); ctx.moveTo(top.x - 7, top.y + 4); ctx.lineTo(top.x, top.y + 12); ctx.lineTo(top.x + 7, top.y + 4); ctx.fill();
        ctx.fillStyle = '#d02020'; ctx.textBaseline = 'middle';
        ctx.fillText(k.label, top.x, top.y - fs / 2 - 3);
        ctx.textBaseline = 'alphabetic';
        ctx.globalAlpha = 1;
      }
    }
    // ナビの「跳べ！」
    if (jumpHint && game.phase === 'play' && player.state === 'run') {
      const p = Scene3D.project(player.x, 2.4, player.z);
      if (!p.behind && Math.floor(game.time * 8) % 2 === 0) {
        ctx.font = '900 26px sans-serif';
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.fillStyle = player.steps === 3 && input.dash ? '#ffd84a' : '#ff9a3c';
        const t = player.steps === 3 && input.dash ? 'ムササビ！' : '跳べ！';
        ctx.strokeText(t, p.x, p.y); ctx.fillText(t, p.x, p.y);
      }
    }
  }

  function drawOverlay() {
    ctx.setTransform(overlayScale, 0, 0, overlayScale, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawWorldMarks();
    drawControls();
    if (game.paused) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, W, H); }
  }

  // ================= HUD・メッセージ =================
  let msgTimer = 0;
  function showMsg(big, sub, cls, dur) {
    const m = $('#msg');
    m.className = '';
    void m.offsetWidth;
    m.querySelector('.big').textContent = big;
    m.querySelector('.sub').textContent = sub || '';
    m.className = `show ${cls || ''}`;
    msgTimer = dur;
  }
  let hudKey = '';
  function updateHud() {
    const n = player ? player.steps : 0;
    const chance = !!player && n === 3 && player.state === 'run' && game.phase === 'play';
    const key = `${game.score}|${game.shotNo}|${n}|${chance}|${game.phase}|${game.best}|${game.nav}|${muted}`;
    if (key === hudKey) return;
    hudKey = key;
    $('#score').textContent = game.score;
    $('#best').textContent = game.best;
    $('#shotInfo').textContent = `${Math.max(1, Math.min(game.shotNo, TOTAL_SHOTS))} / ${TOTAL_SHOTS} 本目`;
    const st = $('#steps');
    st.querySelectorAll('i').forEach((el, i) => el.classList.toggle('on', i < n));
    st.classList.toggle('chance', chance);
    if (game.phase === 'play') st.classList.remove('foul');
    $('#hud').style.visibility = game.phase === 'title' ? 'hidden' : 'visible';
    $('#navBtn').textContent = `ナビ ${game.nav ? 'ON' : 'OFF'}`;
    $('#navBtn').classList.toggle('on', game.nav);
    $('#muteBtn').textContent = muted ? '🔇' : '🔊';
  }
  function toggleNav() { game.nav = !game.nav; saveNum('musasabi.nav', game.nav); updateHud(); }
  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.8;
    updateHud();
  }
  function togglePause() {
    if (game.phase !== 'play' && game.phase !== 'result') return;
    game.paused = !game.paused;
    $('#pause').classList.toggle('show', game.paused);
  }
  $('#navBtn').addEventListener('click', toggleNav);
  $('#muteBtn').addEventListener('click', () => { initAudio(); toggleMute(); });
  $('#startBtn').addEventListener('click', startGame);
  $('#retryBtn').addEventListener('click', startGame);
  $('#titleBtn').addEventListener('click', goTitle);
  $('#resumeBtn').addEventListener('click', togglePause);
  $('#pauseTitleBtn').addEventListener('click', goTitle);
  // 裏に回ったら一時停止して音を止める
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if ((game.phase === 'play' || game.phase === 'result') && !game.paused) togglePause();
      if (AC) AC.suspend();
    } else if (AC) AC.resume();
  });

  // ================= メインループ =================
  function update(dt) {
    game.time += dt;
    if (game.paused) return;
    if (game.slowT > 0) { game.slowT -= dt; dt *= 0.35; }
    readInput();
    if (player) {
      updatePass(dt);
      updatePlayer(dt);
      updateKeeper(dt);
      if (ball) updateBall(dt);
      updateNav();
    }
    if (game.phase === 'result') {
      game.waitT -= dt;
      if (game.waitT <= 0) {
        if (game.shotNo >= TOTAL_SHOTS) endGame();
        else newAttempt();
      }
    }
    if (game.lineFlash > 0) game.lineFlash -= dt;
    if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) $('#msg').classList.remove('show'); }
    cheer = Math.max(0, cheer - dt * 0.3);
    if (murmurGain) murmurGain.gain.value = 0.035 + cheer * 0.04;
    updateCamera(dt);
  }

  function heldBall() {
    if (ball) return { x: ball.x, y: ball.y, z: ball.z, spin: ball.spinAng };
    if (!player) return null;
    if (player.state === 'pass') {
      if (pass.pos) return { x: pass.pos[0], y: pass.pos[1], z: pass.pos[2], spin: pass.t * 15 };
      const w = jointWorld(mate, 'haR');
      return { x: w[0], y: w[1] + 0.07, z: w[2], spin: 0 };
    }
    const w = jointWorld(player, 'haR');
    const fx = Math.sin(player.heading), fz = -Math.cos(player.heading);
    return { x: w[0] + fx * 0.06, y: w[1] + 0.07, z: w[2] + fz * 0.06, spin: 0 };
  }

  function worldJoints(p) {
    const o = {};
    for (const n of JOINTS) o[n] = jointWorld(p, n);
    return o;
  }
  function keeperJoints(k) {
    const o = {};
    for (const n of JOINTS) { const j = k.j[n]; o[n] = [k.x + j[0], j[1], k.z + j[2]]; }
    return o;
  }
  function renderScene(dt) {
    Scene3D.render({
      cam,
      player: player && { j: worldJoints(player), heading: player.heading, x: player.x, z: player.z, y: player.y, musa: player.musasabi && player.state !== 'run', lean: player.lean },
      keeper: keeper && { j: keeperJoints(keeper), x: keeper.x, z: keeper.z },
      // カメラのすぐ近くに来た味方は描かない(画面をふさぐので)
      mate: mate && Math.hypot(mate.x - cam.x, mate.z - cam.z) > 2.4 && { j: worldJoints(mate), heading: mate.heading, x: mate.x, z: mate.z, y: 0 },
      ball: heldBall(),
      footprints,
      lineFlash: game.lineFlash > 0 ? 'foul' : (jumpHint && player && player.steps < 3 ? 'warn' : null),
      cheer,
      st: { shotNo: game.shotNo, total: TOTAL_SHOTS, score: game.score, goals: game.goals, phase: game.phase, time: game.time },
    }, dt);
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2);
    W = Math.round(H * r.width / r.height);
    if (isTouch) {
      Object.assign(RING, { x: 168, y: 478, r: 122, dead: 16 });
      const cx = W - 232;
      for (const [k, x, y, rr] of [['loop', cx, 290, 60], ['spinL', cx - 145, 430, 60], ['spinR', cx + 145, 430, 60], ['normal', cx, 430, 64], ['bound', cx, 570, 60], ['jump', cx - 320, 405, 70], ['dash', cx - 320, 562, 64]]) Object.assign(BTN[k], { x, y, r: rr });
    } else {
      const cx = W - 175;
      BTN.normal.x = BTN.loop.x = BTN.bound.x = cx; BTN.spinL.x = cx - 105; BTN.spinR.x = cx + 105; BTN.jump.x = BTN.dash.x = cx - 225;
    }
    overlayScale = (r.height / H) * dpr;
    canvas.width = Math.round(W * overlayScale);
    canvas.height = Math.round(H * overlayScale);
    Scene3D.resize(r.width, r.height, W);
  }

  Scene3D.init($('#view'));
  window.addEventListener('resize', resize);
  resize();
  $('#titleBest').textContent = game.best;
  updateHud();

  let last = performance.now(), acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;
    acc += frameDt;
    if (api.hold) acc = 0;
    while (acc >= DT) { update(DT); acc -= DT; }
    updateHud();
    renderScene(game.paused ? 0 : frameDt);
    drawOverlay();
  }
  requestAnimationFrame(frame);

  // テスト・デバッグ用
  const api = window.MS = {
    hold: false, game, input, update, doJump, doShoot, pressJump, pressCenter: pressJump, startGame, DT,
    get player() { return player; }, get keeper() { return keeper; }, get ball() { return ball; },
  };
})();
