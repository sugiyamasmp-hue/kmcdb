# Supabase プロジェクトの再起動 / 状態確認

対象プロジェクト ref: `wxuqqkpgyfkpuejvvzix`

## 1. アクセストークンを用意する

https://supabase.com/dashboard/account/tokens で Personal Access Token（`sbp_` で始まる）を発行する。
このトークンはアカウント全体の管理権限を持つため、リポジトリにコミットしないこと。

## 2. ローカルから実行する

```bash
export SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxx

./scripts/supabase-restart.sh --status    # 状態確認のみ
./scripts/supabase-restart.sh             # 再起動して ACTIVE_HEALTHY まで待機
./scripts/supabase-restart.sh --restore   # 一時停止(PAUSED/INACTIVE)からの復帰
```

ref を切り替える場合は引数か `SUPABASE_PROJECT_REF` で指定する。

```bash
./scripts/supabase-restart.sh <project_ref>
```

## 3. GitHub Actions から実行する

リポジトリの Secrets に `SUPABASE_ACCESS_TOKEN` を登録したうえで、
Actions タブ → **Supabase Restart** → *Run workflow* から `status` / `restart` / `restore` を選ぶ。
ローカルに環境がなくてもブラウザだけで再起動できる。

## 生の curl

```bash
# 再起動
curl -X POST "https://api.supabase.com/v1/projects/wxuqqkpgyfkpuejvvzix/restart" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"

# 状態確認
curl "https://api.supabase.com/v1/projects/wxuqqkpgyfkpuejvvzix" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"
```

`status` が `ACTIVE_HEALTHY` なら正常稼働。`INACTIVE` / `PAUSED` は一時停止状態で、
この場合 `/restart` では起動しないため `/restore` を使う。

無料プランは一定期間アクセスがないと自動的に一時停止するため、
`.github/workflows/keep-alive.yml` が 3 日おきに `/auth/v1/health` を叩いて停止を防いでいる。
