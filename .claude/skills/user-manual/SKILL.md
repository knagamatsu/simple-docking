---
name: user-manual
description: エンドユーザー向けのマニュアル（USER_GUIDE.md）を生成・更新します。「ユーザーマニュアル更新」「マニュアル生成」「ユーザーガイド作成」などのリクエストで使用します。
---

# User Manual Generator Skill

このスキルは、コードベースを分析してエンドユーザー（研究者・化学者）向けのマニュアルを自動生成します。

## 目的

- 技術的でない言葉でシステムを説明
- UI操作手順を明確化
- トラブルシューティング情報を提供
- 研究者が自力で使えるようにする

## 実行タイミング

以下のリクエストで自動適用：
- 「ユーザーマニュアル更新して」
- 「マニュアル生成して」
- 「ユーザーガイド作成して」
- 「USER_GUIDE.md を最新化して」

## 出力先

**`docs/USER_GUIDE.md`** - エンドユーザー向けマニュアル

## マニュアル構成

### 1. はじめに

```markdown
# Simple Docking Dashboard ユーザーガイド

## このガイドについて

このガイドは、Simple Docking Dashboard を使って分子ドッキングを実行する
研究者・化学者のためのマニュアルです。

## Simple Docking Dashboard とは

化合物とタンパク質のドッキング計算を Web ブラウザから簡単に実行できる
ツールです。AutoDock Vina を使用した実計算を行います。

### 主な機能

- SMILES または Molfile 形式での化合物入力
- 複数のキナーゼタンパク質ライブラリ
- 4ステップのシンプルなウィザード
- 結果のダウンロード（PDBQT形式）
- 実行履歴の管理

### 対象ユーザー

- 創薬研究者
- 計算化学者
- 学生（化学・生物学）
```

### 2. インストール

```markdown
## インストール

### 必要な環境

- Docker 20.10 以降
- Docker Compose V2 以降
- ブラウザ（Chrome、Firefox、Safari など）
- OS: Linux（Ubuntu、Fedora など）、macOS

### インストール手順

#### 方法1: 自動インストーラー（推奨）

1. ターミナルを開く
2. 以下のコマンドを実行：

```bash
curl -fsSL https://github.com/USER/REPO/releases/latest/download/simple-docking-installer.sh | bash
```

3. 完了！

#### 方法2: 手動インストール

1. Docker をインストール
   - Ubuntu: `sudo apt install docker.io docker-compose-v2`
   - macOS: Docker Desktop をインストール

2. リポジトリをクローン：

```bash
git clone https://github.com/USER/REPO.git
cd simple-docking
```

3. 起動：

```bash
./start.sh
```

4. ブラウザで開く：
   - http://localhost:8090/simple-docking
```

### 3. クイックスタート

```markdown
## クイックスタート

最初のドッキング計算を5分で実行できます。

### ステップ1: 起動

```bash
./start.sh
```

ブラウザで自動的に開きます（または http://localhost:8090/simple-docking にアクセス）。

### ステップ2: 新規実行

1. 「新規実行」ボタンをクリック
2. リガンド入力（SMILES）: `CC(=O)OC1=CC=CC=C1C(=O)O`（アスピリン）
3. 名前: `Aspirin Test`
4. 「次へ」をクリック

### ステップ3: ターゲット選択

1. `CDK2 (Cyclin-dependent kinase 2)` を選択
2. 「次へ」をクリック

### ステップ4: 設定

1. プリセット: `Fast`（高速テスト用）
2. 「実行」をクリック

### ステップ5: 結果確認

- 進捗バーが表示されます（1-3分）
- 完了すると、ドッキングスコアが表示されます
- 「ダウンロード」で結果ファイルを取得できます
```

### 4. UI操作ガイド

