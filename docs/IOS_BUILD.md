# iOS 版をビルドして App Store に出す手順（Mac での作業）

ムササビシュートの iOS 版は、Android 版と同じ Capacitor で作っています（`ios/` フォルダ）。構成は JET STRIKE（techgymjp/jet-fighter）の iOS 版と同じです。
コードの準備はできているので、Mac では「ビルドして App Store Connect にアップロードする」作業だけを行います。

- Bundle ID：`jp.techgym.plongeonshoot`（Android と同じ）
- チーム：Team ID `GNM3VTX9YG`（Xcode の設定に入れてあります）。Apple Developer には**個人で登録**しています（App Store の販売元は個人名になります）
- 対応端末：iPhone（横画面固定）。iPad では iPhone 用の画面で動きます
- 広告：AdMob（iOS 用のアプリと広告ユニット。バナー・インタースティシャル・リワード）。起動時に「トラッキングの許可」の確認画面が出ます

---

## 0. ブラウザでの準備（最初の1回だけ）

1. **Apple Developer**（developer.apple.com）→「Certificates, Identifiers & Profiles」→「Identifiers」→「＋」→「App IDs」→「App」
   - Description：`MUSASABI SHOOT`
   - Bundle ID：「Explicit」で `jp.techgym.plongeonshoot`
   - Capabilities：何もチェックしない
2. **App Store Connect**（appstoreconnect.apple.com）→「マイ App」→「＋」→「新規 App」
   - プラットフォーム：iOS ／ 名前：`ムササビシュート ハンドボール`（Google Play と同じ）／ プライマリ言語：日本語
   - バンドル ID：1 で登録したもの ／ SKU：`plongeonshoot`（あとから変更不可）／ ユーザアクセス：アクセス制限なし
3. **AdMob**
   - 「アプリを追加」→ **iOS** →「ストアに掲載されていない」で登録し、**バナー・インタースティシャル・リワード**の広告ユニットを作る
   - アプリ ID と広告ユニット ID 3 つを Claude Code に渡す（`ios/App/App/Info.plist` の `GADApplicationIdentifier` と `ads.js` の `UNITS.ios.production` に入れます。それまではテスト用の ID が入っていて、本番ビルドでも広告は出ません）
   - 「プライバシーとメッセージ」→「欧州の規制」のメッセージに iOS アプリも追加する

---

## 1. Mac の準備（最初の1回だけ）

1. **Xcode** を App Store からインストールする（数十 GB あるので時間がかかります）。インストール後に一度起動し、追加コンポーネントのインストールを済ませる
2. Xcode の「Settings…」→「Accounts」→「＋」で、Apple Developer に登録している Apple ID でサインインする（チームが個人名で表示されれば OK）
3. **Node.js**（LTS 版）を https://nodejs.org/ からインストールする
4. ターミナルでリポジトリを取得する
   ```bash
   cd ~/Desktop   # 置きたい場所（どこでもよい）
   git clone https://github.com/techgymjp/plongeonshoot.git
   cd plongeonshoot
   npm ci
   ```
   `git` がないと言われたら、表示に従って「コマンドライン・デベロッパツール」をインストールしてから、もう一度実行します。

2回目以降は、`cd plongeonshoot` のあと `git pull` と `npm ci` で最新にします。

---

## 2. 自分の iPhone で動作確認する（テスト広告）

```bash
npm run ios:sync    # ゲームのファイルを iOS のプロジェクトにコピー（テスト広告）
npm run ios:open    # Xcode で開く
```

1. iPhone を USB ケーブルで Mac につなぎ、iPhone で「このコンピュータを信頼」を許可する
2. iPhone の「設定」→「プライバシーとセキュリティ」→「デベロッパモード」をオンにする（再起動を求められます。項目がない場合は、Xcode で一度 iPhone を選ぶと表示されます）
3. Xcode の上部で、実行先に自分の iPhone を選ぶ
4. 左の「App」→「Signing & Capabilities」で、「Automatically manage signing」がオン、Team に自分（個人名）のチームが選ばれていることを確認する
5. ▶（Run）を押すと、iPhone にアプリが入って起動する

