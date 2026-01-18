# 環境設定ガイド

このドキュメントでは、`.env` ファイルを使用した環境設定について説明します。

## 基本的な使い方

### 1. .env ファイルの作成

```bash
cp .env.example .env
```

### 2. 必要に応じて編集

```bash
nano .env  # またはお好みのエディタ
```

### 3. 起動

```bash
docker compose up --build -d
```

## 主要な設定項目

### 外部アクセス設定

#### `EXTERNAL_PORT`（デフォルト: 8090）

アプリケーションにアクセスするポート番号。

```env
EXTERNAL_PORT=8090
```

変更例：
```env
EXTERNAL_PORT=3000  # ポート3000でアクセス
```

アクセスURL: `http://localhost:3000/simple-docking`

#### `APP_BASE_PATH`（デフォルト: /simple-docking）

アプリケーションのベースパス。通常は変更不要。

```env
APP_BASE_PATH=/simple-docking
```

### データベース設定

#### パスワード変更（本番環境では必須）

```env
POSTGRES_PASSWORD=your_secure_password_here
```

⚠️ **セキュリティ警告**: 本番環境では必ず強力なパスワードに変更してください。

#### データベース名とユーザー

```env
POSTGRES_DB=docking
POSTGRES_USER=docking
```

### Redis/Valkey 設定

通常は変更不要。

```env
REDIS_PORT=6379
BROKER_URL=redis://broker:${REDIS_PORT}/0
```

### タスク設定

#### `TASK_TIMEOUT_SECONDS`（デフォルト: 300）

ドッキング計算のタイムアウト時間（秒）。

```env
TASK_TIMEOUT_SECONDS=600  # 10分に延長
```

#### `MAX_RETRIES`（デフォルト: 2）

タスク失敗時の再試行回数。

```env
MAX_RETRIES=3
```

### ドッキング設定

#### `POCKET_METHOD_DEFAULT`（デフォルト: auto）

結合ポケット検出方法。

- `auto`: PDBリガンドから自動検出
- `manual`: ユーザー指定

```env
POCKET_METHOD_DEFAULT=auto
```

#### `POCKET_PADDING`（デフォルト: 6.0）

結合ポケット周りのパディング（Å）。

```env
POCKET_PADDING=8.0  # より広い範囲を探索
```

### セキュリティ設定

#### `CORS_ORIGINS`

許可するオリジン（本番環境では制限推奨）。

```env
CORS_ORIGINS=http://localhost:8090,https://yourdomain.com
```

#### `RATE_LIMIT_PER_MINUTE`（デフォルト: 60）

1分あたりのAPIリクエスト数制限。

```env
RATE_LIMIT_PER_MINUTE=100  # より多くのリクエストを許可
```

## 開発環境向け設定

### データベース/Redisポートの公開

開発時にDBやRedisに直接アクセスしたい場合：

1. `docker-compose.yml` を編集
2. 該当するサービスの `ports` セクションのコメントを外す

```yaml
  db:
    # ...
    ports:
      - "${DEV_DB_PORT:-5432}:5432"  # コメントを外す
```

3. .envで任意のポートを指定（オプション）

```env
DEV_DB_PORT=5433  # ホスト側のポート番号
```

4. 接続方法

```bash
# PostgreSQL
psql -h localhost -p 5433 -U docking -d docking

# Redis
redis-cli -p 6379
```

## 使用例

### 例1: ポート変更

```env
EXTERNAL_PORT=3000
```

起動後、`http://localhost:3000/simple-docking` でアクセス。

### 例2: セキュアな本番環境

```env
# 外部ポート
EXTERNAL_PORT=443  # HTTPSリバースプロキシ経由を想定

# 強力なパスワード
POSTGRES_PASSWORD=x9K$mP2@vL8qR#nW5tY

# CORS制限
CORS_ORIGINS=https://docking.example.com

# タイムアウト延長
TASK_TIMEOUT_SECONDS=600

# レート制限強化
RATE_LIMIT_PER_MINUTE=30
```

### 例3: 開発環境

```env
# 開発用ポート
EXTERNAL_PORT=3001

# 弱いパスワード（開発のみ）
POSTGRES_PASSWORD=dev

# CORS緩和
CORS_ORIGINS=*

# タイムアウト短縮（テスト用）
TASK_TIMEOUT_SECONDS=60
```

## トラブルシューティング

### ポート変更が反映されない

```bash
docker compose down
docker compose up --build -d
```

### データベースパスワード変更後に接続エラー

既存のデータベースボリュームを削除：

```bash
docker compose down -v
docker compose up --build -d
```

⚠️ **警告**: データが削除されます。

### .env が読み込まれない

1. `.env` ファイルが `docker-compose.yml` と同じディレクトリにあるか確認
2. ファイル名が `.env` であることを確認（`.env.example` ではない）
3. 構文エラーがないか確認

```bash
# 設定内容を確認
docker compose config
```

## デフォルト値

`.env` ファイルがない場合、以下のデフォルト値が使用されます：

| 項目 | デフォルト値 |
|------|-------------|
| EXTERNAL_PORT | 8090 |
| POSTGRES_PASSWORD | docking |
| TASK_TIMEOUT_SECONDS | 300 |
| MAX_RETRIES | 2 |
| POCKET_PADDING | 6.0 |
| RATE_LIMIT_PER_MINUTE | 60 |

## セキュリティのベストプラクティス

1. ✅ **パスワードを変更**: デフォルトのパスワードは使わない
2. ✅ **CORS を制限**: 本番環境では特定のオリジンのみ許可
3. ✅ **.env をコミットしない**: `.gitignore` に含まれていることを確認
4. ✅ **レート制限を設定**: DoS 攻撃を防ぐ
5. ✅ **DB/Redis ポートを非公開**: 開発時のみ公開

## 関連ドキュメント

- [デプロイメントガイド](deploy.md)
- [アーキテクチャ](architecture.md)
- [ユーザーガイド](USER_GUIDE.md)
