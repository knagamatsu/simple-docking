# ローカル検証手順

このドキュメントは、Simple Docking Dashboard をローカル環境で検証する手順を説明します。

## 前提条件

- Docker 20.10+
- Docker Compose V2+
- Git
- ブラウザ

## 検証手順

### 方法1: 簡易起動スクリプト（推奨）

```bash
# リポジトリのルートディレクトリで実行
./start.sh
```

このスクリプトは以下を自動的に実行します：
- Docker環境のチェック
- Dockerイメージのビルド
- サービスの起動
- ヘルスチェック
- ブラウザの自動起動（オプション）

### 方法2: Docker Compose直接実行

```bash
# 1. イメージのビルドとサービス起動
docker compose up --build -d

# 2. サービス状態の確認
docker compose ps

# 3. ログの確認（オプション）
docker compose logs -f

# 4. ヘルスチェック
curl http://localhost:8090/simple-docking/api/health
```

**期待される出力**:
```json
{"ok": true}
```

## アクセス確認

### 1. フロントエンド

ブラウザで以下にアクセス：
```
http://localhost:8090/simple-docking
```

**確認項目**:
- ✅ ダッシュボードページが表示される
- ✅ 「新規実行」ボタンが機能する
- ✅ 4ステップウィザードに遷移できる

### 2. API ドキュメント

```
http://localhost:8090/simple-docking/api/docs
```

**確認項目**:
- ✅ OpenAPI（Swagger UI）が表示される
- ✅ 14のエンドポイントが存在する
- ✅ Try it out で実行可能

### 3. バックエンド API

```bash
# ヘルスチェック
curl http://localhost:8090/simple-docking/api/health

# タンパク質一覧の取得
curl http://localhost:8090/simple-docking/api/proteins

# 実行一覧の取得
curl http://localhost:8090/simple-docking/api/runs
```

## 機能テスト

### テスト1: リガンド作成とドッキング実行

#### 1. リガンド作成（SMILES）

```bash
curl -X POST http://localhost:8090/simple-docking/api/ligands \
  -H "Content-Type: application/json" \
  -d '{
    "smiles": "CC(=O)OC1=CC=CC=C1C(=O)O",
    "name": "Aspirin Test"
  }'
```

**期待される出力**:
```json
{
  "ligand_id": 1,
  "name": "Aspirin Test"
}
```

#### 2. 実行作成

```bash
# 上記で取得した ligand_id を使用
curl -X POST http://localhost:8090/simple-docking/api/runs \
  -H "Content-Type: application/json" \
  -d '{
    "ligand_id": 1,
    "protein_id": "prot_cdk2",
    "preset": "fast"
  }'
```

**期待される出力**:
```json
{
  "run_id": 1,
  "status": "pending"
}
```

#### 3. 実行状態の確認

```bash
# 上記で取得した run_id を使用
curl http://localhost:8090/simple-docking/api/runs/1/status
```

**状態遷移**:
1. `pending` → 初期状態
2. `running` → ドッキング計算中
3. `completed` → 完了（成功）
4. `failed` → 失敗

#### 4. 結果の取得

```bash
# 実行が completed になったら結果を取得
curl http://localhost:8090/simple-docking/api/runs/1/results
```

**期待される出力**:
```json
{
  "run_id": 1,
  "status": "completed",
  "results": [
    {
      "task_id": 1,
      "conformer_index": 0,
      "status": "completed",
      "score": -6.5,
      "pose_path": "/data/object_store/runs/1/tasks/1/pose_0.pdbqt"
    }
  ]
}
```

### テスト2: UI経由の実行

1. ブラウザで `http://localhost:8090/simple-docking` を開く
2. 「新規実行」をクリック
3. ステップ1: リガンド入力
   - SMILES: `CC(=O)OC1=CC=CC=C1C(=O)O`
   - 名前: `Aspirin UI Test`
   - 「次へ」をクリック
4. ステップ2: ターゲット選択
   - `CDK2 (Cyclin-dependent kinase 2)` を選択
   - 「次へ」をクリック
5. ステップ3: 設定
   - プリセット: `Fast`
   - 「実行」をクリック
6. ステップ4: 結果
   - 進捗バーが表示される
   - 完了後、スコアとダウンロードリンクが表示される

## サービス状態の確認

### 全サービスのステータス

```bash
docker compose ps
```