確認すること：

- 横画面で全画面表示になる。ホーム画面の名前が「ムササビシュート」（英語の iPhone では「Musasabi Shoot」）
- トラッキングの確認画面が出る（日本語の iPhone では日本語）
- 操作できる（左のジャンプ／ダッシュ・方向リング、右のシュートボタン）、ホイッスル・歓声などの音が鳴る
- タイトル・遊び方・ポーズ・結果画面の下に**テスト広告**のバナー、スタート・もう一度・タイトルへ・ポーズからの再開で**テスト広告**の全画面広告が出る
- 決まらなかった1本のあとに「広告を見てやり直す」が出て、見終わると同じ1本をやり直せる
- 結果画面のシェアで iOS の共有シートが開く
- ホームに戻って開き直すと一時停止している

---

## 3. App Store 用にビルドしてアップロードする（本番広告）

```bash
git pull && npm ci
npm run ios:release   # 本番の広告 ID でコピーする（ここが ios:sync と違う）
npm run ios:open
```

1. Xcode の左で「App」→「General」→「Identity」を開き、**Build の番号を前回より大きくする**（初回は 1。アップロードのたびに 2、3…と上げる。同じ番号は二度アップロードできない）。Version は 1.0.0（`package.json` の version と同じ）
2. 上部の実行先を「**Any iOS Device (arm64)**」にする
3. メニューの「Product」→「**Archive**」（メニューバーは画面の最上部。全画面表示だと隠れるので、マウスを上端に動かす）
4. 終わると Organizer が開くので、「**Distribute App**」→「**App Store Connect**」→「Upload」で進める（途中の確認は既定のまま「Next」でよい。「Xcode Cloud can automate…」は「Remind Me Later」で閉じる）
5. 10〜30 分ほどで、App Store Connect の「TestFlight」タブにビルドが表示される

輸出コンプライアンス（暗号化）の質問は、Info.plist で「独自の暗号化は使っていない」と設定済みなので、聞かれません。

**注意**：`ios:release` でビルドしたアプリは本番の広告が出ます。TestFlight で確認するときも、**本番の広告はタップしない**でください（AdMob のアカウント停止の対象）。Xcode から iPhone に直接入れて試すときは、`npm run ios:sync` でテスト広告に戻してから実行します。

---

## 4. TestFlight で確認し、審査用の録画を作る

1. App Store Connect の「TestFlight」→「内部テスト」でグループを作り、自分を追加する
2. iPhone に「TestFlight」アプリを App Store から入れ、届いた招待からムササビシュートをインストールする
3. **審査用の画面録画を撮る**（新しいアカウントの初回審査では、実機での操作の録画を求められます。先に用意して、申請時に「メモ」と一緒に出すと早い）
   - iPhone の「設定」→「コントロールセンター」に「画面収録」を追加する
   - **アプリを起動するところから**録画する：起動 → 広告の同意・トラッキングの確認 → タイトル → 遊び方 → スタート → 数本プレイ（ダッシュ・ムササビ・シュート）→ ポーズ → 結果画面 → シェア
   - 1〜2 分で十分。本番広告が出ても**タップしない**
   - 大きすぎると返信に添付できないので、Mac の Finder で右クリック →「選択したビデオファイルをエンコード」→ 720p にするか、Google ドライブの共有リンクにする

---

## 5. App Store Connect で審査に出す

「配信」タブ（iOS App のバージョン 1.0.0）で入力します。バージョンが「1.0」になっていたら 1.0.0 に直して保存してください（そうしないとビルドが選べません）。

