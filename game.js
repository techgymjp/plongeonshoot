'use strict';
(() => {
  const $ = (s) => document.querySelector(s);
  const canvas = $('#game');
  const ctx = canvas.getContext('2d');

  // ================= 定数 =================
  const GOAL_HW = 1.5;          // ゴール半幅 (m)
  const GOAL_H = 2.0;           // ゴール高さ
  const AREA_R = 6;             // 6mライン
  const FREE_R = 9;             // 9mライン
  const G = 9.8;
  const BALL_R = 0.095;
  const RUN_SPEED = 3.2;
  const STEP_INTERVAL = 0.36;   // 1歩の間隔 (秒)
  const TOTAL_SHOTS = 5;
  const NEAR = 0.3;

  const SHOT_TYPES = {
    normal: { name: 'ノーマル', pts: 100 },
    loop: { name: 'ループ', pts: 150 },
    spin: { name: 'スピン', pts: 180 },
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
  // 開始地点（パスを受ける位置）
  const START_SPOTS = [
    { name: 'センター', x: [-1.2, 1.2], z: [10.3, 11.2] },
    { name: '左45度', x: [-5.2, -3.8], z: [9.4, 10.2] },
    { name: '右45度', x: [3.8, 5.2], z: [9.4, 10.2] },
    { name: '左サイド', x: [-9.2, -8.5], z: [6.6, 7.4] },
    { name: '右サイド', x: [8.5, 9.2], z: [6.6, 7.4] },
    { name: 'ロング', x: [-2.5, 2.5], z: [12.0, 12.8] },
  ];
  // キーパーのタイプ
  const KEEPER_TYPES = [
    { name: '定位置でじっくり型', z: 0.55, move: 'track', bias: 0, react: 0.2, speed: 3.0,
      commit: { star: 1, low: 1, diveL: 0.6, diveR: 0.6, out: 0.4, wait: 1.2 } },
    { name: '前に飛び出す型', z: 1.2, move: 'advance', bias: 0.1, react: 0.18, speed: 3.2,
      commit: { star: 1.2, low: 0.4, diveL: 0.5, diveR: 0.5, out: 1.6, wait: 0.3 } },
    { name: 'ニアを固める型', z: 0.6, move: 'track', bias: 0.45, react: 0.22, speed: 2.8,
      commit: { star: 0.6, low: 0.8, diveL: 1, diveR: 1, out: 0.5, wait: 0.6 } },
    { name: '左右に揺さぶる型', z: 0.7, move: 'sway', bias: 0, react: 0.24, speed: 3.4,
      commit: { star: 0.8, low: 0.8, diveL: 1.3, diveR: 1.3, out: 0.4, wait: 0.3 } },
    { name: 'ゴールライン型', z: 0.3, move: 'restless', bias: -0.15, react: 0.16, speed: 3.0,
      commit: { star: 1.4, low: 1.2, diveL: 0.5, diveR: 0.5, out: 0.3, wait: 0.5 } },
    { name: '大の字ジャンプ型', z: 0.8, move: 'track', bias: 0.1, react: 0.2, speed: 2.8,
      commit: { star: 2.6, low: 0.3, diveL: 0.4, diveR: 0.4, out: 0.6, wait: 0.2 } },
  ];
  const COMMIT_LABEL = {
    star: '大の字ジャンプ！', low: 'しゃがんだ！', diveL: '左に倒れた！', diveR: '右に倒れた！',
    out: '前に出てきた！', wait: 'じっと待っている…',
  };

  // ================= ユーティリティ =================
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
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

  // ================= 画面 =================
  let W = 0, H = 0, F = 600, CY = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    F = Math.min(H * 1.05, W * 1.5);
    CY = H * 0.36;
  }
  window.addEventListener('resize', resize);
  resize();

  // ================= カメラ =================
  const cam = { x: 0, y: 2.5, z: 14, fx: 0, fz: -1, pitch: 0.16 };
  function toCam(x, y, z) {
    const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
    const h = dx * cam.fx + dz * cam.fz;
    const side = dx * -cam.fz + dz * cam.fx;
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    return { s: side, u: dy * cp + h * sp, d: h * cp - dy * sp };
  }
  function camToScreen(c) {
    const k = F / c.d;
    return { x: W / 2 + c.s * k, y: CY - c.u * k, k };
  }
  function proj(x, y, z) {
    const c = toCam(x, y, z);
    if (c.d < NEAR) return null;
    return camToScreen(c);
  }
  // 近クリップ付きポリゴン
  function polyPath(pts3) {
    const cs = pts3.map((p) => toCam(p[0], p[1], p[2]));
    const out = [];
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i], b = cs[(i + 1) % cs.length];
      const ain = a.d >= NEAR, bin = b.d >= NEAR;
      if (ain) out.push(a);
      if (ain !== bin) {
        const t = (NEAR - a.d) / (b.d - a.d);
        out.push({ s: lerp(a.s, b.s, t), u: lerp(a.u, b.u, t), d: NEAR });
      }
    }
    if (out.length < 3) return false;
    ctx.beginPath();
    out.forEach((c, i) => {
      const p = camToScreen(c);
      if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
    });
    ctx.closePath();
    return true;
  }
  function line3(a, b, width, color) {
    let ca = toCam(a[0], a[1], a[2]), cb = toCam(b[0], b[1], b[2]);
    if (ca.d < NEAR && cb.d < NEAR) return;
    if (ca.d < NEAR || cb.d < NEAR) {
      const t = (NEAR - ca.d) / (cb.d - ca.d);
      const m = { s: lerp(ca.s, cb.s, t), u: lerp(ca.u, cb.u, t), d: NEAR + 1e-3 };
      if (ca.d < NEAR) ca = m; else cb = m;
    }
    const pa = camToScreen(ca), pb = camToScreen(cb);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, width * (pa.k + pb.k) / 2);
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
  }

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

  // ================= ゲーム状態 =================
  const game = {
    phase: 'title', score: 0, shotNo: 0, goals: 0, combo: 0, history: [], waitT: 0, time: 0,
  };
  const input = { jx: 0, jy: 0, keys: {} };
  let player, keeper, ball, footprints = [], confetti = [], crowd = [], cheer = 0, aimMark = null;

  // 観客
  (function makeCrowd() {
    const cols = ['#e74c3c', '#f1c40f', '#3498db', '#ecf0f1', '#2ecc71', '#e67e22', '#9b59b6', '#1abc9c', '#fd79a8'];
    for (let r = 0; r < 9; r++) {
      for (let i = 0; i < 46; i++) {
        crowd.push({
          x: -17 + i * 0.75 + rand(-0.15, 0.15) + (r % 2) * 0.37, row: r,
          y: 1.3 + r * 0.55, z: -8 - r * 0.7, c: pick(cols), ph: rand(0, 6.28), h: rand(0.9, 1.1),
        });
      }
    }
  })();

  function newAttempt() {
    game.shotNo++;
    const spot = pick(START_SPOTS);
    const x = rand(spot.x[0], spot.x[1]), z = rand(spot.z[0], spot.z[1]);
    const base = Math.atan2(-x, z); // ゴール中央へ向かう角度
    player = {
      x, z, y: 0, vx: 0, vy: 0, vz: 0, base, heading: base, state: 'run', steps: 0, stepT: 0,
      spot: spot.name, musasabi: false, shot: false, airT: 0, shotT: 0, animPh: 0, slide: false, j: copyPose(runPose(0)),
    };
    const kt = pick(KEEPER_TYPES);
    keeper = {
      type: kt, x: clamp(x * 0.1, -0.6, 0.6), z: kt.z, baseZ: kt.z, stance: kt.move === 'restless' ? 'high' : 'ready',
      committed: null, commitAt: Infinity, label: '', labelT: 0, reactAt: Infinity, react: null,
      speed: kt.speed, t: 0, j: copyPose(KP.ready), hopT: 0, hopX: 0,
    };
    ball = null; aimMark = null; footprints = [];
    input.jx = 0; input.jy = 0; updateKnob();
    game.phase = 'play';
    sfx.catch();
    showMsg('キャッチ！', `${spot.name}から ／ GK：${kt.name}`, 'info', 1.3);
    updateHud();
  }

  function startGame() {
    initAudio();
    game.score = 0; game.shotNo = 0; game.goals = 0; game.combo = 0; game.history = [];
    $('#title').classList.remove('show');
    $('#result').classList.remove('show');
    newAttempt();
  }

  function endGame() {
    game.phase = 'over';
    const s = game.score;
    const rank = s >= 1700 ? 'S' : s >= 1100 ? 'A' : s >= 600 ? 'B' : s >= 250 ? 'C' : 'D';
    $('#rank').textContent = rank;
    $('#finalScore').textContent = `${s} 点 ／ ${game.goals} / ${TOTAL_SHOTS} ゴール`;
    $('#history').innerHTML = game.history.map((h) => `<li class="${h.ok ? 'g' : 'x'}">${h.text}</li>`).join('');
    $('#result').classList.add('show');
    if (game.goals >= 3) { launchConfetti(1.5); sfx.cheer(1.2); }
  }

  function finishAttempt(ok, text) {
    game.phase = 'result';
    game.waitT = ok ? 3.0 : 2.4;
    game.history.push({ ok, text });
    updateHud();
  }

  function foul(title, sub) {
    if (game.phase !== 'play') return;
    sfx.whistle();
    showMsg(title, sub, 'fail', 2.2);
    game.combo = 0;
    if (player.state === 'run') player.state = 'stop';
    finishAttempt(false, `失敗：${title}`);
    $('#steps').classList.add('foul');
  }

  // ================= 入力 =================
  function canJump() { return game.phase === 'play' && player.state === 'run'; }
  function canMusa() { return canJump() && player.steps === 3; }
  function canShoot() {
    return game.phase === 'play' && !player.shot && (player.state === 'run' || player.state === 'air');
  }

  function doJump(musa) {
    if (!canJump() || (musa && !canMusa())) return;
    player.state = 'air'; player.musasabi = musa; player.airT = 0;
    if (musa) {
      player.vy = 4.0; player.vx *= 0.82; player.vz *= 0.82;
      showMsg('ムササビ！', '長い滞空時間でキーパーの動きを見極めろ', 'musa', 1.0);
      keeper.commitAt = rand(0.45, 1.15);
    } else {
      player.vy = 4.4; player.vx *= 0.9; player.vz *= 0.9;
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
    let sig = { step: 0.2, quick: 0.18, jump: 0.13, fall: 0.17, musasabi: 0.1 }[timing];
    sig *= clamp(dist / 7, 0.6, 1.6);
    if (type === 'loop' || type === 'spin') sig *= 1.15;
    let tx = input.jx * 1.3 + gauss() * sig;
    let ty = 1.0 + input.jy * 0.78 + gauss() * sig * 0.7;
    const b = { x: sx, y: sy, z: sz, vx: 0, vy: 0, vz: 0, type, timing, state: 'fly', bounced: false,
      passedKeeper: false, t: 0, trail: [], spin: 0, tx, ty };
    if (type === 'normal') {
      const T = dist / (timing === 'step' ? 17 : 16);
      setVel(b, tx, ty, 0, T);
    } else if (type === 'loop') {
      ty = clamp(1.55 + input.jy * 0.25 + gauss() * 0.08, 1.2, 2.0);
      const T = 0.5 + dist * 0.075;
      setVel(b, tx, ty, 0, T);
    } else {
      // バウンド・スピン：床に一度当てる
      const zb = clamp(sz * 0.32, 1.1, 2.4);
      const s = (sz - zb) / sz;
      let fakeX = tx;
      if (type === 'spin') {
        if (Math.abs(tx) < 0.35) tx = (Math.random() < 0.5 ? -1 : 1) * rand(0.6, 1.0);
        fakeX = -tx * 0.8;
        b.spin = Math.sign(tx);
      }
      const xb = sx + (fakeX - sx) * s;
      const T1 = (dist * s) / (type === 'spin' ? 13 : 14.5);
      setVel(b, xb, BALL_R, zb, T1);
      b.tx = tx; b.ty = ty; b.zb = zb;
    }
    ball = b;
    sfx.shot();
    keeperOnShot();
  }

  function setVel(b, tx, ty, tz, T) {
    b.vx = (tx - b.x) / T;
    b.vz = (tz - b.z) / T;
    b.vy = (ty - b.y + 0.5 * G * T * T) / T;
  }

  // ---- 方向カーソル（円） ----
  const stick = $('#stick'), knob = $('#knob');
  let stickId = null;
  function stickFrom(e) {
    const r = stick.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width * 0.4), dy = -(e.clientY - cy) / (r.height * 0.4);
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    input.jx = dx; input.jy = dy; updateKnob();
  }
  function updateKnob() {
    const r = stick.offsetWidth * 0.33;
    knob.style.transform = `translate(${input.jx * r}px, ${-input.jy * r}px)`;
  }
  stick.addEventListener('pointerdown', (e) => {
    e.preventDefault(); initAudio(); stickId = e.pointerId; stick.setPointerCapture(e.pointerId); stickFrom(e);
  });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) stickFrom(e); });
  const stickUp = (e) => { if (e.pointerId === stickId) { stickId = null; input.jx = 0; input.jy = 0; updateKnob(); } };
  stick.addEventListener('pointerup', stickUp);
  stick.addEventListener('pointercancel', stickUp);

  function bindBtn(el, fn) {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); initAudio(); fn(); });
  }
  bindBtn($('#jumpBtn'), () => doJump(false));
  bindBtn($('#musaBtn'), () => doJump(true));
  document.querySelectorAll('#shotBtns button').forEach((b) => bindBtn(b, () => doShoot(b.dataset.shot)));
  $('#startBtn').addEventListener('click', startGame);
  $('#retryBtn').addEventListener('click', startGame);
  $('#muteBtn').addEventListener('click', () => {
    muted = !muted; $('#muteBtn').textContent = muted ? '🔇' : '🔊';
    if (master) master.gain.value = muted ? 0 : 0.8;
  });

  const KEYMAP = { KeyZ: 'normal', KeyX: 'loop', KeyC: 'spin', KeyV: 'bound',
    Digit1: 'normal', Digit2: 'loop', Digit3: 'spin', Digit4: 'bound' };
  function keyStick() {
    if (stickId !== null) return;
    const k = input.keys;
    let dx = (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0);
    let dy = (k.ArrowUp || k.KeyW ? 1 : 0) - (k.ArrowDown || k.KeyS ? 1 : 0);
    const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    input.jx = dx; input.jy = dy; updateKnob();
  }
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if ((game.phase === 'title' || game.phase === 'over') && (e.code === 'Enter' || e.code === 'Space')) {
      e.preventDefault(); startGame(); return;
    }
    input.keys[e.code] = true;
    if (/Arrow|Key[WASD]$/.test(e.code)) { e.preventDefault(); keyStick(); }
    if (e.code === 'Space') { e.preventDefault(); doJump(false); }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyM') doJump(true);
    if (KEYMAP[e.code]) doShoot(KEYMAP[e.code]);
  });
  window.addEventListener('keyup', (e) => {
    input.keys[e.code] = false;
    if (/Arrow|Key[WASD]$/.test(e.code)) keyStick();
  });

  // ================= 更新 =================
  function jointWorld(p, name) {
    const j = p.j[name];
    // シューターは進行方向に合わせて回転させる
    const a = p.heading, c = Math.cos(a), s = Math.sin(a);
    const lx = j[0], lz = j[2];
    return [p.x + lx * c - lz * s, p.y + j[1], p.z + lx * s + lz * c];
  }

  function updatePlayer(dt) {
    const p = player;
    let target;
    if (p.state === 'run') {
      const h = p.base + input.jx * 0.6;
      p.heading = lerp(p.heading, h, 1 - Math.exp(-8 * dt));
      p.vx = RUN_SPEED * Math.sin(p.heading);
      p.vz = -RUN_SPEED * Math.cos(p.heading);
      p.x += p.vx * dt; p.z += p.vz * dt;
      p.x = clamp(p.x, -9.6, 9.6);
      if (game.phase === 'play') {
        p.stepT += dt;
        if (p.stepT >= STEP_INTERVAL) {
          p.stepT -= STEP_INTERVAL;
          p.steps++;
          const side = p.steps % 2 ? -1 : 1;
          footprints.push({ x: p.x + Math.cos(p.heading) * 0.13 * side, z: p.z + Math.sin(p.heading) * 0.13 * side, n: p.steps, a: p.heading });
          sfx.squeak();
          if (p.steps === 3) showMsg('3歩！', 'ムササビ チャンス！', 'musa', 0.6);
          if (p.steps >= 4) { foul('オーバーステップ', '4歩目を踏んでしまった！'); }
          updateHud();
        }
        if (areaDist(p.x, p.z) < AREA_R) foul('ラインクロス', '6mラインを踏んでしまった！');
      }
      p.animPh = (p.steps + p.stepT / STEP_INTERVAL) * Math.PI;
      target = runPose(p.animPh, false);
    } else if (p.state === 'stop') {
      p.vx *= Math.exp(-5 * dt); p.vz *= Math.exp(-5 * dt);
      p.x += p.vx * dt; p.z += p.vz * dt;
      target = p.shot ? throwPose(standPose()) : standPose();
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
      if (p.musasabi) {
        const blendIn = clamp(p.airT / 0.3, 0, 1);
        target = p.shot && p.shotT < 0.5 ? musaThrowPose() : musaPose();
        if (blendIn < 1) {
          const j = jumpPose(); for (const k of JOINTS) for (let i = 0; i < 3; i++) target[k][i] = lerp(j[k][i], target[k][i], blendIn);
        }
      } else {
        target = p.shot ? throwPose(jumpPose()) : jumpPose();
      }
      if (p.y <= 0 && p.vy < 0) {
        p.y = 0;
        p.state = 'ground'; p.slide = p.musasabi;
        if (!p.shot) foul('シュートできず', 'シュートする前に着地してしまった！');
        else sfx.bounce();
      }
    } else { // ground
      p.vx *= Math.exp(-(p.slide ? 2.5 : 7) * dt); p.vz *= Math.exp(-(p.slide ? 2.5 : 7) * dt);
      p.x += p.vx * dt; p.z += p.vz * dt;
      if (p.z < keeper.z + 0.9) { p.z = keeper.z + 0.9; p.vz = 0; }
      target = p.slide ? slidePose(musaThrowPose()) : landPose();
    }
    if (p.shot) p.shotT += dt;
    blendPose(p.j, target, 1 - Math.exp(-(p.state === 'run' ? 22 : 12) * dt));
  }

  function keeperOnShot() {
    const k = keeper;
    // 投げられた瞬間の軌道から読む（バウンドの変化は読めない）
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
    if (c === 'diveL') { k.tx = k.x - 0.35; }
    if (c === 'diveR') { k.tx = k.x + 0.35; }
    if (c === 'out') { k.tz = Math.min(2.6, keeper.z + 1.4); }
    k.stance = c === 'out' ? 'ready' : c;
  }

  function updateKeeper(dt) {
    const k = keeper, p = player;
    k.t += dt;
    if (k.labelT > 0) k.labelT -= dt;
    let tx = k.x, tz = k.baseZ, speed = k.speed;
    const sx = ball ? ball.x : p.x, sz = Math.max(ball ? ball.z : p.z, 1);
    if (!k.committed || k.committed === 'wait') {
      // 角度を消す位置取り
      tx = sx * (k.z / (sz + k.z)) * 1.4 + Math.sign(sx) * k.type.bias * clamp(Math.abs(sx) / 4, 0, 1);
      const m = k.type.move;
      if (m === 'sway') tx += Math.sin(k.t * 3.2) * 0.45;
      if (m === 'advance') tz = k.baseZ + clamp((11 - p.z) * 0.18, 0, 0.8);
      if (m === 'restless') {
        k.hopT -= dt;
        if (k.hopT <= 0) { k.hopT = rand(0.35, 0.7); k.hopX = rand(-0.4, 0.4); k.stance = pick(['ready', 'high', 'ready', 'lowL', 'lowR']); }
        tx += k.hopX;
      }
      tx = clamp(tx, -1.1, 1.1);
    } else {
      if (k.tx !== undefined) tx = k.tx;
      if (k.tz !== undefined) tz = k.tz;
      speed = k.committed.startsWith('dive') ? 3.5 : 2.5;
    }
    // シュートへの反応
    if (k.react && k.t >= k.reactAt) {
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
    if (k.committed === 'react') { tx = k.tx; speed = 4.2; }
    tx = clamp(tx, -1.3, 1.3);
    const dx = tx - k.x;
    k.x += clamp(dx, -speed * dt, speed * dt);
    const dz = tz - k.z;
    k.z += clamp(dz, -2.6 * dt, 2.6 * dt);
    // まだ跳んでいない／空中にいる間の決め打ち
    if (p.state === 'air' && !p.shot && !k.committed && p.airT >= k.commitAt) keeperCommit();
    const fast = k.stance.startsWith('dive') || k.stance === 'star' ? 16 : 11;
    blendPose(k.j, KP[k.stance], 1 - Math.exp(-fast * dt));
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
    const n = 6, h = dt / n;
    for (let i = 0; i < n; i++) {
      const pz = b.z;
      b.vy -= G * h;
      b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
      b.t += h;
      if (b.y <= BALL_R && b.vy < 0) {
        b.y = BALL_R;
        if (!b.bounced && (b.type === 'bound' || b.type === 'spin') && b.state === 'fly') {
          b.bounced = true;
          if (b.type === 'spin') {
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
    b.spinAng = (b.spinAng || 0) + dt * (b.type === 'spin' ? 30 : 12);
    b.trail.push([b.x, b.y, b.z]);
    if (b.trail.length > 14) b.trail.shift();
  }

  function resolveShot(kind) {
    const b = ball;
    b.state = kind;
    if (game.phase !== 'play') return;
    const tname = TIMINGS[b.timing].name, sname = SHOT_TYPES[b.type].name;
    const label = `${tname}・${sname}シュート`;
    if (kind === 'goal') {
      game.combo++; game.goals++;
      let pts = Math.round(SHOT_TYPES[b.type].pts * TIMINGS[b.timing].mult);
      const corner = Math.abs(b.x) > 1.0 && (b.y > 1.5 || b.y < 0.5);
      if (corner) pts += 50;
      if (game.combo > 1) pts += 50 * (game.combo - 1);
      game.score += pts;
      showMsg('GOAL!!', `${label}　+${pts}${corner ? '（隅！）' : ''}${game.combo > 1 ? `　${game.combo}連続！` : ''}`, 'goal', 2.6);
      sfx.net(); sfx.cheer(b.timing === 'musasabi' ? 1.3 : 1);
      launchConfetti(b.timing === 'musasabi' ? 1.6 : 1);
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

  // ================= 紙吹雪 =================
  function launchConfetti(power = 1) {
    const cols = ['#ff4757', '#ffd32a', '#2ed573', '#1e90ff', '#ff6bcb', '#ffffff', '#ffa502', '#7bed9f'];
    const n = Math.floor(260 * power);
    for (let i = 0; i < n; i++) {
      const fromLeft = i % 2 === 0;
      const top = i % 5 === 0;
      confetti.push({
        x: top ? rand(0, W) : fromLeft ? rand(-10, 30) : rand(W - 30, W + 10),
        y: top ? rand(-60, -10) : H * rand(0.75, 0.95),
        vx: top ? rand(-40, 40) : (fromLeft ? 1 : -1) * rand(120, 420),
        vy: top ? rand(20, 80) : -rand(500, 950) * (H / 800),
        r: rand(0, 6.28), vr: rand(-12, 12), fl: rand(0, 6.28), vf: rand(6, 14),
        w: rand(6, 11), h: rand(10, 17), c: pick(cols), life: rand(3.5, 5.5),
      });
    }
  }
  function updateConfetti(dt) {
    for (const c of confetti) {
      c.vy += 520 * dt;
      c.vx *= Math.exp(-1.8 * dt);
      c.vy = Math.min(c.vy, 110);
      c.x += (c.vx + Math.sin(c.fl) * 30) * dt; c.y += c.vy * dt;
      c.r += c.vr * dt; c.fl += c.vf * dt; c.life -= dt;
    }
    confetti = confetti.filter((c) => c.life > 0 && c.y < H + 30);
  }
  function drawConfetti() {
    for (const c of confetti) {
      ctx.save();
      ctx.translate(c.x, c.y); ctx.rotate(c.r); ctx.scale(1, Math.cos(c.fl));
      ctx.globalAlpha = clamp(c.life, 0, 1);
      ctx.fillStyle = c.c; ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ================= 描画 =================
  function updateCamera(dt) {
    const p = player;
    if (!p) return;
    // ゴールから見てプレイヤーの後ろ側にカメラを置く
    const tgt = ball && ball.state === 'fly' ? { x: (p.x + ball.x) / 2, z: Math.max(p.z, 1.5) } : p;
    let dx = tgt.x * 0.75, dz = Math.max(tgt.z, 1.5) + 1.2;
    const dl = Math.hypot(dx, dz);
    const dist = Math.max(dl + 4.2, 8.5);
    const nx = dx / dl, nz = dz / dl;
    const cx = nx * dist, cz = nz * dist;
    const a = 1 - Math.exp(-4 * dt);
    cam.x = lerp(cam.x, cx, a); cam.z = lerp(cam.z, cz, a);
    const high = p.state === 'air' || p.state === 'ground' ? (p.musasabi ? 1.6 : 0.8) : 0;
    cam.y = lerp(cam.y, 2.5 + high + (p.y || 0) * 0.3, a);
    cam.pitch = lerp(cam.pitch, 0.16 + high * 0.08, a);
    // ゴールの少し手前を見る
    const lx = p.x * 0.35 - cam.x, lz = 1.0 - cam.z;
    const ll = Math.hypot(lx, lz);
    cam.fx = lerp(cam.fx, lx / ll, a); cam.fz = lerp(cam.fz, lz / ll, a);
    const fl = Math.hypot(cam.fx, cam.fz); cam.fx /= fl; cam.fz /= fl;
  }

  function drawBackground() {
    // 天井・観客席
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.5);
    g.addColorStop(0, '#0b1020'); g.addColorStop(1, '#1d2541');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 照明
    for (let i = 0; i < 5; i++) {
      const p = proj(-12 + i * 6, 12, -10);
      if (!p) continue;
      const rg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 80);
      rg.addColorStop(0, 'rgba(255,255,230,.9)'); rg.addColorStop(1, 'rgba(255,255,230,0)');
      ctx.fillStyle = rg; ctx.fillRect(p.x - 80, p.y - 80, 160, 160);
    }
    // スタンド
    if (polyPath([[-40, 0.9, -7.6], [40, 0.9, -7.6], [40, 7, -14.5], [-40, 7, -14.5]])) {
      ctx.fillStyle = '#2a2f45'; ctx.fill();
    }
    // 観客
    const sorted = crowd;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const c = sorted[i];
      const jump = cheer > 0.01 ? Math.abs(Math.sin(game.time * 9 + c.ph)) * 0.35 * cheer : Math.sin(game.time * 1.5 + c.ph) * 0.02;
      const p = proj(c.x, c.y + jump, c.z);
      if (!p || p.x < -20 || p.x > W + 20) continue;
      const r = 0.15 * p.k;
      ctx.fillStyle = c.c;
      ctx.fillRect(p.x - r * 1.5, p.y, r * 3, r * 3.2 * c.h);
      ctx.fillStyle = '#f0c8a0';
      ctx.beginPath(); ctx.arc(p.x, p.y - r * 0.4, r, 0, 6.283); ctx.fill();
      if (cheer > 0.3 && (i % 3 === 0)) { // 手を上げる
        ctx.strokeStyle = '#f0c8a0'; ctx.lineWidth = Math.max(1, r * 0.6);
        ctx.beginPath(); ctx.moveTo(p.x - r * 1.3, p.y + r * 0.5); ctx.lineTo(p.x - r * 2, p.y - r * 2.2);
        ctx.moveTo(p.x + r * 1.3, p.y + r * 0.5); ctx.lineTo(p.x + r * 2, p.y - r * 2.2); ctx.stroke();
      }
    }
    // 広告ボード
    if (polyPath([[-40, 0, -7.5], [40, 0, -7.5], [40, 0.9, -7.5], [-40, 0.9, -7.5]])) {
      const p1 = proj(0, 0.9, -7.5), p2 = proj(0, 0, -7.5);
      const lg = ctx.createLinearGradient(0, p1 ? p1.y : 0, 0, p2 ? p2.y : 1);
      lg.addColorStop(0, '#1060c0'); lg.addColorStop(1, '#0a3a80');
      ctx.fillStyle = lg; ctx.fill();
      for (let i = -3; i <= 3; i++) {
        const p = proj(i * 6, 0.45, -7.49);
        if (!p) continue;
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.font = `bold ${Math.max(8, 0.42 * p.k)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(i % 2 ? 'MUSASABI SHOOT' : 'HANDBALL CUP', p.x, p.y);
      }
    }
  }

  function dPath(r, steps = 24) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 + (Math.PI / 2) * (i / steps);
      pts.push([-GOAL_HW + r * Math.sin(a), 0, r * Math.cos(a)]);
    }
    for (let i = 0; i <= steps; i++) {
      const a = (Math.PI / 2) * (i / steps);
      pts.push([GOAL_HW + r * Math.sin(a), 0, r * Math.cos(a)]);
    }
    return pts;
  }
  const D6 = dPath(AREA_R), D9 = dPath(FREE_R, 30);

  function drawFloor() {
    if (polyPath([[-40, 0, -7.5], [40, 0, -7.5], [40, 0, 40], [-40, 0, 40]])) { ctx.fillStyle = '#244c84'; ctx.fill(); }
    if (polyPath([[-10, 0, 0], [10, 0, 0], [10, 0, 22], [-10, 0, 22]])) {
      ctx.fillStyle = '#d98a3d'; ctx.fill();
    }
    // 床板の木目
    ctx.save();
    if (polyPath([[-10, 0, 0], [10, 0, 0], [10, 0, 22], [-10, 0, 22]])) ctx.clip();
    for (let x = -10; x <= 10; x += 0.5) line3([x, 0, 0], [x, 0, 22], 0.02, 'rgba(120,60,10,.18)');
    ctx.restore();
    // ゴールエリア
    if (polyPath(D6)) { ctx.fillStyle = '#3d7fd0'; ctx.fill(); }
    // ライン
    const white = 'rgba(255,255,255,.92)';
    line3([-10, 0, 0], [10, 0, 0], 0.05, white);
    line3([-10, 0, 0], [-10, 0, 22], 0.05, white);
    line3([10, 0, 0], [10, 0, 22], 0.05, white);
    const flash = game.lineFlash > 0 && Math.floor(game.time * 10) % 2 === 0;
    for (let i = 0; i < D6.length - 1; i++) line3(D6[i], D6[i + 1], 0.05, flash ? '#ff3b3b' : white);
    for (let i = 0; i < D9.length - 1; i += 2) line3(D9[i], D9[i + 1], 0.05, white);
    line3([-0.5, 0, 7], [0.5, 0, 7], 0.05, white);
    line3([-0.08, 0, 4], [0.08, 0, 4], 0.05, white);
    // 足あと
    for (const f of footprints) {
      const p = proj(f.x, 0.01, f.z);
      if (!p) continue;
      ctx.fillStyle = f.n >= 4 ? 'rgba(255,60,60,.9)' : 'rgba(255,255,255,.75)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 0.07 * p.k, 0.05 * p.k, 0, 0, 6.283); ctx.fill();
      ctx.font = `bold ${Math.max(10, 0.25 * p.k)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = f.n >= 4 ? '#ff4040' : f.n === 3 ? '#ffd84a' : '#fff';
      ctx.fillText(f.n, p.x, p.y - 0.06 * p.k);
    }
  }

  function shadow(x, z, r, a = 0.35) {
    const p = proj(x, 0.005, z);
    if (!p) return;
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, r * p.k, r * p.k * 0.35, 0, 0, 6.283); ctx.fill();
  }

  function drawGoalBack() {
    const net = 'rgba(255,255,255,.35)';
    const bz = -0.9;
    for (let x = -GOAL_HW; x <= GOAL_HW + 1e-3; x += 0.15) {
      line3([x, GOAL_H, 0], [x, GOAL_H, bz * 0.8], 0.01, net);
      line3([x, GOAL_H, bz * 0.8], [x, 0, bz], 0.01, net);
    }
    for (let i = 0; i <= 13; i++) {
      const t = i / 13, y = GOAL_H * (1 - t), z = lerp(bz * 0.8, bz, t);
      line3([-GOAL_HW, y, z], [GOAL_HW, y, z], 0.01, net);
      line3([-GOAL_HW, y, z], [-GOAL_HW, y, 0], 0.01, net);
      line3([GOAL_HW, y, z], [GOAL_HW, y, 0], 0.01, net);
    }
  }
  function drawGoalFrame() {
    const seg = 0.2;
    for (const sx of [-GOAL_HW - 0.04, GOAL_HW + 0.04]) {
      for (let y = 0, i = 0; y < GOAL_H; y += seg, i++) {
        line3([sx, y, 0], [sx, Math.min(GOAL_H + 0.04, y + seg), 0], 0.08, i % 2 ? '#fff' : '#e53030');
      }
    }
    for (let x = -GOAL_HW - 0.04, i = 0; x < GOAL_HW + 0.04; x += seg, i++) {
      line3([x, GOAL_H + 0.04, 0], [Math.min(GOAL_HW + 0.04, x + seg), GOAL_H + 0.04, 0], 0.08, i % 2 ? '#fff' : '#e53030');
    }
  }

  function drawAim() {
    if (!player || game.phase !== 'play' || player.shot) return;
    const tx = input.jx * 1.3, ty = 1.0 + input.jy * 0.78;
    const p = proj(tx, ty, 0.02);
    if (!p) return;
    const r = 0.2 * p.k;
    ctx.strokeStyle = 'rgba(255,230,60,.95)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.x - r * 1.5, p.y); ctx.lineTo(p.x + r * 1.5, p.y);
    ctx.moveTo(p.x, p.y - r * 1.5); ctx.lineTo(p.x, p.y + r * 1.5); ctx.stroke();
  }

  function limb(pts, a, b, r, color) {
    const pa = pts[a], pb = pts[b];
    if (!pa || !pb) return;
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, r * 2 * (pa.k + pb.k) / 2);
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
  }
  function poly(pts, names, color) {
    if (names.some((n) => !pts[n])) return;
    ctx.fillStyle = color; ctx.beginPath();
    names.forEach((n, i) => (i ? ctx.lineTo(pts[n].x, pts[n].y) : ctx.moveTo(pts[n].x, pts[n].y)));
    ctx.closePath(); ctx.fill();
  }

  function drawPlayer() {
    const p = player;
    const pts = {};
    for (const n of JOINTS) { const w = jointWorld(p, n); pts[n] = proj(w[0], w[1], w[2]); }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const skin = '#f1c27d', jersey = '#1e5bd8', shorts = '#10214d';
    // ムササビの膜
    if (p.musasabi && p.state !== 'run') {
      poly(pts, ['haL', 'elL', 'shL', 'hiL', 'knL', 'ftL'], 'rgba(150,95,45,.75)');
      poly(pts, ['haR', 'elR', 'shR', 'hiR', 'knR', 'ftR'], 'rgba(150,95,45,.75)');
    }
    limb(pts, 'hiL', 'knL', 0.085, shorts); limb(pts, 'knL', 'ftL', 0.065, skin);
    limb(pts, 'hiR', 'knR', 0.085, shorts); limb(pts, 'knR', 'ftR', 0.065, skin);
    for (const f of ['ftL', 'ftR']) if (pts[f]) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(pts[f].x, pts[f].y, 0.07 * pts[f].k, 0, 6.283); ctx.fill(); }
    poly(pts, ['shL', 'shR', 'hiR', 'hiL'], jersey);
    limb(pts, 'shL', 'hiL', 0.07, jersey); limb(pts, 'shR', 'hiR', 0.07, jersey);
    // 背番号
    if (pts.neck && pts.hip) {
      const cx = (pts.neck.x + pts.hip.x) / 2, cy = (pts.neck.y + pts.hip.y) / 2;
      ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(8, 0.26 * pts.neck.k)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('7', cx, cy);
    }
    limb(pts, 'shL', 'elL', 0.06, skin); limb(pts, 'elL', 'haL', 0.055, skin);
    limb(pts, 'shR', 'elR', 0.06, skin); limb(pts, 'elR', 'haR', 0.055, skin);
    if (pts.head) {
      const k = pts.head.k;
      ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(pts.head.x, pts.head.y, 0.12 * k, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#2a1a10'; ctx.beginPath(); ctx.arc(pts.head.x, pts.head.y - 0.02 * k, 0.115 * k, 0, 6.283); ctx.fill();
    }
  }

  function drawKeeper() {
    const k = keeper;
    const pts = {};
    for (const n of JOINTS) { const j = k.j[n]; pts[n] = proj(k.x + j[0], j[1], k.z + j[2]); }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const skin = '#e8b88a', jersey = '#f2c230', shorts = '#222';
    limb(pts, 'hiL', 'knL', 0.09, shorts); limb(pts, 'knL', 'ftL', 0.07, '#333');
    limb(pts, 'hiR', 'knR', 0.09, shorts); limb(pts, 'knR', 'ftR', 0.07, '#333');
    poly(pts, ['shL', 'shR', 'hiR', 'hiL'], jersey);
    limb(pts, 'shL', 'hiL', 0.08, jersey); limb(pts, 'shR', 'hiR', 0.08, jersey);
    limb(pts, 'shL', 'elL', 0.065, jersey); limb(pts, 'elL', 'haL', 0.06, skin);
    limb(pts, 'shR', 'elR', 0.065, jersey); limb(pts, 'elR', 'haR', 0.06, skin);
    if (pts.head) {
      const s = pts.head.k;
      ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(pts.head.x, pts.head.y, 0.12 * s, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(pts.head.x, pts.head.y - 0.06 * s, 0.1 * s, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.fillRect(pts.head.x - 0.05 * s, pts.head.y, 0.025 * s, 0.025 * s);
      ctx.fillRect(pts.head.x + 0.025 * s, pts.head.y, 0.025 * s, 0.025 * s);
    }
  }

  function drawKeeperLabel() {
    const k = keeper;
    if (!k) return;
    if (k.labelT > 0 && k.label) {
      const top = proj(k.x, 2.6, k.z);
      if (top) {
        const fs = clamp(0.24 * top.k, 13, 24);
        ctx.font = `bold ${fs}px sans-serif`;
        const w = ctx.measureText(k.label).width + 16;
        ctx.globalAlpha = clamp(k.labelT * 2, 0, 1);
        ctx.fillStyle = 'rgba(255,255,255,.95)';
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(top.x - w / 2, top.y - fs - 8, w, fs + 12, 8) : ctx.rect(top.x - w / 2, top.y - fs - 8, w, fs + 12);
        ctx.fill();
        ctx.fillStyle = '#d02020'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(k.label, top.x, top.y - fs / 2 - 2);
        ctx.globalAlpha = 1;
      }
    }
  }


  function drawBallAt(x, y, z, ang = 0) {
    const p = proj(x, y, z);
    if (!p) return;
    const r = Math.max(2, BALL_R * p.k);
    ctx.fillStyle = '#fafafa'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283); ctx.clip();
    ctx.translate(p.x, p.y); ctx.rotate(ang);
    ctx.fillStyle = '#e8402a'; ctx.fillRect(-r, -r * 0.25, r * 2, r * 0.5);
    ctx.fillStyle = '#1f5fd0'; ctx.fillRect(-r * 0.25, -r, r * 0.5, r * 2);
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283); ctx.stroke();
  }
  function drawBall() {
    if (ball) {
      if (ball.state === 'fly') {
        ctx.lineCap = 'round';
        for (let i = 1; i < ball.trail.length; i++) {
          const a = ball.trail[i - 1], b = ball.trail[i];
          line3(a, b, 0.08 * (i / ball.trail.length), `rgba(255,255,255,${0.35 * i / ball.trail.length})`);
        }
      }
      drawBallAt(ball.x, ball.y, ball.z, ball.spinAng);
    } else if (player) {
      const w = jointWorld(player, 'haR');
      drawBallAt(w[0], w[1] + 0.06, w[2] - 0.04);
    }
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    drawFloor();
    if (!player) return;
    shadow(keeper.x, keeper.z, 0.5);
    shadow(player.x, player.z, player.musasabi && player.state !== 'run' ? 0.7 : 0.4, 0.35 - clamp(player.y * 0.12, 0, 0.2));
    if (ball) shadow(ball.x, ball.z, 0.1, 0.3);
    // 奥から順に描く
    const items = [
      { z: -0.5, f: drawGoalBack },
      { z: 0, f: drawGoalFrame },
      { z: 0.01, f: drawAim },
      { z: keeper.z, f: drawKeeper },
      { z: player.z, f: drawPlayer },
    ];
    if (ball) items.push({ z: ball.z, f: drawBall });
    else items.push({ z: player.z - 0.01, f: drawBall });
    items.sort((a, b) => a.z - b.z);
    for (const it of items) it.f();
    drawKeeperLabel();
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
  function updateHud() {
    $('#score').textContent = game.score;
    $('#shotInfo').textContent = `${Math.min(game.shotNo, TOTAL_SHOTS)} / ${TOTAL_SHOTS} 本目`;
    const st = $('#steps');
    const n = player ? player.steps : 0;
    st.querySelectorAll('i').forEach((el, i) => el.classList.toggle('on', i < n));
    st.classList.toggle('chance', !!player && n === 3 && player.state === 'run' && game.phase === 'play');
    if (game.phase === 'play') st.classList.remove('foul');
  }
  function updateButtons() {
    const play = game.phase === 'play' && player;
    $('#controls').classList.toggle('hidden', !(play || game.phase === 'result'));
    $('#jumpBtn').classList.toggle('hidden', !(play && canJump()));
    $('#musaBtn').classList.toggle('hidden', !(play && canMusa()));
    $('#shotBtns').classList.toggle('hidden', !(play && canShoot()));
  }

  // ================= メインループ =================
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    updateHud();
    updateButtons();
    render();
    drawConfetti();
  }
  function update(dt) {
    game.time += dt;
    if (player && game.phase !== 'title') {
      updatePlayer(dt);
      updateKeeper(dt);
      if (ball) updateBall(dt);
      updateCamera(dt);
    }
    if (game.phase === 'result') {
      game.waitT -= dt;
      if (game.waitT <= 0) {
        if (game.shotNo >= TOTAL_SHOTS) endGame();
        else newAttempt();
      }
    }
    if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) $('#msg').classList.remove('show'); }
    cheer = Math.max(0, cheer - dt * 0.3);
    if (murmurGain) murmurGain.gain.value = 0.035 + cheer * 0.04;
    updateConfetti(dt);
  }

  // タイトル画面の背景用
  player = null;
  updateCamera(0);
  requestAnimationFrame(frame);

  // テスト・デバッグ用
  window.MS = { game, update, input, doJump, doShoot, startGame, get player() { return player; }, get keeper() { return keeper; }, get ball() { return ball; } };
})();
