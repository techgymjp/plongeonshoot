'use strict';
// ムササビシュート — 3D 描画(室内のハンドボール競技場。シューターの背中越しの視点)
// 座標はゲームと同じ: x = 左右、y = 高さ、z = ゴールラインからコート側への距離(ゴールは z = 0)。
// three.js の座標とそのまま一致させている。
// 選手の作り・質感・照明はコーナーキック/ジャッカル/センターフライと揃えている。
window.Scene3D = (() => {
  const H = 640;
  let W = 960;
  const GOAL_HW = 1.5, GOAL_H = 2.0, NET_D = 1.0;
  const BALL_R = 0.1; // 見やすさのため実物(約0.095)より少し大きい
  const CEIL = 17;

  let renderer, scene, camera, ready = false, glowTex = null;
  let ballMesh, ballShadow, lineFlash, screens, crowdMats = [];
  const rigs = {};
  const footDiscs = [];

  // ---------- テクスチャ ----------
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  // 床の描画範囲(コートは x = ±10、z = 0〜40)
  const FX = 22, FZ0 = 8, FZ1 = 46, PPM = 26;

  // ゴールエリア(6m)・フリースローライン(9m)の形
  function dShape(g, tx, ty, m, r, end) {
    const s = end ? -1 : 1, gz = end ? 40 : 0;
    g.beginPath();
    g.moveTo(tx(-GOAL_HW - r), ty(gz));
    if (!end) {
      g.arc(tx(-GOAL_HW), ty(gz), m(r), Math.PI, Math.PI / 2, true);
      g.lineTo(tx(GOAL_HW), ty(gz + r));
      g.arc(tx(GOAL_HW), ty(gz), m(r), Math.PI / 2, 0, true);
    } else {
      g.arc(tx(-GOAL_HW), ty(gz), m(r), Math.PI, Math.PI * 1.5, false);
      g.lineTo(tx(GOAL_HW), ty(gz - r));
      g.arc(tx(GOAL_HW), ty(gz), m(r), Math.PI * 1.5, Math.PI * 2, false);
    }
    void s;
  }

  function floorTexture() {
    const w = FX * 2 * PPM, h = (FZ0 + FZ1) * PPM;
    return canvasTex(w, h, (g) => {
      const tx = (x) => (x + FX) * PPM, ty = (z) => (z + FZ0) * PPM, m = (v) => v * PPM;
      // コートの外(青いフロア)
      g.fillStyle = '#2a5a8c';
      g.fillRect(0, 0, w, h);
      // コート: 縦長の板を並べた木の床
      const x0 = tx(-10), x1 = tx(10), z0 = ty(0), z1 = ty(40);
      const plankW = m(0.14);
      for (let x = x0, i = 0; x < x1; x += plankW, i++) {
        const shade = 0.88 + Math.random() * 0.2;
        g.fillStyle = `rgb(${Math.round(222 * shade)},${Math.round(146 * shade)},${Math.round(72 * shade)})`;
        g.fillRect(x, z0, plankW + 1, z1 - z0);
        // 板の継ぎ目(縦方向に互い違い)
        g.fillStyle = 'rgba(90,45,10,0.35)';
        for (let z = z0 + ((i * 97) % m(3.2)); z < z1; z += m(3.2)) g.fillRect(x, z, plankW, 1.5);
        g.fillStyle = 'rgba(90,45,10,0.25)';
        g.fillRect(x, z0, 1.2, z1 - z0);
      }
      // 木目
      for (let i = 0; i < 26000; i++) {
        const x = x0 + Math.random() * (x1 - x0), z = z0 + Math.random() * (z1 - z0);
        g.fillStyle = Math.random() < 0.5 ? 'rgba(120,60,15,0.10)' : 'rgba(255,230,190,0.08)';
        g.fillRect(x, z, 1.2, 4 + Math.random() * 14);
      }
      // ゴールエリア(青く塗る)
      for (const end of [false, true]) {
        dShape(g, tx, ty, m, 6, end);
        g.closePath();
        g.fillStyle = 'rgba(40,110,200,0.92)';
        g.fill();
      }
      // ライン
      g.strokeStyle = '#f6f6f2';
      g.lineWidth = m(0.05);
      const line = (xa, za, xb, zb) => { g.beginPath(); g.moveTo(tx(xa), ty(za)); g.lineTo(tx(xb), ty(zb)); g.stroke(); };
      line(-10, 0, 10, 0); line(-10, 40, 10, 40); line(-10, 0, -10, 40); line(10, 0, 10, 40); line(-10, 20, 10, 20);
      for (const end of [false, true]) {
        const gz = end ? 40 : 0, s = end ? -1 : 1;
        dShape(g, tx, ty, m, 6, end); g.stroke();
        g.setLineDash([m(0.15), m(0.15)]);
        dShape(g, tx, ty, m, 9, end); g.stroke();
        g.setLineDash([]);
        line(-0.5, gz + s * 7, 0.5, gz + s * 7);
        line(-0.075, gz + s * 4, 0.075, gz + s * 4);
      }
      g.beginPath(); g.arc(tx(0), ty(20), m(0.15), 0, Math.PI * 2); g.fillStyle = '#f6f6f2'; g.fill();
      // 床の光沢ムラ
      const gl = g.createRadialGradient(tx(0), ty(8), 0, tx(0), ty(8), m(22));
      gl.addColorStop(0, 'rgba(255,255,255,0.10)'); gl.addColorStop(1, 'rgba(0,0,0,0.10)');
      g.fillStyle = gl; g.fillRect(0, 0, w, h);
    });
  }

  function crowdTexture() {
    return canvasTex(512, 512, (g, w, h) => {
      const rows = 16, rh = h / rows;
      const shirts = ['#1e5bd8', '#ffffff', '#f2c230', '#d32f2f', '#1a237e', '#90caf9', '#212121', '#ff8a65', '#43a047', '#ffcdd2'];
      for (let r = 0; r < rows; r++) {
        g.fillStyle = r % 2 ? '#3a2f48' : '#45384f'; // 室内の座席
        g.fillRect(0, r * rh, w, rh);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(0, r * rh + rh - 4, w, 4);
        for (let x = 2; x < w; x += 9) {
          if (Math.random() < 0.1) continue;
          const sx = x + (Math.random() - 0.5) * 3;
          g.fillStyle = shirts[(Math.random() * shirts.length) | 0];
          g.fillRect(sx, r * rh + rh * 0.45, 7, rh * 0.45);
          g.fillStyle = Math.random() < 0.8 ? '#e8bf9a' : '#6d4c41';
          g.beginPath(); g.arc(sx + 3.5, r * rh + rh * 0.32, 3, 0, Math.PI * 2); g.fill();
          if (Math.random() < 0.08) { // 応援のタオル・うちわ
            g.fillStyle = Math.random() < 0.5 ? '#ffd84a' : '#1e5bd8';
            g.fillRect(sx - 2, r * rh + rh * 0.05, 11, 6);
          }
        }
      }
    }, true);
  }

  function glowTexture() {
    return canvasTex(128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,240,1)');
      gr.addColorStop(0.2, 'rgba(255,250,220,0.8)');
      gr.addColorStop(0.5, 'rgba(255,240,200,0.18)');
      gr.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
  }

  function netTexture() {
    return canvasTex(128, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = 'rgba(245,245,245,0.95)';
      g.lineWidth = 6;
      g.strokeRect(3, 3, w - 6, h - 6);
    }, true);
  }

  function boardTexture() {
    return canvasTex(1024, 64, (g, w, h) => {
      const words = ['MUSASABI SHOOT', 'HANDBALL', 'TECH GYM', 'GOAL!', 'PLONGEON'];
      const cols = ['#1e5bd8', '#0d1b4f', '#ffd400', '#c8102e', '#1b1b1b'];
      for (let i = 0; i < 5; i++) {
        const x = i * w / 5;
        g.fillStyle = cols[i]; g.fillRect(x, 0, w / 5, h);
        g.fillStyle = i === 2 ? '#111' : '#fff';
        g.font = 'bold 30px sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(words[i], x + w / 10, h / 2 + 2, w / 5 - 12);
      }
    }, true);
  }

  // ---------- 競技場 ----------
  function quad(a, b, c, d, mat, uRep = 1, vRep = 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...d], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, uRep, 0, uRep, vRep, 0, vRep], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    return mesh;
  }
  function box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  }

  function buildArena() {
    // 床
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(FX * 2, FZ0 + FZ1), new THREE.MeshLambertMaterial({ map: floorTexture() }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, (FZ1 - FZ0) / 2);
    scene.add(floor);

    // 広告看板(コートを囲む)
    const boardMat = new THREE.MeshBasicMaterial({ map: boardTexture(), side: THREE.DoubleSide });
    const bm = (len) => { const m = boardMat.clone(); m.map = boardMat.map.clone(); m.map.needsUpdate = true; m.map.repeat.set(len / 20, 1); return m; };
    quad([-14, 0, -4.5], [14, 0, -4.5], [14, 0.9, -4.5], [-14, 0.9, -4.5], bm(28));
    // 両サイドの看板(コートの内側から見て文字が正しい向きになるよう、左右で頂点の順を変える)
    quad([13, 0, -4.5], [13, 0, 44], [13, 0.9, 44], [13, 0.9, -4.5], bm(48));
    quad([-13, 0, 44], [-13, 0, -4.5], [-13, 0.9, -4.5], [-13, 0.9, 44], bm(48));

    // スタンド(ゴール裏と両サイド。室内なので近くて急)
    const mkCrowd = (rep) => {
      const t = crowdTexture(); t.repeat.set(rep, 3);
      const m = new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide, emissive: 0x2a2436 });
      crowdMats.push(m);
      return m;
    };
    quad([-26, 1.4, -6.5], [26, 1.4, -6.5], [26, 12, -17], [-26, 12, -17], mkCrowd(5));
    for (const s of [-1, 1]) {
      quad([s * 14.5, 1.4, -6.5], [s * 14.5, 1.4, 46], [s * 25, 12, 46], [s * 25, 12, -6.5], mkCrowd(5));
    }
    // スタンドの前の壁
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x232838, side: THREE.DoubleSide });
    quad([-26, 0, -6.5], [26, 0, -6.5], [26, 1.4, -6.5], [-26, 1.4, -6.5], wallMat);
    for (const s of [-1, 1]) quad([s * 14.5, 0, -6.5], [s * 14.5, 0, 46], [s * 14.5, 1.4, 46], [s * 14.5, 1.4, -6.5], wallMat);
    // 奥の壁と天井
    const upper = new THREE.MeshLambertMaterial({ color: 0x1b1f2c, side: THREE.DoubleSide });
    quad([-26, 12, -17], [26, 12, -17], [26, CEIL, -17], [-26, CEIL, -17], upper);
    for (const s of [-1, 1]) quad([s * 25, 12, -17], [s * 25, 12, 50], [s * 25, CEIL, 50], [s * 25, CEIL, -17], upper);
    const ceil = new THREE.MeshLambertMaterial({ color: 0x14161f, side: THREE.DoubleSide });
    quad([-26, CEIL, -17], [26, CEIL, -17], [26, CEIL, 50], [-26, CEIL, 50], ceil);
    // 天井のトラス
    const steel = new THREE.MeshLambertMaterial({ color: 0x3a4152 });
    for (let z = -12; z <= 44; z += 8) box(50, 0.35, 0.35, steel, 0, CEIL - 1.2, z);
    for (let x = -20; x <= 20; x += 8) box(0.25, 0.25, 62, steel, x, CEIL - 1.0, 16);
    // 照明(天井にずらりと並ぶ光)
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfffbe6 });
    for (let z = -8; z <= 40; z += 8) {
      for (let x = -16; x <= 16; x += 8) {
        box(1.6, 0.3, 1.6, lampMat, x, CEIL - 1.6, z);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }));
        sp.position.set(x, CEIL - 1.8, z);
        sp.scale.set(7, 7, 1);
        scene.add(sp);
      }
    }
    // 大型ビジョン(ゴール裏スタンドの上)
    const c = document.createElement('canvas');
    c.width = 512; c.height = 192;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    box(17, 6.6, 0.6, new THREE.MeshLambertMaterial({ color: 0x20242c }), 0, 13.6, -16.2);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), new THREE.MeshBasicMaterial({ map: tex }));
    scr.position.set(0, 13.6, -15.85);
    scene.add(scr);
    screens = { canvas: c, tex, key: '' };
    // 横断幕
    const banner = canvasTex(512, 64, (g, w, h) => {
      g.fillStyle = '#c8102e'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('とべ！ムササビ！', w / 2, h / 2 + 2);
    });
    for (const x of [-15, 15]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(7, 0.9), new THREE.MeshLambertMaterial({ map: banner, side: THREE.DoubleSide }));
      b.position.set(x, 4.2, -8.6);
      b.rotation.x = -0.83;
      scene.add(b);
    }
    buildGoal();
    buildLineFlash();
  }

  function buildGoal() {
    // 赤白のしま模様のゴール(角材)
    const stripe = canvasTex(16, 128, (g, w, h) => {
      for (let i = 0; i < 10; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#e02828'; g.fillRect(0, i * h / 10, w, h / 10); }
    });
    const postMat = new THREE.MeshLambertMaterial({ map: stripe, emissive: 0x222222 });
    const T = 0.08;
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(T, GOAL_H + T, T), postMat);
      post.position.set(sx * (GOAL_HW + T / 2), (GOAL_H + T) / 2, -T / 2);
      scene.add(post);
    }
    const barTex = stripe.clone(); barTex.needsUpdate = true;
    barTex.center.set(0.5, 0.5); barTex.rotation = Math.PI / 2; barTex.repeat.set(1, 1.5);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(GOAL_HW * 2 + T * 2, T, T), new THREE.MeshLambertMaterial({ map: barTex, emissive: 0x222222 }));
    bar.position.set(0, GOAL_H + T / 2, -T / 2);
    scene.add(bar);
    // ネット
    const nt = netTexture();
    const mk = (rx, ry) => {
      const t = nt.clone(); t.needsUpdate = true; t.repeat.set(rx, ry);
      return new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.8 });
    };
    const D2 = NET_D, D1 = 0.8, cell = 0.1;
    const slant = Math.hypot(D2 - D1, GOAL_H);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_HW * 2, slant), mk(GOAL_HW * 2 / cell, slant / cell));
    back.position.set(0, GOAL_H / 2, -(D1 + D2) / 2);
    back.rotation.x = -Math.atan2(D2 - D1, GOAL_H);
    scene.add(back);
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_HW * 2, D1), mk(GOAL_HW * 2 / cell, D1 / cell));
    roof.rotation.x = -Math.PI / 2;
    roof.position.set(0, GOAL_H, -D1 / 2);
    scene.add(roof);
    for (const sx of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.lineTo(D2, 0); shape.lineTo(D1, GOAL_H); shape.lineTo(0, GOAL_H); shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      const uvs = geo.attributes.uv;
      for (let i = 0; i < uvs.count; i++) uvs.setXY(i, geo.attributes.position.getX(i) / cell, geo.attributes.position.getY(i) / cell);
      const side = new THREE.Mesh(geo, mk(1, 1));
      side.position.set(sx * GOAL_HW, 0, 0);
      side.rotation.y = Math.PI / 2;
      scene.add(side);
    }
  }

  // 6mラインを踏んだとき・踏みそうなときに光らせる帯
  function buildLineFlash() {
    const pts = [];
    const n = 24;
    for (let i = 0; i <= n; i++) { const a = Math.PI - (Math.PI / 2) * i / n; pts.push([-GOAL_HW + 6 * Math.cos(a), 6 * Math.sin(a)]); }
    for (let i = 0; i <= n; i++) { const a = Math.PI / 2 - (Math.PI / 2) * i / n; pts.push([GOAL_HW + 6 * Math.cos(a), 6 * Math.sin(a)]); }
    const pos = [], idx = [];
    const hw = 0.07;
    pts.forEach((p, i) => {
      const q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
      let dx = q[0] - o[0], dz = q[1] - o[1];
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      pos.push(p[0] - dz * hw, 0.015, p[1] + dx * hw, p[0] + dz * hw, 0.015, p[1] - dx * hw);
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    lineFlash = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    lineFlash.renderOrder = 2;
    lineFlash.visible = false;
    scene.add(lineFlash);
  }

  function updateScreen(st) {
    const key = `${st.shotNo}|${st.score}|${st.goals}|${st.phase}`;
    if (key === screens.key) return;
    screens.key = key;
    const g = screens.canvas.getContext('2d');
    g.fillStyle = '#05070c'; g.fillRect(0, 0, 512, 192);
    g.textAlign = 'center';
    g.fillStyle = '#ffd54f'; g.font = 'bold 40px sans-serif';
    g.fillText('MUSASABI SHOOT!', 256, 52);
    g.fillStyle = '#ffffff'; g.font = 'bold 34px sans-serif';
    g.fillText(`${Math.max(1, st.shotNo)} / ${st.total} 本目`, 256, 108, 480);
    g.fillStyle = '#7fe0ff'; g.font = 'bold 30px sans-serif';
    g.fillText(`GOAL ${st.goals}   SCORE ${st.score}`, 256, 160, 480);
    screens.tex.needsUpdate = true;
  }

  // ---------- 人物 ----------
  function jerseyTexture(c1, c2, num, numColor) {
    return canvasTex(128, 160, (g, w, h) => {
      g.fillStyle = c1; g.fillRect(0, 0, w, h);
      g.fillStyle = c2; g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h);
      if (num) {
        g.font = 'bold 92px sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 6;
        g.strokeStyle = numColor === '#ffffff' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.6)';
        g.strokeText(num, w / 2, h / 2 + 6);
        g.fillStyle = numColor; g.fillText(num, w / 2, h / 2 + 6);
      }
    });
  }
  function frontTexture(c1, c2, num, numColor) {
    return canvasTex(128, 160, (g, w, h) => {
      g.fillStyle = c1; g.fillRect(0, 0, w, h);
      g.fillStyle = c2; g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h);
      g.beginPath(); g.moveTo(w / 2 - 22, 0); g.lineTo(w / 2, 22); g.lineTo(w / 2 + 22, 0); g.fillStyle = c2; g.fill();
      if (num) {
        g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = numColor; g.fillText(num, w / 2, h * 0.55);
      }
    });
  }

  const TEAM = {
    home: { c1: '#1e5bd8', c2: '#ffffff', shorts: 0x10214d, socks: 0xffffff, shoe: 0xf2f2f2, num: '#ffffff' },
    gk: { c1: '#f2c230', c2: '#1b1b1b', shorts: 0x1b1b1b, socks: 0x1b1b1b, shoe: 0x151515, num: '#1b1b1b' },
  };
  const Y = new THREE.Vector3(0, 1, 0);
  const tv1 = new THREE.Vector3(), tv2 = new THREE.Vector3(), tv3 = new THREE.Vector3(), tm = new THREE.Matrix4();
  const headUp = new THREE.Vector3();

  // 関節の位置から体を組み立てる人形。frontPlusZ: 胸が +z 側(キーパー)
  function makeRig(team, num, frontPlusZ, hairCol, skinCol) {
    const t = TEAM[team];
    const plain = new THREE.MeshLambertMaterial({ color: new THREE.Color(t.c1) });
    const shorts = new THREE.MeshLambertMaterial({ color: t.shorts });
    const socks = new THREE.MeshLambertMaterial({ color: t.socks });
    const skin = new THREE.MeshLambertMaterial({ color: skinCol });
    const shoe = new THREE.MeshLambertMaterial({ color: t.shoe });
    const hair = new THREE.MeshLambertMaterial({ color: hairCol });
    const front = new THREE.MeshLambertMaterial({ map: frontTexture(t.c1, t.c2, num, t.c2) });
    const back = new THREE.MeshLambertMaterial({ map: jerseyTexture(t.c1, t.c2, num, t.num) });
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const group = new THREE.Group();
    scene.add(group);
    const seg = (mat) => { const m = new THREE.Mesh(unit, mat); group.add(m); return m; };
    const r = {
      group,
      torso: seg(frontPlusZ ? [plain, plain, plain, plain, front, back] : [plain, plain, plain, plain, back, front]),
      shorts: seg(shorts),
      thighL: seg(shorts), thighR: seg(shorts), shinL: seg(socks), shinR: seg(socks),
      kneeL: seg(skin), kneeR: seg(skin),
      shoeL: seg(shoe), shoeR: seg(shoe),
      upArmL: seg(plain), upArmR: seg(plain), foreL: seg(team === 'gk' ? plain : skin), foreR: seg(team === 'gk' ? plain : skin),
      handL: seg(skin), handR: seg(skin), neck: seg(skin),
      head: new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), skin),
      hair: new THREE.Mesh(new THREE.SphereGeometry(0.137, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hair),
      shadow: new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })),
      frontPlusZ,
    };
    group.add(r.head, r.hair);
    r.shadow.rotation.x = -Math.PI / 2;
    scene.add(r.shadow);
    return r;
  }

  // a から b へ伸びる箱
  function placeSeg(m, a, b, w, d, extra = 0) {
    tv1.set(a[0], a[1], a[2]); tv2.set(b[0], b[1], b[2]);
    tv3.subVectors(tv2, tv1);
    const len = tv3.length() + extra;
    m.position.addVectors(tv1, tv2).multiplyScalar(0.5);
    if (len > 1e-4) m.quaternion.setFromUnitVectors(Y, tv3.normalize());
    m.scale.set(w, Math.max(0.01, len), d);
  }
  const mid = (a, b, t = 0.5) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const along = (a, b, k) => [b[0] + (b[0] - a[0]) * k, b[1] + (b[1] - a[1]) * k, b[2] + (b[2] - a[2]) * k];

  function poseRig(r, j, heading) {
    if (!j) { r.group.visible = r.shadow.visible = false; return; }
    r.group.visible = r.shadow.visible = true;
    // 胴体: 肩と腰から向きを作る
    const neckP = j.neck, hipP = j.hip;
    const up = tv1.set(neckP[0] - hipP[0], neckP[1] - hipP[1], neckP[2] - hipP[2]);
    const torsoLen = up.length();
    up.normalize();
    const right = tv2.set(j.shR[0] - j.shL[0], j.shR[1] - j.shL[1], j.shR[2] - j.shL[2]);
    const sw = right.length();
    right.addScaledVector(up, -right.dot(up)).normalize();
    const z = tv3.crossVectors(right, up).normalize();
    tm.makeBasis(right, up, z);
    r.torso.quaternion.setFromRotationMatrix(tm);
    r.torso.position.set((neckP[0] + hipP[0]) / 2, (neckP[1] + hipP[1]) / 2 - 0.02, (neckP[2] + hipP[2]) / 2);
    r.torso.scale.set(sw + 0.1, torsoLen + 0.08, 0.26);
    r.shorts.quaternion.copy(r.torso.quaternion);
    r.shorts.position.set(hipP[0] - up.x * 0.06, hipP[1] - up.y * 0.06, hipP[2] - up.z * 0.06);
    r.shorts.scale.set(sw + 0.08, 0.2, 0.27);
    // up / right / z は placeSeg が作業用ベクトルを書き換える前に控えておく
    headUp.copy(up);
    placeSeg(r.neck, neckP, mid(neckP, j.head, 0.6), 0.12, 0.12);
    r.head.position.set(j.head[0], j.head[1], j.head[2]);
    r.head.quaternion.copy(r.torso.quaternion);
    // 髪: 頭の真上にかぶせる(少しだけ上にずらす)
    r.hair.position.set(j.head[0] + headUp.x * 0.015, j.head[1] + headUp.y * 0.015, j.head[2] + headUp.z * 0.015);
    r.hair.quaternion.copy(r.torso.quaternion);
    for (const s of ['L', 'R']) {
      placeSeg(r['thigh' + s], j['hi' + s], j['kn' + s], 0.17, 0.19, 0.04);
      placeSeg(r['shin' + s], j['kn' + s], j['ft' + s], 0.14, 0.16);
      placeSeg(r['knee' + s], mid(j['hi' + s], j['kn' + s], 0.85), mid(j['kn' + s], j['ft' + s], 0.15), 0.135, 0.15);
      // 靴: 足首から体の前方向へ
      const f = j['ft' + s];
      // 靴はつま先を体の正面へ(キーパーは +z が正面で heading だけ回す)
      const fx = Math.sin(heading) * 0.06, fz = (r.frontPlusZ ? 1 : -1) * Math.cos(heading) * 0.06;
      r['shoe' + s].position.set(f[0] + fx, Math.max(0.05, f[1] - 0.02), f[2] + fz);
      r['shoe' + s].rotation.set(0, r.frontPlusZ ? heading : -heading, 0);
      r['shoe' + s].scale.set(0.13, 0.1, 0.27);
      placeSeg(r['upArm' + s], j['sh' + s], j['el' + s], 0.13, 0.14, 0.03);
      placeSeg(r['fore' + s], j['el' + s], j['ha' + s], 0.1, 0.11);
      placeSeg(r['hand' + s], j['ha' + s], along(j['el' + s], j['ha' + s], 0.25), 0.1, 0.06);
    }
  }

  // ムササビの膜(腕と脚の間)
  let membrane;
  function buildMembrane() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12 * 3), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5, 6, 7, 8, 6, 8, 9, 6, 9, 10, 6, 10, 11]);
    membrane = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x9a6236, transparent: true, opacity: 0.82, side: THREE.DoubleSide, emissive: 0x2a1406 }));
    membrane.frustumCulled = false;
    membrane.visible = false;
    scene.add(membrane);
  }
  function updateMembrane(j, show) {
    membrane.visible = !!(j && show);
    if (!membrane.visible) return;
    const order = [['haL', 'elL', 'shL', 'hiL', 'knL', 'ftL'], ['haR', 'elR', 'shR', 'hiR', 'knR', 'ftR']];
    const arr = membrane.geometry.attributes.position.array;
    let k = 0;
    for (const side of order) for (const n of side) { arr[k++] = j[n][0]; arr[k++] = j[n][1] + 0.02; arr[k++] = j[n][2]; }
    membrane.geometry.attributes.position.needsUpdate = true;
    membrane.geometry.computeVertexNormals();
  }

  function buildBall() {
    // ハンドボール(白地に赤と青のパネル)
    const tex = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#f7f7f2'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 4; i++) {
        g.fillStyle = i % 2 ? '#1f5fd0' : '#e8402a';
        g.beginPath();
        g.ellipse(i * w / 4 + w / 8, h / 2, w / 11, h * 0.36, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    });
    ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 20, 14), new THREE.MeshLambertMaterial({ map: tex, emissive: 0x333333 }));
    scene.add(ballMesh);
    ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }));
    ballShadow.rotation.x = -Math.PI / 2;
    scene.add(ballShadow);
  }

  function buildFootprints() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false });
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), mat.clone());
      m.rotation.x = -Math.PI / 2;
      m.scale.set(0.8, 1.4, 1);
      m.renderOrder = 2;
      m.visible = false;
      scene.add(m);
      footDiscs.push(m);
    }
  }

  // ---------- 紙吹雪(室内なので花火の代わり) ----------
  const CF_N = 900;
  const CF_COLORS = [0xff4757, 0xffd32a, 0x2ed573, 0x1e90ff, 0xff6bcb, 0xffffff, 0xffa502, 0x7bed9f, 0xc0c0ff];
  let cf, cfData = [];
  const cfDummy = new THREE.Object3D(), cfColor = new THREE.Color();
  function buildConfetti() {
    cf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.07, 0.11), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), CF_N);
    cf.frustumCulled = false;
    for (let i = 0; i < CF_N; i++) {
      cfData.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, sx: 0, sy: 0, sz: 0, ph: 0, life: 0 });
      cfColor.setHex(CF_COLORS[i % CF_COLORS.length]);
      cf.setColorAt(i, cfColor);
      cfDummy.scale.setScalar(0); cfDummy.updateMatrix(); cf.setMatrixAt(i, cfDummy.matrix);
    }
    cf.instanceColor.needsUpdate = true;
    scene.add(cf);
  }
  let cfNext = 0;
  function emit(x, y, z, vx, vy, vz, life) {
    const d = cfData[cfNext]; cfNext = (cfNext + 1) % CF_N;
    Object.assign(d, {
      active: true, x, y, z, vx, vy, vz, life,
      rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6,
      sx: (Math.random() - 0.5) * 14, sy: (Math.random() - 0.5) * 14, sz: (Math.random() - 0.5) * 14, ph: Math.random() * 6,
    });
  }
  function confetti(power = 1, cx = 0) {
    const n = Math.floor(280 * power);
    for (let i = 0; i < n; i++) {
      const k = i % 3;
      if (k === 0) { // 天井から降ってくる
        emit(cx + (Math.random() - 0.5) * 16, CEIL - 2 - Math.random() * 3, -2 + Math.random() * 12, 0, -Math.random(), 0, 9 + Math.random() * 4);
      } else { // ゴールの両脇のキャノン
        const s = k === 1 ? -1 : 1;
        const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 3;
        emit(s * 4.5, 0.6, 0.5, -s * (1 + Math.random() * 2.5) + Math.cos(a) * sp * 0.3, 9 + Math.random() * 6, 1.5 + Math.random() * 3 + Math.sin(a), 7 + Math.random() * 3);
      }
    }
  }
  function updateConfetti(dt) {
    for (let i = 0; i < CF_N; i++) {
      const d = cfData[i];
      if (!d.active) continue;
      d.life -= dt;
      if (d.life <= 0 || d.y < 0.01) {
        if (d.y < 0.02 && d.life > 0) { d.y = 0.01; d.vx = d.vy = d.vz = 0; d.sx = d.sz = 0; d.sy *= 0.98; } // 床に積もる
        if (d.life <= 0) {
          d.active = false;
          cfDummy.scale.setScalar(0); cfDummy.updateMatrix(); cf.setMatrixAt(i, cfDummy.matrix);
          continue;
        }
      } else {
        d.vy -= 9.8 * dt;
        const drag = Math.exp(-(d.vy < 0 ? 4.5 : 1.2) * dt);
        d.vx *= drag; d.vz *= drag;
        if (d.vy < -1.1) d.vy = -1.1; // ひらひら落ちる
        d.ph += dt * 5;
        d.x += (d.vx + Math.sin(d.ph) * 0.45) * dt; d.y += d.vy * dt; d.z += (d.vz + Math.cos(d.ph * 0.7) * 0.3) * dt;
        d.rx += d.sx * dt; d.ry += d.sy * dt; d.rz += d.sz * dt;
      }
      cfDummy.position.set(d.x, d.y, d.z);
      if (d.y <= 0.011) cfDummy.rotation.set(-Math.PI / 2, 0, d.rz); else cfDummy.rotation.set(d.rx, d.ry, d.rz);
      cfDummy.scale.setScalar(1);
      cfDummy.updateMatrix();
      cf.setMatrixAt(i, cfDummy.matrix);
    }
    cf.instanceMatrix.needsUpdate = true;
  }
  function clearConfetti() {
    for (let i = 0; i < CF_N; i++) {
      cfData[i].active = false;
      cfDummy.scale.setScalar(0); cfDummy.updateMatrix(); cf.setMatrixAt(i, cfDummy.matrix);
    }
    cf.instanceMatrix.needsUpdate = true;
  }

  // ---------- 初期化 ----------
  const quality = { max: 1, pr: 1, frames: 0, time: 0, warm: 0, w: 0, h: 0 };
  function init(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const touch = window.matchMedia('(pointer: coarse)').matches;
    quality.max = Math.min(dpr, touch ? 1.5 : 2);
    quality.pr = quality.max;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: 'high-performance' });
    renderer.setPixelRatio(quality.pr);
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x10121a);
    scene.fog = new THREE.Fog(0x161925, 45, 110);
    camera = new THREE.PerspectiveCamera(46, W / H, 0.1, 300); // 縦の画角。広すぎるとゴールが遠く見える
    glowTex = glowTexture();

    // 室内の照明: 天井からの光が中心
    scene.add(new THREE.HemisphereLight(0xfff6e6, 0x5a4030, 1.55));
    const key = new THREE.DirectionalLight(0xfff4e0, 2.0);
    key.position.set(6, 30, 18);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xd8e2ff, 0.8);
    fill.position.set(-14, 20, -20);
    scene.add(fill);

    buildArena();
    rigs.player = makeRig('home', '7', false, 0x231a12, 0xd9a77f);
    rigs.keeper = makeRig('gk', '1', true, 0x1b1b1b, 0xd09a72);
    rigs.mate = makeRig('home', '10', false, 0x5a3a1e, 0xd9a77f);
    buildMembrane();
    buildBall();
    buildFootprints();
    buildConfetti();
    renderer.compile(scene, camera);
    ready = true;
  }

  function adaptQuality(dt) {
    quality.warm += dt;
    if (quality.warm < 3 || quality.pr <= 1) return;
    quality.frames++; quality.time += dt;
    if (quality.time < 2) return;
    const avg = quality.time / quality.frames;
    quality.frames = 0; quality.time = 0;
    if (avg > 1 / 48) {
      quality.pr = Math.max(1, quality.pr - 0.25);
      renderer.setPixelRatio(quality.pr);
      renderer.setSize(quality.w, quality.h, false);
    }
  }

  function resize(cssW, cssH, logicalW) {
    if (!ready) return;
    quality.w = cssW; quality.h = cssH;
    W = logicalW;
    camera.aspect = cssW / cssH;
    camera.updateProjectionMatrix();
    renderer.setSize(cssW, cssH, false);
  }

  // ---------- 毎フレーム ----------
  // v: { cam:{x,y,z,lx,ly,lz}, player:{j,heading,x,z,y,musa}, keeper:{j,x,z}, ball:{x,y,z,spin}|null, footprints, lineFlash, cheer, st }
  function render(v, dt) {
    if (!ready) return;
    updateScreen(v.st);
    poseRig(rigs.player, v.player && v.player.j, v.player ? v.player.heading : 0);
    poseRig(rigs.keeper, v.keeper && v.keeper.j, v.keeper ? v.keeper.f : 0);
    poseRig(rigs.mate, v.mate && v.mate.j, v.mate ? v.mate.heading : 0);
    if (v.mate) { rigs.mate.shadow.position.set(v.mate.x, 0.02, v.mate.z); rigs.mate.shadow.scale.set(0.9, 0.9, 1); }
    if (v.player) {
      rigs.player.shadow.position.set(v.player.x, 0.02, v.player.z);
      rigs.player.shadow.scale.set(v.player.musa ? 1.5 : 0.9, v.player.musa ? 2 : 0.9, 1);
      rigs.player.shadow.rotation.z = -v.player.heading;
      rigs.player.shadow.material.opacity = Math.max(0.15, 0.38 - v.player.y * 0.12);
    }
    if (v.keeper) {
      rigs.keeper.shadow.position.set(v.keeper.x, 0.021, v.keeper.z);
      rigs.keeper.shadow.scale.set(1.3, 0.8, 1);
      rigs.keeper.shadow.rotation.z = v.keeper.f || 0;
    }
    updateMembrane(v.player && v.player.j, v.player && v.player.musa);
    // ボール
    ballMesh.visible = ballShadow.visible = !!v.ball;
    if (v.ball) {
      ballMesh.position.set(v.ball.x, v.ball.y, v.ball.z);
      ballMesh.rotation.set(v.ball.spin || 0, (v.ball.spin || 0) * 0.6, 0);
      ballShadow.position.set(v.ball.x, 0.025, v.ball.z);
      const h = Math.max(0, v.ball.y);
      ballShadow.scale.setScalar(Math.max(0.5, 1 - h * 0.12));
      ballShadow.material.opacity = Math.max(0.15, 0.5 - h * 0.08);
    }
    // 足あと
    footDiscs.forEach((m, i) => {
      const f = v.footprints && v.footprints[i];
      m.visible = !!f;
      if (f) {
        m.position.set(f.x, 0.012, f.z);
        m.rotation.z = -f.a;
        m.material.color.setHex(f.n >= 4 ? 0xff4040 : f.n === 3 ? 0xffd84a : 0xffffff);
      }
    });
    // 6mライン
    lineFlash.visible = !!v.lineFlash;
    if (lineFlash.visible) {
      lineFlash.material.color.setHex(v.lineFlash === 'warn' ? 0xffa030 : 0xff3030);
      lineFlash.material.opacity = 0.55 + 0.4 * Math.sin(v.st.time * 16);
    }
    // 観客の盛り上がり(テクスチャを揺らして跳ねているように見せる)
    for (const m of crowdMats) m.map.offset.y = v.cheer > 0.02 ? Math.abs(Math.sin(v.st.time * 9)) * 0.012 * v.cheer : 0;
    updateConfetti(dt);
    adaptQuality(dt);

    const c = v.cam;
    const fov = v.fov || 46;
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 6); camera.updateProjectionMatrix(); }
    camera.position.set(c.x, c.y, c.z);
    camera.lookAt(c.lx, c.ly, c.lz);
    renderer.render(scene, camera);
  }

  const tmp = new THREE.Vector3();
  function project(x, y, z) {
    tmp.set(x, y, z).project(camera);
    return { x: (tmp.x + 1) / 2 * W, y: (1 - tmp.y) / 2 * H, behind: tmp.z > 1 };
  }

  return { init, render, resize, project, confetti, clearConfetti, BALL_R };
})();
