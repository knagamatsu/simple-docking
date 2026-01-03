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
ドッキング本体はMVPとして軽量なスタブ実装です。Vina/P2Rank等の実装ポイントは `worker/app/pipeline.py` に用意しています。