**期待される出力**:
```
NAME                        STATUS
simple-docking-api-1        Up
simple-docking-broker-1     Up
simple-docking-db-1         Up
simple-docking-frontend-1   Up
simple-docking-gateway-1    Up
simple-docking-worker-1     Up
```

### 個別ログの確認

```bash
# APIログ
docker compose logs -f api

# Workerログ
docker compose logs -f worker

# フロントエンドログ
docker compose logs -f frontend

# すべてのログ
docker compose logs -f
```

## データの確認

### データベース直接アクセス（開発用）

```bash
# PostgreSQLコンテナに接続
docker compose exec db psql -U docking -d docking

# SQL実行例
SELECT * FROM ligands;
SELECT * FROM runs;
SELECT * FROM tasks;
```

### オブジェクトストレージ

```bash
# 生成されたファイルの確認
ls -lh data/object_store/runs/
```

**内容**:
- `runs/<run_id>/tasks/<task_id>/pose_*.pdbqt` - ドッキングポーズ
- `runs/<run_id>/tasks/<task_id>/vina.log` - Vinaログ
- `runs/<run_id>/ligand.pdbqt` - リガンドPDBQT

## トラブルシューティング

### サービスが起動しない

```bash
# ログを確認
docker compose logs

# 特定のサービスのログ
docker compose logs api
docker compose logs worker

# サービスを再起動
docker compose restart

# クリーンアップして再起動
docker compose down
docker compose up --build -d
```

### ポートが使用中

```bash
# ポート8090が使用されているか確認
sudo lsof -i :8090

# 使用中の場合、docker-compose.ymlのポート番号を変更
# gateway:
#   ports:
#     - "8091:80"  # 8090 → 8091 に変更
```

### データベース初期化

```bash
# すべてのデータを削除して再起動
docker compose down -v
rm -rf data/postgres data/object_store
docker compose up --build -d
```

## 停止とクリーンアップ

### サービスの停止

```bash
# サービスを停止（データは保持）
docker compose down

# サービスとボリュームを削除
docker compose down -v
```

### イメージの削除

```bash
# ビルドしたイメージを削除
docker compose down --rmi local

# すべてのイメージを削除
docker compose down --rmi all
```

## パフォーマンステスト

### 並列実行テスト

```bash
# 10個のリガンドを同時に作成・実行
for i in {1..10}; do
  curl -X POST http://localhost:8090/simple-docking/api/ligands \
    -H "Content-Type: application/json" \
    -d "{\"smiles\": \"CC(=O)OC1=CC=CC=C1C(=O)O\", \"name\": \"Test $i\"}" &
done
wait

# Workerのログで処理を確認
docker compose logs -f worker
```

### レート制限テスト

```bash
# 60req/minの制限を確認（61回目でエラーになる）
for i in {1..65}; do
  echo "Request $i:"
  curl -w "\nStatus: %{http_code}\n" \
    http://localhost:8090/simple-docking/api/health
  sleep 0.5
done
```

**期待される動作**:
- 最初の60リクエスト: HTTP 200
- 61回目以降: HTTP 429 (Too Many Requests)

## セキュリティ検証

### 外部からのアクセス確認

```bash
# ポート8090のみが公開されているか確認
sudo netstat -tlnp | grep -E "(5432|6379|8090)"
```

**期待される出力**:
- ✅ 8090: LISTEN (Nginx)
- ❌ 5432: 表示されない（PostgreSQL）
- ❌ 6379: 表示されない（Redis/Valkey）

### CORS設定確認

```bash
curl -I -X OPTIONS \
  -H "Origin: http://example.com" \
  -H "Access-Control-Request-Method: GET" \
  http://localhost:8090/simple-docking/api/health
```

**期待される動作**:
- `Access-Control-Allow-Origin` ヘッダーが制限的に設定されている

## 次のステップ

検証が完了したら：

1. **デプロイ準備**: `docs/deploy.md` を参照
2. **Agent Skills**: `ドキュメント更新して` で自動更新
3. **リリース**: `git tag v0.1.0 && git push origin v0.1.0`

## 関連ドキュメント

- [README.md](./README.md) - プロジェクト概要
- [docs/architecture.md](./docs/architecture.md) - アーキテクチャ
- [docs/deploy.md](./docs/deploy.md) - デプロイ手順
- [docs/roadmap.md](./docs/roadmap.md) - ロードマップ
