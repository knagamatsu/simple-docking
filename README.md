# Simple Docking Dashboard

化学者向けの簡易ドッキング評価ダッシュボードです。入力 → 標的 → 設定 → 結果の4ステップで操作できます。

## 起動（Ubuntu）
1. Docker / Docker Compose をインストール
2. リポジトリを取得して起動
   ```bash
   docker compose up --build
   ```
3. ブラウザで UI を開く  
   - http://localhost:3001

## 構成
- `frontend/`: React UI（4画面＋ダッシュボード）
- `backend/`: FastAPI API（Run/Task/Ligand/Protein 管理）
- `worker/`: Celery worker（ドッキングパイプライン）
- `protein_library/`: タンパク質ライブラリ＋manifest
- `data/object_store/`: 生成成果物（ポーズ/ログなど）

## API
- API: `http://localhost:8000`
- OpenAPI: `http://localhost:8000/docs`

## 依存関係
`uv` を使って Python 依存を固定しています（`uv.lock` 参照）。

## タンパク質ライブラリの更新
`protein_library/manifest.json` を更新した場合はインポートを実行してください。
```bash
PYTHONPATH=. python scripts/import_proteins.py
```

## テスト
```bash
cd backend
uv run --extra test pytest
```

## 補足

## 画面操作（Navigation）
- **メイン画面へ戻る**: 画面右上の「Dashboard」リンクをクリックすると、過去の実行履歴一覧（ダッシュボード）に戻れます。
- **新規実行**: ダッシュボードまたはルート（`/`）からウィザード形式で新しいドッキングを開始できます。

## ドッキングロジック（Logic）
現在のMVP版では、実際の物理計算（Vina/P2Rank等）の代わりに**決定論的なモック（擬似）ロジック**を使用しています。
- **ファイル**: `worker/app/pipeline.py`
- **関数**: `compute_mock_score`
- **仕組み**: タスクID、リガンドID、タンパク質IDの組み合わせからハッシュ値を生成し、それをスコア（例: -9.xx kcal/mol）として返します。
    - これにより、同じ入力に対しては常に同じ結果が返ります。
    - 計算負荷がかからないため、即座に結果を確認できます。
    - 将来的にはこの関数を実際のドッキングソフトウェア（AutoDock Vinaなど）の呼び出しに置き換える設計になっています。