| 項目 | 入力内容 |
| --- | --- |
| スクリーンショット | 「Dynamic Island 搭載 iPhone（中型ディスプレイ）」の欄に、`docs/store/ios/6.3inch/` の 2622 × 1206（横向き）を入れる。日本語版（ja-）と英語版（en-）各 4 枚。6.9 インチ（2868 × 1320）は受け付けられない |
| ヘッダ・検索結果 | 「ヘッダと検索結果」タブに `docs/store/ios/appstore-header-3840x1646.png` と `appstore-search-3840x2560.png`（ヘッダを入れたら検索結果も入れる） |
| サブタイトル・プロモーション用テキスト・キーワード | 下の「App Store 用の文章」 |
| 概要 | Google Play 用の詳しい説明（`docs/store/listing.md`、英語は `docs/store/listing-en.txt`）を流用 |
| サポート URL | https://techgym.jp/ |
| プライバシーポリシー URL（App 情報・App のプライバシー） | https://techgym.jp/privacy-policy/ |
| 著作権 | 2026 TECH GYM K.K. |
| カテゴリ（App 情報） | ゲーム（サブカテゴリ：スポーツ） |
| コンテンツの配信権（App 情報） | 第三者のコンテンツ：いいえ（絵・音はすべて自作。three.js は MIT License のライブラリ） |
| ビルド | TestFlight で確認したビルドを選ぶ |
| 年齢制限 | 質問に答える（暴力・流血・ギャンブルなどの表現なし。ハンドボールのスポーツゲーム） |
| App のプライバシー | AdMob が収集するデータを申告する（下記） |
| App Review に関する情報 | サインイン不要。連絡先を入力。メモに下の「審査メモ」を入れ、4 章の録画を添付するかリンクを書く |

**App のプライバシー（AdMob を使うアプリの目安）**
Google の「Apple の App Store のデータ開示要件への準備」（AdMob のヘルプ）に、AdMob が収集するデータの一覧があります。必ずそちらを見て最終確認してください。目安は次のとおりです。

- 収集する：ID（デバイス ID）、使用状況データ（広告データ、製品の操作）、診断（クラッシュデータ、パフォーマンスデータ、その他の診断データ）、位置情報（おおよその場所）
- 目的：サードパーティ広告、アナリティクス
- ユーザーに関連付け：しない
- トラッキングに使用：デバイス ID と広告データは「する」

入力が終わったら「審査用に追加」→「審査へ提出」。

### App Store 用の文章

**サブタイトル**（30 文字以内）
- 日本語：`跳んで倒れ込んで決めるハンドボール`
- 英語：`Dive in and beat the keeper`

**プロモーション用テキスト**（170 文字以内）
- 日本語：`ホイッスルでパスを受けて、3歩以内にサイドから跳び込め！空中で倒れ込むムササビシュートで、7タイプのキーパーを打ち抜こう。全20本で何点取れるか挑戦。`
- 英語：`Catch the pass on the whistle and take off from the wing within 3 steps. Lean in the air with the musasabi shot and beat 7 types of keeper. 20 shots per game.`

**キーワード**（100 文字以内、カンマ区切り。アプリ名に入っている語は入れなくてよい）
- 日本語：`ハンドボール,シュート,スポーツ,ジャンプ,キーパー,ゴール,サイド,プロンジョン,球技,3D,無料,ゲーム`
- 英語：`handball,sports,shoot,jump,goalkeeper,goal,wing,plongeon,flying squirrel,ball,3d,free`

### 審査メモ（App Review への「メモ」。英語で書く）

```
Musasabi Shoot is a free 3D handball game for all ages. The player catches a pass, takes off from the wing within three steps and shoots past the goalkeeper. One game is 20 shots.

- No sign-in or account is needed. All features are available right after launch.
- Ads: Google AdMob (banner on menu screens, interstitial between games, and an optional rewarded ad to retake a missed shot). On first launch the app shows Google's consent message where required, then the App Tracking Transparency prompt. Ads are still shown if tracking is declined.
- Other services: the system share sheet for sharing the score. No other external services, no in-app purchases, no user-generated content.
- The app works the same in all regions. It is in Japanese and English.
- No regulated industry. All graphics and sounds were made for this game; the 3D library three.js is used under the MIT License.
- A screen recording on an iPhone, from launch through gameplay, is attached (or: <link>).
```