```markdown
## UI操作ガイド

### ダッシュボード画面

![Dashboard Screenshot](./images/dashboard.png)

**機能**:
- 実行履歴の一覧表示
- ステータスフィルター（All / Pending / Running / Succeeded / Failed）
- 各実行の詳細へのリンク

**操作**:
- 「新規実行」: 新しいドッキング計算を開始
- ステータスチップをクリック: 表示をフィルター
- Run ID をクリック: 詳細ページへ

---

### リガンド入力画面（ステップ1）

![Input Screenshot](./images/input.png)

**入力方法**:

1. **SMILES 入力**:
   - SMILES文字列を入力
   - 例: `CC(=O)OC1=CC=CC=C1C(=O)O`（アスピリン）

2. **Molfile 入力**:
   - Molfile（V2000/V3000）をペースト
   - ChemDraw や MarvinSketch からコピー可能

3. **Ketcher エディタ**（オプション）:
   - グラフィカルな分子描画
   - 2D エディタで構造を作成

**制限**:
- SMILES: 最大1000文字
- Molfile: 最大100KB

---

### ターゲット選択画面（ステップ2）

![Targets Screenshot](./images/targets.png)

**利用可能なタンパク質**:

| タンパク質 | PDB ID | 説明 |
|-----------|--------|------|
| CDK2 | 1M17 | 細胞周期調節、がん標的 |
| EGFR | 4I23 | 上皮成長因子受容体 |
| Src | 2SRC | がん原遺伝子 |
| PKA | 1ATP | シグナル伝達 |
| ABL | 1IEP | 白血病標的（Gleevec） |

**操作**:
- タンパク質をクリックして選択
- 詳細情報（PDB ID、説明）を確認
- 「次へ」で設定画面へ

---

### 設定画面（ステップ3）

![Settings Screenshot](./images/settings.png)

**プリセット**:

| プリセット | コンフォマー数 | Exhaustiveness | ポーズ数 | 実行時間 |
|-----------|--------------|----------------|---------|---------|
| Fast | 5 | 4 | 5 | 1-3分 |
| Balanced | 15 | 8 | 10 | 3-10分 |
| Thorough | 30 | 16 | 20 | 10-30分 |

**推奨**:
- テスト: `Fast`
- 通常の計算: `Balanced`
- 詳細解析: `Thorough`

---

### 結果画面（ステップ4）

![Results Screenshot](./images/results.png)

**表示内容**:
- 実行ステータス（Pending / Running / Completed）
- ドッキングスコア（kcal/mol）
- 各コンフォマーの結果

**操作**:
- 「結果をダウンロード」: ZIP形式で全結果を取得
- 個別ダウンロード: 特定のポーズをダウンロード
- 「Dashboard」: ダッシュボードに戻る
```

### 5. 使用例

```markdown
## 使用例

### 例1: 既知の阻害剤をテスト

**目的**: Gleevec（イマチニブ）と ABL の結合を確認

1. SMILES: `CN1CCN(CC1)CC2=CC=C(C=C2)C(=O)NC3=CC(=C(C=C3)NC4=NC=CC(=N4)C5=CN=CC=C5)C(F)(F)F`
2. ターゲット: ABL (1IEP)
3. プリセット: Balanced
4. 結果: スコア約 -9.5 kcal/mol（良好な結合）

---

### 例2: 複数のターゲットでスクリーニング

**目的**: 新規化合物を5つのキナーゼでテスト

1. 同じSMILESで5回実行（各キナーゼ）
2. ダッシュボードで結果を比較
3. 最良のスコアを特定

---

### 例3: バッチ処理

**API経由**（スクリプト）:

```bash
# ligands.txt に SMILES リスト

while read smiles; do
  curl -X POST http://localhost:8090/simple-docking/api/ligands \
    -H "Content-Type: application/json" \
    -d "{\"smiles\": \"$smiles\"}"
done < ligands.txt
```
```

### 6. トラブルシューティング

```markdown
## トラブルシューティング

### 起動できない

**症状**: `./start.sh` がエラーになる

**対処法**:
1. Docker が起動しているか確認:
   ```bash
   docker ps
   ```

2. Docker Compose がインストールされているか:
   ```bash
   docker compose version
   ```

3. 権限エラーの場合:
   ```bash
   sudo usermod -aG docker $USER
   newgrp docker
   ```

---

### ブラウザに表示されない

**症状**: http://localhost:8090/simple-docking が開けない

**対処法**:
1. サービスが起動しているか確認:
   ```bash
   docker compose ps
   ```

2. ログを確認:
   ```bash
   docker compose logs gateway
   ```

3. ポート8090が使用中でないか:
   ```bash
   sudo lsof -i :8090
   ```

---

### ドッキングが失敗する

**症状**: ステータスが "FAILED" になる

**原因と対処**:

| 原因 | 対処法 |
|------|--------|
| 無効なSMILES | SMILES文字列を確認 |
| 分子が大きすぎる | より小さい分子でテスト |
| PDBQT変換エラー | Workerログを確認 |

**ログ確認**:
```bash
docker compose logs worker
```

---

### 結果がダウンロードできない

**症状**: 「ダウンロード」ボタンが機能しない

**対処法**:
1. 計算が完了しているか確認（ステータス: Completed）
2. ブラウザのポップアップブロックを無効化
3. 別のブラウザで試す
```

### 7. FAQ

