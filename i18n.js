'use strict';
// ムササビシュート — 日本語 / 英語の文言
// 端末の言語が日本語なら日本語、それ以外は英語。タイトル画面のボタンで切り替えられ、選んだ言語はブラウザに保存する。
window.I18N = (() => {
  const DICT = {
    ja: {
      'doc.title': 'ムササビシュート',
      'title': 'ムササビシュート',
      'title.lead': 'ハンドボールのサイドから、ムササビのように跳んでシュート！<br>ホイッスルでパスを受けて、3歩以内に跳び込もう。',
      'btn.start': 'スタート',
      'btn.help': '遊び方',
      'btn.back': 'もどる',
      'btn.retry': 'もう一度',
      'btn.title': 'タイトルへ',
      'btn.resume': '再開',
      'best.title': 'ベスト記録：{b} 点',
      'rotate.msg': 'スマホを横向きにしてください',
      'rotate.sub': 'ムササビシュートは横画面で遊ぶゲームです',
      'hud.shot': '{n} / {t} 本目',
      'hud.steps': '歩数',
      'hud.nav': 'ナビ {s}',
      'result.title': '結果',
      'result.score': '{s} 点 ／ {g} / {t} ゴール（{nav}）',
      'result.newRecord': 'ベスト記録更新！',
      'result.best': 'ベスト {b} 点',
      'nav.on': 'ナビあり', 'nav.off': 'ナビなし',
      'pause.title': 'PAUSE',

      'share.btn': '📤 結果をシェア', 'share.post': '𝕏 ポスト', 'share.copy': 'コピー',
      'share.title': 'ムササビシュート',
      'share.msg.image': '成績画像つきでシェアできます',
      'share.msg.links': 'X・LINE・コピーからシェアしてください',
      'share.copied': '結果をコピーしました！SNSに貼り付けてください',
      'share.copyFail': 'コピーできませんでした。X・LINEボタンを使ってください',
      'share.perfect': '【パーフェクト！】',
      'share.text': '🤸ムササビシュートで{g}/{t}ゴール！{p}\n称号:{r} SCORE {s}（{nav}）\nムササビで{m}本・最大{c}連続ゴール\n#ムササビシュート #ハンドボール #ClaudeCode',
      'card.head': 'ムササビシュート（{nav}）',
      'card.goals': '{g} / {t} ゴール',
      'card.rank': '称号 {r}',
      'card.line1': 'SCORE {s}　ムササビ {m}本　最大 {c}連続',
      'card.tags': '#ムササビシュート #ハンドボール #ClaudeCode',

      'msg.shotN': '{n}本目',
      'msg.spotGk': '{spot} ／ GK：{gk}',
      'msg.whistle': 'ピッ！',
      'msg.passComing': '{p}が来るぞ',
      'msg.catch': 'キャッチ！', 'msg.catch.sub': '3歩以内に跳べ',
      'msg.musaOk': 'ムササビOK！', 'msg.musaOk.sub': 'ジャンプボタンがムササビに変わった',
      'msg.musa': 'ムササビ！', 'msg.musa.sub': '長い滞空時間でキーパーの動きを見極めろ',
      'msg.step3': '3歩！', 'msg.step3.musa': '左足で踏み切ってムササビ！', 'msg.step3.jump': '次の1歩は反則。今すぐ跳べ！',
      'foul.over': 'オーバーステップ', 'foul.over.sub': '4歩目を踏んでしまった！',
      'foul.line': 'ラインクロス', 'foul.line.sub': '6mラインを踏んでしまった！', 'foul.line.takeoff': '踏み切りで6mラインを踏んでしまった！',
      'foul.noshot': 'シュートできず', 'foul.noshot.sub': 'シュートする前に着地してしまった！',
      'foul.late': '間に合わず', 'foul.late.sub': '投げ終わる前に着地してしまった！',
      'hist.foul': '失敗：{f}',
      'hist.goal': 'GOAL {label} +{pts}',
      'hist.save': 'セーブ　{label}', 'hist.post': 'ポスト　{label}', 'hist.miss': '枠外　{label}',
      'shot.label': '{timing}・{type}シュート',
      'msg.goal': 'GOAL!!', 'msg.corner': '（隅！）', 'msg.combo': '　{c}連続！',
      'msg.save': 'セーブ…', 'msg.save.sub': '{label}はキーパーに止められた',
      'msg.post': 'ポスト！', 'msg.post.sub': '{label}は枠に嫌われた',
      'msg.miss': 'はずれ…', 'msg.miss.sub': '{label}は枠の外',
      'pop.spin': 'キュッ！ キレ{p}', 'spin.strong': '強', 'spin.mid': '中', 'spin.weak': '弱',
      'nav.jump': '跳べ！', 'nav.musa': 'ムササビ！',
      'ring.high': '高く', 'ring.low': '低く', 'ring.left': '左', 'ring.right': '右',
      'btn.dash': 'ダッシュ', 'btn.dash.sub': '{n}歩でムササビ', 'btn.dash.ok': 'ムササビOK',
      'btn.jump': 'ジャンプ', 'btn.musa': 'ムササビ',

      'shot.normal': 'ノーマル', 'shot.loop': 'ループ', 'shot.spinL': '左スピン', 'shot.spinR': '右スピン', 'shot.bound': 'バウンド',
      'shotsub.normal': '速いシュート', 'shotsub.loop': '高く山なり', 'shotsub.spinL': '左へ切れる', 'shotsub.spinR': '右へ切れる', 'shotsub.bound': '足元を抜く',
      'timing.step': 'ステップ', 'timing.quick': 'クイック', 'timing.jump': 'ジャンプ', 'timing.fall': '倒れ込み', 'timing.musasabi': 'ムササビ',
      'gk.track': '定位置でじっくり型', 'gk.rush': '飛び出し型', 'gk.near': 'ニアを固める型', 'gk.sway': '左右に揺さぶる型',
      'gk.feint': 'フェイント型', 'gk.line': 'ゴールライン型', 'gk.star': '大の字ジャンプ型',
      'commit.star': '大の字ジャンプ！', 'commit.low': 'しゃがんだ！', 'commit.diveL': '左に倒れた！', 'commit.diveR': '右に倒れた！',
      'commit.out': '前に出てきた！', 'commit.spread': '両手を広げた！', 'commit.wait': 'じっと待っている…',
      'pass.direct': '直接パス', 'pass.bounce': 'バウンドパス', 'pass.lob': '山なりパス',
      'spot.corner': '右コーナーから', 'spot.wing': 'サイドの定位置から', 'spot.sideline': 'サイドライン沿いに走り込んで',
      'screen.shot': '{n} / {t} 本目',

      'help.title': '遊び方',
      'help.body': `
<h3>1本の流れ</h3>
<ol>
  <li>ホイッスル「ピッ！」で、味方（10番）から <b>直接・バウンド・山なり</b> のどれかのパスが来る。受けるまでは操作なし。</li>
  <li>受けたら左（コート中央）へ切れ込みながら <b>3歩以内</b> に跳ぶ。足あとに 1・2・3 が出る。</li>
  <li>着地するまでにシュート。1ゲーム20本。</li>
</ol>
<h3>操作</h3>
<ul>
  <li><b>ダッシュ</b>（左端の下・長押し）… 歩幅が大きくなる。受けてから <b>ダッシュで2歩</b> 踏むと、ジャンプが自動で <b>ムササビ</b> に変わる（跳ぶまでそのまま）。</li>
  <li><b>ジャンプ / ムササビ</b>（左端の上）… 踏ん張ってから跳ぶ。ムササビは滞空時間がとても長い。</li>
  <li>跳んだら左端が <b>方向キー</b> に変わる … シュートのコース（左右・高低）。</li>
  <li><b>シュート</b>（右端のひし形）… まん中 ノーマル ／ 上 ループ ／ 左 左スピン ／ 右 右スピン ／ 下 バウンド。腕を引いてから投げるので、ボールが離れるまで少しかかる。地上で押すとステップシュート。</li>
</ul>
<h3>ムササビシュートとは</h3>
<p>サイドの選手が、ゴールではなく <b>コート中央側へ跳び込み</b>、空中で体を大きく倒して角度を広げる技（プロンジョンシュート）。まず高く跳んでキーパーを見て、後半に体を倒す。倒すほど角度は広がるが、高いコースは打ちにくい。</p>
<h3>キーパーを読む</h3>
<p>前に出た・しゃがんだ・両手を広げた → ループ ／ 大の字 → バウンド ／ 倒れた → 逆サイドへノーマル。<br>スピンはダッシュして歩数を使うほどキレる。ループはキーパーが下がってジャンプするので隅を狙おう。</p>
<h3>失敗</h3>
<p class="ng">4歩目を踏む ／ 6mラインを踏む（近くでダッシュのまま3歩進むと入ってしまう）／ 投げ終わる前に着地</p>
<h3 class="keys-only">キーボード</h3>
<p class="keys-only">Shift ダッシュ ／ Space ジャンプ・ムササビ ／ 矢印キー・WASD 方向（跳んでから）／ U ノーマル　I ループ　J 左スピン　L 右スピン　K バウンド ／ P・Esc 一時停止 ／ M 音 ／ N ナビ</p>`,
    },
    en: {
      'doc.title': 'Musasabi Shoot',
      'title': 'MUSASABI SHOOT',
      'title.lead': 'Fly like a flying squirrel from the handball wing and score!<br>Catch the pass on the whistle and take off within 3 steps.',
      'btn.start': 'START',
      'btn.help': 'HOW TO PLAY',
      'btn.back': 'BACK',
      'btn.retry': 'PLAY AGAIN',
      'btn.title': 'TITLE',
      'btn.resume': 'RESUME',
      'best.title': 'Best: {b} pts',
      'rotate.msg': 'Please turn your phone sideways',
      'rotate.sub': 'Musasabi Shoot is played in landscape',
      'hud.shot': 'SHOT {n} / {t}',
      'hud.steps': 'STEPS',
      'hud.nav': 'NAV {s}',
      'result.title': 'RESULT',
      'result.score': '{s} pts / {g} of {t} goals ({nav})',
      'result.newRecord': 'New best!',
      'result.best': 'Best {b} pts',
      'nav.on': 'NAV on', 'nav.off': 'NAV off',
      'pause.title': 'PAUSE',

      'share.btn': '📤 Share result', 'share.post': '𝕏 Post', 'share.copy': 'Copy',
      'share.title': 'Musasabi Shoot',
      'share.msg.image': 'Share with a result card image',
      'share.msg.links': 'Share via X, LINE or copy',
      'share.copied': 'Copied! Paste it into your social media',
      'share.copyFail': 'Could not copy. Please use the X or LINE button',
      'share.perfect': ' PERFECT!',
      'share.text': '🤸I scored {g}/{t} in Musasabi Shoot!{p}\nRank: {r}  SCORE {s} ({nav})\n{m} flying-squirrel goals, best streak {c}\n#MusasabiShoot #Handball #ClaudeCode',
      'card.head': 'MUSASABI SHOOT ({nav})',
      'card.goals': '{g} / {t} GOALS',
      'card.rank': 'RANK {r}',
      'card.line1': 'SCORE {s}   {m} flying goals   best streak {c}',
      'card.tags': '#MusasabiShoot #Handball #ClaudeCode',

      'msg.shotN': 'SHOT {n}',
      'msg.spotGk': '{spot} / GK: {gk}',
      'msg.whistle': 'TWEET!',
      'msg.passComing': '{p} incoming!',
      'msg.catch': 'CATCH!', 'msg.catch.sub': 'Take off within 3 steps',
      'msg.musaOk': 'MUSASABI READY!', 'msg.musaOk.sub': 'The JUMP button is now MUSASABI',
      'msg.musa': 'MUSASABI!', 'msg.musa.sub': 'Long hang time: read the keeper',
      'msg.step3': '3 STEPS!', 'msg.step3.musa': 'Take off from your left foot!', 'msg.step3.jump': 'Another step is a foul. Jump now!',
      'foul.over': 'TRAVELLING', 'foul.over.sub': 'You took a 4th step!',
      'foul.line': 'LINE CROSSED', 'foul.line.sub': 'You stepped on the 6 m line!', 'foul.line.takeoff': 'You stepped on the 6 m line taking off!',
      'foul.noshot': 'NO SHOT', 'foul.noshot.sub': 'You landed before shooting!',
      'foul.late': 'TOO LATE', 'foul.late.sub': 'You landed before releasing the ball!',
      'hist.foul': 'FAIL: {f}',
      'hist.goal': 'GOAL {label} +{pts}',
      'hist.save': 'Saved  {label}', 'hist.post': 'Post  {label}', 'hist.miss': 'Wide  {label}',
      'shot.label': '{timing} {type} shot',
      'msg.goal': 'GOAL!!', 'msg.corner': ' (corner!)', 'msg.combo': '  {c} in a row!',
      'msg.save': 'SAVED…', 'msg.save.sub': 'The keeper stopped your {label}',
      'msg.post': 'POST!', 'msg.post.sub': 'Your {label} hit the frame',
      'msg.miss': 'MISSED…', 'msg.miss.sub': 'Your {label} went wide',
      'pop.spin': 'SNAP! {p} spin', 'spin.strong': 'strong', 'spin.mid': 'medium', 'spin.weak': 'weak',
      'nav.jump': 'JUMP!', 'nav.musa': 'MUSASABI!',
      'ring.high': 'HIGH', 'ring.low': 'LOW', 'ring.left': 'L', 'ring.right': 'R',
      'btn.dash': 'DASH', 'btn.dash.sub': '{n} steps→MUSASABI', 'btn.dash.ok': 'MUSASABI OK',
      'btn.jump': 'JUMP', 'btn.musa': 'MUSASABI',

      'shot.normal': 'NORMAL', 'shot.loop': 'LOOP', 'shot.spinL': 'L-SPIN', 'shot.spinR': 'R-SPIN', 'shot.bound': 'BOUNCE',
      'shotsub.normal': 'fast', 'shotsub.loop': 'high lob', 'shotsub.spinL': 'breaks left', 'shotsub.spinR': 'breaks right', 'shotsub.bound': 'under the legs',
      'timing.step': 'Step', 'timing.quick': 'Quick', 'timing.jump': 'Jump', 'timing.fall': 'Falling', 'timing.musasabi': 'Musasabi',
      'gk.track': 'Patient keeper', 'gk.rush': 'Rusher', 'gk.near': 'Near-post guard', 'gk.sway': 'Swayer',
      'gk.feint': 'Feinter', 'gk.line': 'Line keeper', 'gk.star': 'Star jumper',
      'commit.star': 'Star jump!', 'commit.low': 'Crouched!', 'commit.diveL': 'Dived left!', 'commit.diveR': 'Dived right!',
      'commit.out': 'Rushed out!', 'commit.spread': 'Arms wide!', 'commit.wait': 'Waiting…',
      'pass.direct': 'Direct pass', 'pass.bounce': 'Bounce pass', 'pass.lob': 'Lob pass',
      'spot.corner': 'From the right corner', 'spot.wing': 'From the wing spot', 'spot.sideline': 'Running down the sideline',
      'screen.shot': 'SHOT {n} / {t}',

      'help.title': 'HOW TO PLAY',
      'help.body': `
<h3>Each shot</h3>
<ol>
  <li>On the whistle, your teammate (#10) passes: a <b>direct, bounce or lob</b> pass. You can't control the player until you catch it.</li>
  <li>After the catch, cut in toward the middle and take off <b>within 3 steps</b>. Footprints show 1, 2, 3.</li>
  <li>Shoot before you land. 20 shots per game.</li>
</ol>
<h3>Controls</h3>
<ul>
  <li><b>DASH</b> (bottom left, hold) … longer strides. Take <b>2 dash steps</b> after the catch and JUMP turns into <b>MUSASABI</b> (it stays until you jump).</li>
  <li><b>JUMP / MUSASABI</b> (top left) … plant and take off. Musasabi has a very long hang time.</li>
  <li>Once in the air, the left side becomes a <b>direction ring</b> … aim left/right and high/low.</li>
  <li><b>Shots</b> (diamond on the right) … centre NORMAL / top LOOP / left L-SPIN / right R-SPIN / bottom BOUNCE. You wind up before the release, so it takes a moment. On the ground it's a step shot.</li>
</ul>
<h3>What is the musasabi shot?</h3>
<p>A wing player dives <b>toward the middle of the court</b> instead of the goal and leans far over in the air to widen the angle (the "plongeon" shot). Rise first and watch the keeper, then lean late. The more you lean, the wider the angle, but high corners get harder.</p>
<h3>Read the keeper</h3>
<p>Rushed out / crouched / arms wide → LOOP. Star jump → BOUNCE. Dived → NORMAL to the other side.<br>Spin breaks harder after dashing and using your steps. The keeper backs off and jumps for loops, so aim for the corners.</p>
<h3>Fouls</h3>
<p class="ng">A 4th step / stepping on the 6 m line (3 dash steps from close in will cross it) / landing before the release</p>
<h3 class="keys-only">Keyboard</h3>
<p class="keys-only">Shift DASH / Space JUMP / arrows or WASD aim (in the air) / U NORMAL  I LOOP  J L-SPIN  L R-SPIN  K BOUNCE / P or Esc pause / M sound / N NAV</p>`,
    },
  };
  let lang = 'ja';
  try {
    const saved = localStorage.getItem('musasabi.lang');
    lang = saved || ((navigator.language || 'ja').toLowerCase().startsWith('ja') ? 'ja' : 'en');
  } catch (e) {
    lang = (navigator.language || 'ja').toLowerCase().startsWith('ja') ? 'ja' : 'en';
  }
  if (!DICT[lang]) lang = 'ja';

  function t(key, vars) {
    let s = (DICT[lang] && DICT[lang][key]) ?? DICT.ja[key] ?? key;
    if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  }
  // data-i18n(文字) / data-i18n-html(HTML) の付いた要素を今の言語にする
  function apply(root = document) {
    document.documentElement.lang = lang;
    document.title = t('doc.title');
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  }
  function set(l) {
    if (!DICT[l]) return;
    lang = l;
    try { localStorage.setItem('musasabi.lang', l); } catch (e) { /* 保存できない環境 */ }
    apply();
  }
  return { t, apply, set, get lang() { return lang; } };
})();
