# リペアコール

マツエクサロン向けの再来店自動化Webアプリです。仕様は [CLAUDE.md](./CLAUDE.md) にあります。

- Next.js 16（App Router、Cache Components）、Tailwind CSS v4
- Supabase（Postgres、Auth、Storage、RLS）
- Vercel

## ディレクトリ

```
supabase/migrations/   データベースの定義（SQL Editor に貼って実行）
scripts/seed.ts        テスト用データ（サロン1件・顧客10人・来店記録）
src/proxy.ts           ログイン状態のチェック（旧 middleware）
src/lib/               Supabase クライアント、認証、日付・かな・マツエク設計の処理
src/app/app/           サロン用画面（/app）
src/components/        フォームなどの部品
```

## はじめての設定

### 1. Supabase

1. https://supabase.com/dashboard で **New project**。Region は **Northeast Asia (Tokyo)**。
2. 左メニュー **SQL Editor** → **New query** に `supabase/migrations/` のSQLを**ファイル名の順に1つずつ**貼り付けて **Run**。
   - `20261110000000_init.sql`（1週目）
   - `20261117000000_week2_line.sql`（2週目：LINE接続・予約）
   - `20261124000000_week3_reminders_billing.sql`（3週目：リペア案内・課金・読み取り専用モード）
   - `20261201000000_week4_admin.sql`（4週目：管理画面・ベータ招待・利用状況）
   - `20261208000000_line_without_liff_and_salon_bookings.sql`（LIFFなしのLINE連携・サロン側の予約登録）
   - 「Success. No rows returned」と出ればOK。
   - **Table Editor** に salons、customers、visits などのテーブルができ、**Storage** に `visit-photos` バケットができます。
3. **Authentication → Sign In / Providers → Email** が有効になっていることを確認。テスト中は **Confirm email** をOFFにしておくと楽です。
4. **Project Settings → API Keys** で次の値を控えます。
   - Project URL（**Project Settings → Data API** にあります）
   - `anon` / publishable キー
   - `service_role` / secret キー（公開しない）

### 2. 環境変数

`.env.example` をコピーして `.env.local` を作り、値を入れます。

```bash
cp .env.example .env.local
```

| 名前 | 内容 | Vercel に設定 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | ○ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable キー | ○ |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret キー | ○（Sensitive） |
| `APP_ENCRYPTION_KEY` | `openssl rand -base64 32` の結果。LINEトークンの暗号化 | ○（Sensitive） |
| `APP_URL` | 任意。公開URLを固定したいとき（本番は設定推奨） | 任意 |
| `CRON_SECRET` | `openssl rand -hex 32` の結果。毎朝の案内の呼び出し用 | ○（Sensitive） |
| `STRIPE_SECRET_KEY` | Stripe のシークレットキー | ○（Sensitive） |
| `STRIPE_WEBHOOK_SECRET` | `npm run stripe:setup -- <公開URL>` で表示される値 | ○（Sensitive） |
| `RESEND_API_KEY` | Resend の APIキー | ○（Sensitive） |
| `EMAIL_FROM` | 送信元（例：`リペアコール <noreply@your-domain>`） | ○ |
| `ADMIN_REPORT_EMAIL` | 日次レポートの送り先（運営者） | ○ |
| `SEED_EMAIL` / `SEED_PASSWORD` | テスト用ログイン | 不要 |

### 3. 手元で動かす

```bash
npm install
npm run seed     # テスト用データを作る（SEED_EMAIL / SEED_PASSWORD でログインできるようになる）
npm run dev      # http://localhost:3000/app
```

スマホ幅で確認するときは、ブラウザの開発者ツールで幅375pxにしてください。

### 4. Vercel

1. Vercel でこのリポジトリを **Import**（Framework Preset は Next.js のまま）。
2. **Settings → Environment Variables** に上の表の「○」の3つを登録（Production と Preview）。
3. push すると自動でデプロイされます。
4. **Settings → Deployment Protection** で Preview の **Vercel Authentication をOFF**。
   ONのままだと LINE の Webhook やお客さまの予約ページがプレビューURLに入れません。

