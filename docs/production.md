# 本番公開チェックリスト

上から順に進めてください。終わったら `[x]` にしていくと分かりやすいです。

## 1. Supabase（本番用プロジェクト）

テスト用とは別に、本番用のプロジェクトを作るのがおすすめです（テストデータが混ざらないように）。

- [ ] 新しいプロジェクトを作成（Region：Tokyo）
- [ ] SQL Editor で `supabase/migrations/` のSQLを**ファイル名の順に4つ**実行
- [ ] Authentication → Sign In / Providers：Email を有効、**Confirm email は ON**
- [ ] Authentication → URL Configuration
  - Site URL：`https://<本番ドメイン>`
  - Redirect URLs：`https://<本番ドメイン>/**`
- [ ] Authentication → Emails → SMTP Settings：Resend の SMTP を設定（パスワード再設定メールを独自ドメインから送るため。無料のSMTPは1時間あたりの送信数が少ない）
- [ ] 運営者（自分）のユーザーを作成し、管理画面の権限を付ける（下の「管理者の登録」）

### 管理者の登録

Authentication → Users →「Add user」で自分のメールアドレスとパスワードを登録してから、SQL Editor で：

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'あなたのメールアドレス';
```

`https://<本番ドメイン>/admin` を開いて表示されればOKです（管理者以外には「ページが見つかりません」と表示されます）。

## 2. Resend（メール）

- [ ] Domains で本番ドメインを追加し、表示された DNS レコードを登録して認証
- [ ] `EMAIL_FROM` を `リペアコール <noreply@<本番ドメイン>>` にする

## 3. Stripe（本番モード）

- [ ] Stripe のアカウント有効化（事業者情報・銀行口座・本人確認）。**特定商取引法の表記のURLが必要**です：`https://<本番ドメイン>/legal/tokushoho`
- [ ] 本番のシークレットキー（`sk_live_...`）を `.env.local` に一時的に入れて実行：

```bash
npm run stripe:setup -- https://<本番ドメイン>
```

- [ ] 表示された `whsec_...` を Vercel の Production の `STRIPE_WEBHOOK_SECRET` に設定
- [ ] 終わったら `.env.local` はテスト用キーに戻す

## 4. Vercel

- [ ] Settings → Domains で独自ドメインを追加（使う場合）
- [ ] Settings → Environment Variables（**Production**）に全部設定

| 名前 | 本番の値 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | 本番用 Supabase の値 |
| `APP_ENCRYPTION_KEY` | 新しく作る（`openssl rand -base64 32`）。**後から変えない** |
| `APP_URL` | `https://<本番ドメイン>` |
| `CRON_SECRET` | 新しく作る（`openssl rand -hex 32`） |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | 本番モードの値 |
| `RESEND_API_KEY` / `EMAIL_FROM` | 本番の値 |
| `ADMIN_REPORT_EMAIL` | 日次レポートの送り先 |

- `LINE_API_BASE` は**設定しない**（テスト専用）

- [ ] 作業ブランチを `main` に取り込む（Pull Request を作ってマージ）→ Production にデプロイされる
- [ ] Settings → Cron Jobs に2つ（daily-report 9:00、reminders 10:00 JST）が出ていることを確認

## 5. 公開前の最終確認

- [ ] 法務ページ（`/legal/...`）の【要記入】をすべて埋めた
- [ ] 本番ドメインで：申し込み → メール → パスワード設定 → 初期設定ウィザード → LINE接続
- [ ] 自分のLINEで：LINE連携QR → 予約 → カレンダー登録
- [ ] 22日以上前の来店記録を作り、翌朝10時にLINEが届く（または `?dry=1` で対象に入っていることを確認）
- [ ] 翌朝9時に日次レポートのメールが届く
- [ ] 本番の Stripe で自分のカードで申し込み → Customer Portal から解約 → 返金処理（Stripe ダッシュボード）

## 6. ベータ招待

1. `/admin/invites` で招待コードを作る（例：無料60日・1回だけ）
2. 表示された URL（`https://<本番ドメイン>/?invite=BETA....#pricing`）をサロンに送る
3. サロンが申し込むと、管理画面の「申込経路」に「招待：コード」で表示されます
