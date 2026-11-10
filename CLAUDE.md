# マツエクサロン向け 再来店自動化SaaS（仮称：リペアコール）

このファイルはプロジェクトの仕様書です。作業の前に必ず読み、ここに書かれた方針に従ってください。
迷ったら「サロンの手間を増やさない」「LINEの送信数を増やさない」を優先してください。

## 1. 何を作るか

マツエク（まつげエクステ）の個人サロン向けWebアプリ。月額7,480円（税込）のサブスク。

価値は1つだけ：**ホットペッパーなどで来た新規客を、サロン自身のLINEでリピーターにする。**
リペア時期（前回来店から約3週間）になったら、サロンのLINE公式アカウントから自動で案内を送り、LINE内の予約ページで予約まで完結させる。

### 利用者
- **サロン**（1〜3人規模のオーナー）：スマホのブラウザで使う。ホーム画面に追加できる形（PWA）。
- **お客さま**：LINEの中だけで完結（LIFF）。アプリのインストールやアカウント作成はさせない。
- **運営者（開発者本人）**：専用の管理画面だけを使う。

## 2. 技術スタック

- Next.js（App Router, TypeScript）＋ Tailwind CSS
- Supabase：Postgres、Auth、Storage（施術写真）、Row Level Security
- Vercel：ホスティング、Vercel Cron（毎日の自動処理）
- Stripe：Checkout、Billing（サブスク）、Customer Portal、Webhook
- LINE：Messaging API（各サロンのチャネル）、LIFF（お客さま用画面）
- メール送信：Resend など（運営者への日次レポート、サロンへの案内）

App Storeでは配布しない（課金ルールのため）。Webアプリとして提供する。

## 3. 画面一覧（最初の版）

### サロン用（/app）
1. ログイン・新規登録（Stripe Checkout完了後にアカウント作成）
2. 初期設定ウィザード：サロン名 → LINEチャネル接続（手順を画面と画像で案内）→ リペア日数の初期値 → 空き枠の登録
3. 顧客一覧（ふりがな順、検索：名前・ふりがな・電話）
4. 顧客詳細（カルテ）：基本情報、アレルギー・注意事項（目立つ位置）、パッチテスト日、来店履歴、LINE連携状態
5. 来店記録の入力：日付、メニュー、金額、マツエク設計（下記）、写真、メモ
6. 来店記録の保存後に「LINE連携QR」を表示（お客さま専用、ワンタイム）
7. 空き枠の管理：週ごとに時間枠を登録・削除（最初は簡単な作りでよい）
8. 予約一覧（今日・今週）
9. 来なくなったお客さまの一覧（45日以上来店なし）
10. 月次レポート：「案内から戻った人数・金額」「今月のLINE送信数 / 200」
11. 設定：リペア日数、案内文のテンプレート、プラン・請求（Stripe Customer Portalへのリンク）

### お客さま用（LIFF, /liff）
1. LINE連携ページ：QRから開き「登録する」を押すだけで line_user_id と顧客を紐づける
2. 予約ページ：空き枠を選んで予約。完了はページ上に表示する（LINEの送信数を使わない）。カレンダー登録ボタンを出す

### 運営者用（/admin、管理者のみ）
- MRR、有料店舗数、体験中の店舗数、体験→有料の転換率、月次の解約率
- 初期設定の完了率、直近7日に使った店舗の割合
- 店舗ごとの案内から戻った予約の件数、LINE送信数 / 200
- 解約リスクの店舗（7日ログインなし、初期設定が終わっていない、決済失敗）
- 申込経路（紹介コード・UTM）ごとの体験数と有料数
- **お客さまの個人情報（名前・カルテの中身）は表示しない。件数と利用状況だけ。**

## 4. マツエク設計（カルテの専門項目）

来店記録ごとに保存する（jsonbでよい）：
- ゾーン別の長さ（目頭／中央／目尻、左右）mm
- カール（J, B, C, CC, D, L, M など）、太さ（mm）、本数、カラー
- 使用グルー、施術メニュー（シングル／ボリューム／ラッシュリフト等）
- 次回への申し送り

顧客ごとに保存する：
- アレルギー・注意事項、パッチテスト実施日
- 要配慮情報（病歴・アレルギー）を記録する場合の「本人同意あり」チェック（同意がない場合は入力欄を無効化）

## 5. データモデル（目安）