```markdown
## よくある質問（FAQ）

### Q1: SMILES と Molfile の違いは？

**A**:
- **SMILES**: 文字列形式（簡潔、PubChem等から取得可能）
- **Molfile**: 座標情報を含む（ChemDrawから出力）

どちらでも同じ結果が得られます。

---

### Q2: ドッキングスコアの意味は？

**A**:
- 単位: kcal/mol
- 値が小さい（マイナスが大きい）ほど結合が強い
- 目安:
  - -7.0以下: 良好な結合
  - -9.0以下: 非常に強い結合
  - -5.0以上: 弱い結合

---

### Q3: 自分のタンパク質を追加できる？

**A**:
現在のバージョンでは、プリセットの5つのキナーゼのみ対応。
カスタムタンパク質の追加は開発中です（`docs/roadmap.md` 参照）。

---

### Q4: 結果ファイルの使い方は？

**A**:
ダウンロードしたPDBQTファイルは以下で可視化できます：
- PyMOL
- Chimera
- AutoDockTools

---

### Q5: 並列実行は可能？

**A**:
はい。複数のドッキング計算を同時に実行できます。
Workerが自動的にキューを処理します。

---

### Q6: 認証は必要？

**A**:
現在のバージョンでは不要です（MVP）。
将来のバージョンでユーザー認証を追加予定。

---

### Q7: コマンドラインから実行できる？

**A**:
はい、API経由で可能です：

```bash
# リガンド作成
curl -X POST http://localhost:8090/simple-docking/api/ligands \
  -H "Content-Type: application/json" \
  -d '{"smiles": "...", "name": "..."}'

# 実行作成
curl -X POST http://localhost:8090/simple-docking/api/runs \
  -H "Content-Type: application/json" \
  -d '{"ligand_id": 1, "protein_id": "prot_cdk2", "preset": "fast"}'
```

詳細: `docs/architecture.md`
```

### 8. 用語集

```markdown
## 用語集

### ドッキング関連

**分子ドッキング (Molecular Docking)**
化合物とタンパク質の結合様式を予測する計算手法。

**リガンド (Ligand)**
タンパク質に結合する小分子（化合物）。

**レセプター (Receptor)**
リガンドが結合するタンパク質。

**ドッキングスコア (Docking Score)**
結合の強さを表す数値（kcal/mol）。小さいほど結合が強い。

**ポーズ (Pose)**
リガンドとタンパク質の結合構造。

**コンフォマー (Conformer)**
分子の立体配座（異なる3D構造）。

---

### ファイル形式

**SMILES**
分子を文字列で表現する形式。例: `CC(=O)O`（酢酸）

**Molfile**
分子構造を座標付きで記述するファイル形式。

**PDBQT**
AutoDock Vina用のタンパク質・リガンドファイル形式。

**PDB**
タンパク質データバンクの構造ファイル形式。

---

### タンパク質関連

**キナーゼ (Kinase)**
リン酸化反応を触媒する酵素ファミリー。創薬の重要ターゲット。

**結合サイト (Binding Site)**
リガンドが結合するタンパク質の部位。

**ポケット (Pocket)**
結合サイトの凹み（ポケット状の空間）。

---

### 計算パラメータ

**Exhaustiveness**
Vinaの探索精度パラメータ。大きいほど精密だが遅い。

**プリセット (Preset)**
計算設定の組み合わせ（Fast / Balanced / Thorough）。
```

## 分析対象ファイル

マニュアル生成時に以下を確認：

1. **UI関連**:
   - `frontend/src/pages/*.jsx` - 画面構成
   - `frontend/src/components/*.jsx` - コンポーネント

2. **機能情報**:
   - `README.md` - 概要と機能
   - `backend/app/main.py` - APIエンドポイント
   - `protein_library/manifest.json` - タンパク質リスト

3. **設定情報**:
   - `docker-compose.yml` - サービス構成
   - `start.sh` - 起動手順

4. **既存ドキュメント**:
   - `docs/architecture.md`
   - `docs/deploy.md`
   - `VERIFICATION.md`

## 出力フォーマット

- **対象読者**: 非技術者（研究者）
- **言語**: 日本語（コマンド例は英語）
- **トーン**: フレンドリー、教育的
- **構成**: 階層的、検索しやすい

## スクリーンショット対応

実際のスクリーンショットが追加されるまで、以下のプレースホルダーを使用：

```markdown
![Dashboard Screenshot](./images/dashboard.png)
<!-- TODO: 実際のスクリーンショットを撮影して追加 -->
```

## 自動更新トリガー

以下の変更時にマニュアル更新を提案：
- UI画面の追加・変更
- 新機能の追加
- タンパク質ライブラリの更新
- API エンドポイントの変更

## 検証チェックリスト

生成後、以下を確認：
- [ ] すべてのセクションが存在する
- [ ] コマンド例が正しい
- [ ] URL/ポート番号が最新
- [ ] 用語が一貫している
- [ ] スクリーンショットプレースホルダーが配置されている
