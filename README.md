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
| `APP_URL` | 任意。公開URLを固定したいとき | 任意 |
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
   ONのままだと LINE の Webhook やお客さまの LIFF ページがプレビューURLに入れません。

### 5. LINE

アプリにログインして **設定 → LINE公式アカウントの接続** を開くと、画面に手順が出ます。

- Messaging API チャネルと LINEログインチャネルは**同じプロバイダー**に作る（別だとお客さまのIDが一致しない）
- LINEログインチャネルは**「公開済み」**にする
- LIFF のエンドポイントURLは `https://<公開URL>/liff/<サロンID>`（画面に表示されます）
- Webhook URL は保存時に自動で登録されます。「Webhookの利用」だけ手動でオンにする

## 主なURL

| URL | 内容 |
| --- | --- |
| `/app/customers` | 顧客一覧（サロン） |
| `/app/bookings` | 予約一覧（今日・1週間） |
| `/app/slots` | 空き枠の管理 |
| `/app/settings/line` | LINE接続 |
| `/liff/<サロンID>/link?t=…` | お客さま：LINE連携（QRから開く） |
| `/liff/<サロンID>/book` | お客さま：予約ページ |
| `/api/line/webhook/<サロンID>` | LINE Webhook |

## よく使うコマンド

```bash
npm run dev        # 開発サーバー
npm run build      # 本番ビルド
npm run typecheck  # 型チェック
npm run lint       # Lint
npm run seed       # テスト用データを作り直す
```