- salons：id, owner_user_id, name, line_channel_id, line_channel_secret（暗号化）, line_access_token（暗号化）, default_repair_days（初期値21）, liff_id, stripe_customer_id, subscription_status, trial_ends_at, referral_code, created_at
- customers：id, salon_id, name, name_kana, phone, birthday, memo, allergy_note, patch_test_on, sensitive_consent, line_user_id, line_blocked, repair_days（null ならサロンの初期値）, notify_opt_out, created_at
- visits：id, salon_id, customer_id, visited_at, menu, price, lash_design（jsonb）, note, booking_id（予約経由なら）
- visit_photos：id, visit_id, storage_path
- slots：id, salon_id, starts_at, ends_at, is_booked
- bookings：id, salon_id, customer_id, slot_id, status, source（'reminder' | 'direct'）, reminder_id, created_at
- reminders：id, salon_id, customer_id, cycle_visit_id（どの来店に対する案内か）, sent_at, status
- link_tokens：id, salon_id, customer_id, token, expires_at, used_at
- line_usage：salon_id, month, push_count
- events：id, salon_id, type, props（jsonb）, created_at（login, visit_created, booking_created, reminder_sent など）
- admins：user_id

Row Level Securityで、サロンは自分の salon_id の行しか読めないこと。

## 6. リペア案内（毎朝の自動処理）

Vercel Cronで毎日 10:00（日本時間）に実行。各サロンについて、次の条件を**すべて**満たす顧客を抽出する：
1. 最新の来店日 + repair_days ≦ 今日（日本時間）
2. 今日以降の予約がない
3. その最新来店（cycle_visit_id）に対する案内をまだ送っていない
4. line_user_id がある、ブロックされていない、notify_opt_out でない

見つかった顧客に Messaging API の Push で1通送る（Flex Message：サロン名、前回来店日、「空き枠を見て予約する」ボタン → LIFF予約ページ）。

制約：
- 送信は 10:00〜20:00 の間だけ
- サロンの当月 push_count が 190 に達したら送信を止め、サロンに知らせる（LINE無料プランは月200通）
- 前日リマインドは LINE では送らない（送信数を節約するため）
- unfollow の Webhook を受けたら line_blocked = true
- 失敗はリトライ1回、失敗内容は events に記録

**成果の数え方**：案内の送信後14日以内に入った予約を「案内からの予約」とし、その予約の来店記録の金額を月次レポートに合算する。

## 7. Stripe

- 価格：月額 7,480円（税込）、14日間の無料体験（カード登録あり）。年額 74,800円も用意。
- LPの「無料で試す」→ Checkout → Webhook（checkout.session.completed）でサロンのアカウントを作成し、初期設定の案内メールを送る
- customer.subscription.updated / deleted、invoice.payment_failed を受けて subscription_status を更新する
- 支払い状態が無効になったら、サロン画面を読み取り専用にし、自動案内を止める
- カード変更・領収書・解約は Customer Portal に任せる
- 紹介コード：紹介した店とされた店の両方に1か月分のクーポンを自動適用する

## 8. セキュリティと法務

- LINEのトークン類はアプリ側で暗号化して保存（鍵は環境変数）
- 環境変数・秘密情報は絶対にコミットしない（.env.local、.gitignore）
- 運営者の管理画面は admins テーブルにあるユーザーだけが開ける
- 特定商取引法の表記、利用規約、プライバシーポリシーのページを用意する（文面は後で差し替え）

## 9. 進め方（約4週間）

- **1週目**：プロジェクト作成、Supabaseのスキーマとセキュリティ設定、サロンのログイン、顧客一覧・カルテ・来店記録（マツエク設計つき）
- **2週目**：LINEチャネル接続、LIFFの連携ページ（QR）、空き枠と予約ページ、Webhook（follow/unfollow）
- **3週目**：毎朝のリペア案内、月次レポート、Stripe（Checkout・Webhook・Portal・紹介クーポン）
- **4週目**：運営者の管理画面、日次レポートのメール、初期設定ウィザードの仕上げ、本番環境（Vercel）への公開、ベータ用の招待

各段階の終わりに、動くものを開発者本人が確認できる状態にすること。

## 10. 作業ルール

- 日本語のUI。スマホ（幅375px）で使いやすいことを最優先
- 大きな変更の前に、方針と変更するファイルを短く説明してから進める
- 外部サービスの設定（Supabase、Stripe、LINE）が必要な場面では、開発者が画面上で何をすればいいかを手順で示す
- テスト用のデータ（サロン1件、顧客10人、来店記録）を作るスクリプトを用意する
