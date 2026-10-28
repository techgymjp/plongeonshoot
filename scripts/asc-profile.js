// App Store 配布用のプロビジョニングプロファイルを App Store Connect API で作り直し、Xcode が読む場所に入れる。
// GitHub Actions（.github/workflows/ios.yml）から使う。開発用の証明書は作らない（アカウントの上限に当たるため）
//   node scripts/asc-profile.js <Bundle ID> <プロファイル名> <API キー (.p8) のパス>
//   環境変数 ASC_KEY_ID / ASC_ISSUER_ID
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const [bundle, name, keyPath] = process.argv.slice(2);
const { ASC_KEY_ID: kid, ASC_ISSUER_ID: iss } = process.env;
if (!bundle || !name || !keyPath || !kid || !iss) {
  console.error('usage: ASC_KEY_ID=… ASC_ISSUER_ID=… node scripts/asc-profile.js <bundle id> <profile name> <AuthKey.p8>');
  process.exit(2);
}

const b64url = (b) => Buffer.from(b).toString('base64url');
function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'ES256', kid, typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iss, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' }));
  const key = crypto.createPrivateKey(fs.readFileSync(keyPath));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64url(sig)}`;
}
const auth = token();

async function api(method, url, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1/${url}`, {
    method,
    headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}\n${text}`);
  return text ? JSON.parse(text) : {};
}

(async () => {
  // Bundle ID（Apple Developer の Identifiers に登録してあるもの）
  const ids = await api('GET', `bundleIds?filter[identifier]=${encodeURIComponent(bundle)}&limit=20`);
  const bid = (ids.data || []).find((d) => d.attributes.identifier === bundle);
  if (!bid) throw new Error(`Bundle ID ${bundle} が Apple Developer の Identifiers にありません`);

  // 配布用の証明書（Apple Distribution / iOS Distribution）をすべて入れる。GitHub Secrets の .p12 もこのどれか
  const certs = await api('GET', 'certificates?limit=200');
  const dist = (certs.data || []).filter((c) => ['DISTRIBUTION', 'IOS_DISTRIBUTION'].includes(c.attributes.certificateType));
  if (!dist.length) throw new Error('配布用の証明書（Apple Distribution）がありません。docs/IOS_BUILD.md の 7 章を見てください');

  // 同じ名前のプロファイルは消して作り直す（証明書を作り直しても、いつも最新の証明書が入るように）
  const old = await api('GET', `profiles?filter[name]=${encodeURIComponent(name)}&limit=20`);
  for (const p of old.data || []) if (p.attributes.name === name) await api('DELETE', `profiles/${p.id}`);

  const made = await api('POST', 'profiles', {
    data: {
      type: 'profiles',
      attributes: { name, profileType: 'IOS_APP_STORE' },
      relationships: {
        bundleId: { data: { type: 'bundleIds', id: bid.id } },
        certificates: { data: dist.map((c) => ({ type: 'certificates', id: c.id })) },
      },
    },
  });
  const { uuid, profileContent } = made.data.attributes;
  const content = Buffer.from(profileContent, 'base64');
  for (const dir of [
    path.join(os.homedir(), 'Library/MobileDevice/Provisioning Profiles'),
    path.join(os.homedir(), 'Library/Developer/Xcode/UserData/Provisioning Profiles'),
  ]) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${uuid}.mobileprovision`), content);
  }
  console.log(`プロファイル「${name}」を作りました（${uuid}、配布用の証明書 ${dist.length} 枚）`);
})().catch((e) => { console.error(e.message); process.exit(1); });
