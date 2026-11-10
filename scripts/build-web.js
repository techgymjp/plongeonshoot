// Web ファイルを www/ にコピーする。Web 版（Vercel）は npm run build、アプリ（Android / iOS）は npm run build:app。
// アプリ用（APP_BUILD=1）では、Web 版だけの部分（Google Play へのリンクなど）を取り除く:
//   HTML は <!-- web-only --> … <!-- /web-only -->、JS は // web-only:start … // web-only:end の行、CSS は /* web-only:start */ … /* web-only:end */
// アプリのバンドルに他社ストアへのリンクと、それをアプリで隠す処理が入っていると、
// App Store の審査で「審査中に隠した機能」（Guideline 5.6）とみなされることがあるため
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const item of [
  'index.html', 'style.css', 'manifest.json',
  'game.js', 'scene3d.js', 'i18n.js', 'ads.js', 'vendor',
]) {
  const src = path.join(root, item);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(out, item), { recursive: true });
}
const app = process.env.APP_BUILD === '1';
if (app) {
  const strip = {
    '.html': /[ \t]*<!-- web-only -->[\s\S]*?<!-- \/web-only -->[ \t]*\n?/g,
    '.js': /[ \t]*\/\/ web-only:start[\s\S]*?\/\/ web-only:end[^\n]*\n?/g,
    '.css': /[ \t]*\/\* web-only:start \*\/[\s\S]*?\/\* web-only:end \*\/[ \t]*\n?/g,
  };
  const bad = [];
  for (const item of fs.readdirSync(out)) {
    const file = path.join(out, item);
    const re = strip[path.extname(item)];
    if (!re || !fs.statSync(file).isFile()) continue;
    const text = fs.readFileSync(file, 'utf8').replace(re, '');
    fs.writeFileSync(file, text);
    if (/play\.google\.com|apps\.apple\.com|web-only/.test(text)) bad.push(item);
  }
  if (bad.length) {
    console.error(`Web 版だけの部分がアプリ用のファイルに残っています: ${bad.join(', ')}`);
    process.exit(1);
  }
}
// Google Play 用のビルドでは本番の広告を使う
const mode = process.env.ADMOB_MODE === 'production' ? 'production' : 'test';
fs.writeFileSync(path.join(out, 'ads-config.js'), `// ビルド時に生成\nwindow.AD_MODE = '${mode}';\n`);
// タイトル画面に出すバージョン（CI では VERSION_NAME / VERSION_CODE を使う）
const version = process.env.VERSION_CODE
  ? `v${process.env.VERSION_NAME || require('../package.json').version} (build ${process.env.VERSION_CODE})`
  : 'dev';
fs.writeFileSync(path.join(out, 'build-info.js'), `// ビルド時に生成\nwindow.APP_VERSION = '${version}';\n`);
console.log(`built web assets into www/ (${app ? 'app' : 'web'}, ads: ${mode}, version: ${version})`);
