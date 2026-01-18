# Simple Docking Dashboard

化学者向けの簡易ドッキング評価ダッシュボードです。入力 → 標的 → 設定 → 結果の4ステップで操作でき、CSV/SDF でのバッチドッキングにも対応しています。

**📖 ユーザーガイド**: 詳しい使い方は [docs/USER_GUIDE.md](docs/USER_GUIDE.md) を参照してください。
**⚙️ 環境設定**: ポート番号やパスワードなどの設定は [docs/configuration.md](docs/configuration.md) を参照してください。
**📚 ドキュメント一覧**: 目的別の一覧は [docs/README.md](docs/README.md) を参照してください。

## 起動（Ubuntu）
1. Docker / Docker Compose をインストール
2. Git をインストール（`git clone` を使う場合）
3. リポジトリを取得（Git がない場合は ZIP をダウンロードして展開）
4. 環境変数ファイルを作成（オプション）
   ```bash
   cp .env.example .env
   # .env を編集してポート番号やパスワードを変更可能
   ```
5. 起動
   ```bash
   ./start.sh
   ```
   もしくは（手動起動）
   ```bash
   docker compose up --build -d
   ```
6. ブラウザで UI を開く
   - http://localhost:8090/simple-docking
   - ポート番号は `.env` の `EXTERNAL_PORT` で変更可能

On-prem and cloud demo deployment notes: `docs/deploy.md`.

## 構成
- `frontend/`: React UI（4画面＋ダッシュボード＋バッチ結果、2D EditorはKetcher）
- `backend/`: FastAPI API（Run/Task/Ligand/Protein 管理）
- `worker/`: Celery worker（ドッキングパイプライン）
- `protein_library/`: タンパク質ライブラリ＋manifest
- `data/object_store/`: 生成成果物（ポーズ/ログなど）

## API
- API: `http://localhost:8090/simple-docking/api`
- OpenAPI: `http://localhost:8090/simple-docking/api/docs`

## 依存関係
`uv` を使って Python 依存を固定しています（`uv.lock` 参照）。

## タンパク質ライブラリの更新
`protein_library/manifest.json` を更新した場合はインポートを実行してください。
```bash
PYTHONPATH=. python scripts/import_proteins.py
```
Auto pocket (ligand/protein bbox) options are documented in `docs/protein_library.md`.

## 画面操作（Navigation）
- **共通ナビゲーション**: 画面下部の固定フッター（Back / Next）でステップ間の移動がスムーズに行えます。
- **メイン画面へ戻る**: 画面右上の「Dashboard」リンクをクリックすると、過去の実行履歴一覧（ダッシュボード）に戻れます。
- **新規実行**: ダッシュボードまたはルート（`/`）からウィザード形式で新しいドッキングを開始できます。
- **バッチ実行**: Input で Batch を選択し、CSV/SDF をアップロードして複数リガンドを一括実行できます。

## レポート機能（Reporting）
Results画面では、シミュレーション結果のサマリーを簡単に共有できます。
- **Copy Report**: 結果画面右上の「📋 Copy Report」ボタンから、実行条件と上位スコアを含むレポートをクリップボードにコピーできます。
  - テキスト形式（チャットツール向け）とMarkdown形式（ドキュメント向け）を選択可能です。

## カスタムタンパク質の追加
Target Library 画面から PDB を追加できます（追加分はカテゴリ `Custom`）。

- **PDB ID からインポート**: 4文字の PDB ID を指定
- **PDB テキスト貼り付け**: 手元の PDB ファイルをそのまま貼り付け
- **プリセット**:
  - **Recommended**: 初心者向け推奨セット（CDK2, EGFR, PKA）※デフォルト
  - **Panels**: Kinase / GPCR / Protease / Nuclear receptor
  - **Advanced**: All targets / Custom / Oncology / Signaling
    - "Advanced Options" を展開すると利用可能です。

API で追加する場合は以下を利用してください。

- `POST /proteins/import` `{ "pdb_id": "1M17", "name": "..." }`
- `POST /proteins/paste` `{ "name": "...", "pdb_text": "ATOM ...\n" }`

## テスト
```bash
cd backend
uv run --extra test pytest
```


## ドッキングロジック（Logic）
**実際のAutoDock Vinaを使用した分子ドッキング計算**を実行しています。
- **ファイル**: `worker/app/pipeline.py`
- **エンジン**: AutoDock Vina（サブプロセス経由で実行）
- **分子準備**: RDKit（3D構造生成・最適化） + Meeko（PDBQT変換）
- **処理フロー**:
  1. SMILES/Molfile → RDKitで3D構造生成
  2. MeekoでPDBQT形式に変換
  3. Vinaでドッキング計算（プリセットに応じて exhaustiveness / num_poses）
  4. 結果のスコア・ポーズを保存

## MVP版の制限事項
現在の実装には以下の制限があります:
- 認証・認可機能なし（誰でもアクセス可能）
- タンパク質ライブラリは 11 件（Kinase/GPCR/Protease/Nuclear receptor）。PDB インポート/貼り付けで追加可能
- 3DビューアとInteraction Mapは簡易表示（距離ベースの近接解析）

本番運用には追加の実装が必要です。詳細は[AGENTS.md](AGENTS.md)を参照してください。

## 開発用DB/Redis直接アクセス
開発時にDB/Redisへ直接アクセスしたい場合は、`docker-compose.yml`に以下を追加:
```yaml
  db:
    ports:
      - "5432:5432"  # 開発用のみ
  broker:
    ports:
      - "6379:6379"  # 開発用のみ
```