### 5. LINE

LINEログインチャネル・LIFFは使いません。サロンがやることは次の3つだけで、初期設定ウィザード（`/app/setup`）に画像つきで案内が出ます。

1. Messaging API のチャネルシークレットとチャネルアクセストークン（長期）を貼り付けて保存（Webhook URL は自動で登録）
2. LINE Official Account Manager の応答設定で **Webhook をオン**、**応答メッセージをオフ**
3. 自分のLINEから確認コードを送り、「確認できました」になればOK

- お客さまのLINE連携：QR → トークに「連携コード XXXXXX」が入った状態で開く → 送信 → 自動で紐づけ（応答メッセージで返信。送信数に数えない）
- 予約：案内に入っている専用URL（`/r/<token>`、30日有効）。トークで「予約」と送っても届く
- ガイド画像は `public/guide/*.svg`（画面イメージ）。実際のスクリーンショットに差し替える場合は同じファイル名で置き換えてください

### 6. Stripe

```bash
npm run stripe:setup                              # 商品・価格・クーポン・Customer Portal
npm run stripe:setup -- https://<公開URL>          # ＋ Webhook を登録（表示された whsec_... を環境変数へ）
```

- 価格：月額 7,480円 / 年額 74,800円（税込）、14日間の無料体験
- 紹介：紹介された店は申込時に、紹介した店は相手が有料に切り替わった時に、各1か月分（7,480円）割引
- テストカード：`4242 4242 4242 4242`（期限は未来の日付、CVCは任意）

### 7. Supabase の認証メール用URL

**Authentication → URL Configuration** で
- Site URL：本番の公開URL
- Redirect URLs：`https://<公開URL>/**`（プレビューURLで試す場合はそれも追加）

### 8. 毎朝のリペア案内

`vercel.json` の Cron で毎日 01:00 UTC（10:00 JST）に `/api/cron/reminders` が呼ばれます（**Production のみ**）。
プレビュー環境では手動で呼びます。

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" "https://<公開URL>/api/cron/reminders?dry=1"   # 対象者の数だけ確認
curl -H "Authorization: Bearer <CRON_SECRET>" "https://<公開URL>/api/cron/reminders"         # 実際に送る（10〜20時のみ）
```

### 9. 運営者の管理画面

`admins` テーブルに登録したユーザーだけが `/admin` を開けます。登録方法と本番公開の手順は [docs/production.md](./docs/production.md) を見てください。

## 主なURL

| URL | 内容 |
| --- | --- |
| `/app/customers` | 顧客一覧（サロン） |
| `/app/bookings` | 予約一覧（今日・1週間） |
| `/app/slots` | 空き枠の管理 |
| `/app/settings/line` | LINE接続 |
| `/app/report` | 月次レポート |
| `/app/customers/lapsed` | 来なくなったお客さま（45日以上） |
| `/` | トップ・料金・申し込み（`?ref=紹介コード&utm_source=…`） |
| `/app/setup` | 初期設定ウィザード |
| `/admin` | 運営者の管理画面 |
| `/admin/invites` | ベータ招待コード |
| `/legal/tokushoho` `/legal/terms` `/legal/privacy` | 法務ページ（文面は仮） |
| `/api/cron/daily-report` | 運営者への日次レポート（9:00 JST） |
| `/api/cron/reminders` | 毎朝のリペア案内 |
| `/api/stripe/webhook` | Stripe Webhook |
| `/r/<token>` | お客さま：専用の予約ページ（案内・「予約」の返信から） |
| `/app/bookings/new` | サロン：予約の登録（電話・ホットペッパーなど） |
| `/api/line/webhook/<サロンID>` | LINE Webhook |

## よく使うコマンド

```bash
npm run dev        # 開発サーバー
npm run build      # 本番ビルド
npm run typecheck  # 型チェック
npm run lint       # Lint
npm run seed       # テスト用データを作り直す
```