---

## 6. 公開後にやること

- AdMob で iOS アプリを App Store のアプリに紐づける（「アプリ」→ iOS のムササビシュート →「アプリの設定」）
- App Store からインストールして、起動・同意画面・トラッキングの確認・広告を確認する

---

## 7. 自動化の準備（2回目以降を GitHub Actions に任せる場合）

JET STRIKE と同じく、push するだけで GitHub Actions（GitHub の Mac 環境）がビルドし、TestFlight にアップロードできるようにできます。
証明書と API キーの作り方は JET STRIKE の `docs/IOS_BUILD.md` の 7 章と同じです（Apple Developer のチーム共通なので、JET STRIKE 用に作った .p12・.p8 とパスワードを使い回せます）。

このリポジトリの Settings → Secrets and variables → Actions（https://github.com/techgymjp/plongeonshoot/settings/secrets/actions）に、次の 5 つを登録します。

| 名前 | 内容 |
| --- | --- |
| `IOS_DIST_CERT_P12_BASE64` | 証明書（.p12）を変換した文字列 |
| `IOS_DIST_CERT_PASSWORD` | .p12 を書き出したときのパスワード |
| `ASC_KEY_ID` | API キーのキー ID |
| `ASC_ISSUER_ID` | Issuer ID |
| `ASC_KEY_P8_BASE64` | API キー（.p8）を変換した文字列 |

登録が終わったら、Claude Code に「iOS の自動アップロードのワークフローを作って」と頼みます。

**注意**：証明書（.p12）、そのパスワード、API キー（.p8）は、チャット（Claude Code を含む）・AI へのアップロード・リポジトリへのコミットで**絶対に共有しない**でください。

---

## つまずきやすいところ

| 症状 | 対処 |
| --- | --- |
| アップロードで「同じビルド番号がすでにある」 | General の Build の番号を上げてから Archive し直す |
| Signing でエラー（チームが選べない、証明書がない） | Xcode の Accounts で Apple ID にサインインし直し、Team を選ぶ。「Automatically manage signing」をオンにする |
| 実行先に iPhone が出ない | ケーブルをつなぎ直し、iPhone で「信頼」を許可。デベロッパモードをオンにする |
| 実行先に「iOS 26.x Not Installed」と出る | 「Get」で iOS のシミュレーターと部品をダウンロードする（8 GB ほど。Archive にも必要） |
| ビルドが古いゲームのまま | `npm run ios:sync`（または `ios:release`）を実行し忘れている。`git pull` してから実行し直す |
| 広告が出ない（本番ビルド） | AdMob で広告ユニットを消して作り直していないか確かめる。作り直したら新しい ID を Claude Code に渡す（`ads.js` の `UNITS.ios.production`） |
| ビルドを選ぼうとしても、アップロードしたビルドが出てこない | バージョンのページの「バージョン」が 1.0 のまま。1.0.0 に直して保存する |
| 「審査用に追加できません」 | 「コンテンツの配信権」と「アプリのプライバシー」のプライバシーポリシー URL を入力したか確かめる |
| 初回の審査で「Guideline 2.1 - Information Needed」 | 審査メモ（5 章）と 4 章の録画を App Review への返信で送り、同じ文をバージョンのページの「メモ」にも入れる |
| 返信に動画を添付すると「エラーが発生しました」 | 動画が大きすぎる。720p にエンコードするか、Google ドライブの共有リンクを貼る |
| App Store の審査で「Xcode が古い」と言われる | Xcode を最新版に更新してから Archive し直す |
