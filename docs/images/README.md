# スクリーンショットディレクトリ

このディレクトリには、ユーザーマニュアル用のスクリーンショットを配置します。

## 必要なスクリーンショット

USER_GUIDE.md で参照されている画像：

### 必須

1. **dashboard.png** - ダッシュボード画面
   - 実行履歴一覧
   - フィルターチップ
   - 新規実行ボタン

2. **input.png** - リガンド入力画面
   - SMILES 入力フォーム
   - Ketcher エディタ
   - 入力例

3. **targets.png** - ターゲット選択画面
   - 5つのキナーゼカード
   - 詳細情報表示

4. **settings.png** - 設定画面
   - プリセット選択
   - パラメータ表示

5. **results.png** - 結果表示画面
   - ドッキングスコア
   - ダウンロードボタン
   - 進捗表示

## スクリーンショットの撮り方

### 準備

```bash
# システムを起動
./start.sh

# ブラウザで開く
http://localhost:8090/simple-docking
```

### 撮影手順

1. **ブラウザのスクリーンショット機能を使用**:
   - Firefox: Shift+F2 → `screenshot --fullpage`
   - Chrome: DevTools → Cmd/Ctrl+Shift+P → "Capture screenshot"

2. **画像を編集**:
   - 不要な部分をトリミング
   - 重要な要素を強調（赤枠など）
   - PNG 形式で保存

3. **このディレクトリに配置**:
   ```bash
   cp ~/Downloads/screenshot.png docs/images/dashboard.png
   ```

### 推奨設定

- **解像度**: 1920x1080 推奨
- **形式**: PNG
- **ファイルサイズ**: 1MB以下
- **命名規則**: 小文字、ハイフン区切り

## プレースホルダー

現在、USER_GUIDE.md では以下のプレースホルダーを使用しています：

```markdown
![Dashboard Screenshot](./images/dashboard.png)
<!-- TODO: 実際のスクリーンショットを撮影して追加 -->
```

スクリーンショットが追加されるまで、マニュアルは表示されますが画像はリンク切れになります。

## 注意事項

- 個人情報や機密情報が映り込まないようにする
- サンプルデータを使用する
- 画像は Git にコミットする（バイナリファイルだが必要）
