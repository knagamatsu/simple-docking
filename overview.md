| 文書タイトル    | 化学研究者向け「プリセット標的への簡易ドッキング評価」ダッシュボード実装 指示書（背景〜設計〜実装手順〜受入基準）                                                                           |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 想定読者      | 実装担当AI / 開発者（フルスタック＋計算ジョブ実装ができる前提）                                                                                                  |
| 目的        | 合成した化合物（ユーザー入力）を、用意された代表的タンパク質プリセットに対して**手間なく**ドッキング評価し、**仮説生成（用途候補の当たり付け）**を支援する                                                   |
| ゴール（必須）   | ① Ubuntu上で動作 ② `git clone` → `docker compose up --build` で起動 ③ ブラウザで「入力→標的→設定→結果」を4画面で操作 ④ 1化合物×複数タンパクをキューで並列実行 ⑤ 結果をランキング＋3D可視化で提示 |
| ゴール（推奨）   | ⑥ 自動ポケット探索（ユーザーに選ばせない） ⑦ 進捗が分かるダッシュボード（Run単位で全体%・各タスク状態） ⑧ 結果のCSV/SD出力                                                              |
| 非ゴール（明確化） | 実験・臨床の代替、結合確定、ADMET予測、QSAR、規制物質判定などは対象外（出力は「仮説」前提）                                                                                  |
| 重要方針      | UIは“簡単”を最優先。専門設定（ポケット/ボックス/詳細パラメータ）は**Advancedに隔離**し、既定は安全側で自動化する                                                                   |

---

| 要件カテゴリ   | 要件（実装に落とす表現）                             | 受入条件（テスト可能な形）                                                     |
| -------- | ---------------------------------------- | ----------------------------------------------------------------- |
| 対象ユーザー   | 計算化学に詳しくない化学研究者                          | 初見で「最短2クリック程度」でRun作成できる（入力→標準セット→実行）                              |
| 実行単位     | Run（親）配下に Task（子）を持つ                     | Run作成時に「(化合物×標的×配座)」のTaskが生成され、キュー投入される                           |
| 入力       | 構造式描画（2D）＋SMILES/Molfile/SDFの代替入力        | どの入力でも同一パイプラインに入り、内部で3D化される                                       |
| 標的       | プリセットタンパク質ライブラリ（前処理済み）                   | UIの標的一覧にメタデータ（名称/カテゴリ/由来）表示、選択可能                                  |
| 設定       | 既定プリセット（Fast/Balanced/Thorough）＋Advanced | 既定のままでも最後まで完走し、結果が閲覧できる                                           |
| ポケット     | 既定：自動推定（ユーザー選択なし）                        | 標的にポケット情報が無い場合でも自動推定→箱生成→完走（失敗時はフォールバック）                          |
| 可視化      | 結果はランキング＋各標的の3D表示                        | 上位標的のポーズをWeb上で回転・ズームして確認できる                                       |
| 進捗       | Run全体%・Task状態・失敗理由の提示                    | 進捗ページで「総数/完了/失敗/処理中」が常に見える                                        |
| 無償利用     | OSS中心で構成（ただしライセンス確認を手順に含める）              | `docs/licenses.md` に依存コンポーネントとライセンスを記載し、ビルドに必要な全てがリポジトリ内または自動取得可能 |
| Ubuntu対応 | Dockerが入った一般的Ubuntuで起動                   | 新規マシンで `docker compose up --build` が通る（外部依存はREADMEに明記）            |

---

| 画面設計（必須4画面＋補助） | 画面名      | 主目的       | UI要素（実装指示）                           | 既定で隠すもの          |
| -------------- | -------- | --------- | ------------------------------------ | ---------------- |
| 1              | 構造式描画    | 入力の最短化    | 構造エディタ埋め込み／SMILES表示／「次へ」             | 互変異性体、pH、配座数     |
| 2              | タンパク質リスト | 迷わせず選ぶ    | カテゴリタブ（例：Kinase/GPCR…）／検索／「標準セット」ボタン | PDB ID、鎖、前処理の詳細  |
| 3              | 設定       | 安全な既定で実行  | Fast/Balanced/Thorough／Advanced折りたたみ | ポケット手動選択、探索箱手動編集 |
| 4              | 結果       | 一目で判断＋深掘り | ランキング表／各標的カード（スコア・正規化・3D）／CSV出力      | 上級者パラメータの再実行UI   |
| 補助             | ダッシュボード  | 進捗と履歴     | Run一覧／フィルタ／状態バッジ／失敗ログ                | なし               |
| 補助             | 管理（任意）   | 標的ライブラリ追加 | タンパク追加（manifestアップロード）／前処理ジョブ投入      | 一般ユーザーには非表示      |

---

| 推奨アーキテクチャ       | 概要                             | 採用理由                          | コンポーネント                                                          |
| --------------- | ------------------------------ | ----------------------------- | ---------------------------------------------------------------- |
| 分離構成（Web＋非同期計算） | フロントはUI、APIは状態管理、計算はWorkerに分離  | ドッキングは重い＆失敗しやすいので、UIと切り離して堅牢化 | `frontend` / `api` / `worker` / `broker` / `db` / `object_store` |
| オブジェクト保存        | PDBQTやポーズ等の大きいファイルはDBでなくファイル保存 | DB肥大を防止、再計算やDLに強い             | ローカルvolume（将来MinIOへ差替可）                                          |
| キュー             | Taskを並列化してスループットを上げる           | 1化合物×多標的の要件に直結                | Celery/RQ等                                                       |
| ポケット自動化         | ライブラリ作成時にポケット情報を持つ／無ければ自動推定    | 非専門家が迷わない                     | P2Rank等（Java）＋フォールバック                                            |

---

| 技術スタック（実装指示：推奨） | 役割                | 推奨                         | 代替            | 注意点（必ず実装に反映）                            |
| --------------- | ----------------- | -------------------------- | ------------- | --------------------------------------- |
| フロント            | 4画面UI＋3Dビュー       | React（Vite or Next.js）     | Vue等          | ステッパー/進捗/カードUIを作りやすい構成にする               |
| 構造描画            | 2D→Molfile/SMILES | Ketcher等のWebエディタ           | 任意            | 出力は必ずSMILESとMolfileの両方をAPIへ送れるようにする     |
| 3D化             | 配座生成/正規化          | RDKit                      | OpenBabel     | 入力が壊れていても落とさず、エラーをUIへ返す                 |
| API             | Run/Task管理        | FastAPI                    | Flask等        | OpenAPI（Swagger）を有効化し、他AIが叩いて動作確認しやすくする |
| Worker          | ドッキング・解析          | Python worker + subprocess |               | 実行ログ・タイムアウト・リトライ・キャンセルを実装               |
| Docking         | ドッキング本体           | Vina系                      | Smina等        | まずはCPU前提で成立させる                          |
| 前処理             | PDBQT化            | Meeko等                     |               | ライセンス確認（配布形態で影響する可能性）をdocsに記載           |
| ポケット            | 自動ポケット推定          | P2Rank等                    | fpocket等      | Java(OpenJDK)をDockerに同梱、失敗時フォールバックを必ず用意 |
| DB              | 状態管理              | PostgreSQL                 | SQLite（MVPのみ） | 本番相当はPostgres推奨（並列/永続）                  |
| Broker          | キュー               | Valkey/Redis互換             | RabbitMQ      | “1composeで完結”すること                       |

---

| リポジトリ構成（実装指示：この通りに作る） | パス                     | 内容                    | 実装メモ                                 |
| --------------------- | ---------------------- | --------------------- | ------------------------------------ |
| ルート                   | `docker-compose.yml`   | 全サービス起動               | `docker compose up --build` で起動できること |
| ルート                   | `.env.example`         | 環境変数テンプレ              | 例：DB/BROKER/パス/タイムアウト                |
| ルート                   | `README.md`            | 起動手順・使い方              | “新規Ubuntuで通る”手順を最小に                  |
| ルート                   | `docs/architecture.md` | 設計図（簡潔）               | 他AIが全体像を掴める                          |
| ルート                   | `docs/licenses.md`     | 依存ライセンス表              | 依存追加時に必ず更新                           |
| ルート                   | `protein_library/`     | 前処理済タンパク資産            | コンテナvolumeで参照                        |
| ルート                   | `data/object_store/`   | 実行成果物                 | ligand/receptor/poses/logs を保存       |
| `backend/`            | API実装                  | FastAPI + ORM         | `GET /health` 必須                     |
| `worker/`             | Worker実装               | Celery + pipelines    | タスクの状態更新をDBへ                         |
| `frontend/`           | UI実装                   | 4画面＋履歴                | APIベースURLはenvから                      |
| `scripts/`            | 管理者ツール                 | import/build baseline | 例：タンパク追加、ベースライン生成                    |

---

| docker-compose.yml（雛形：実装担当AIはこの方針で作成） | 内容（例） |
| ------------------------------------- | ----- |
| <pre><code>services:                  |       |
| db:                                   |       |

```
image: postgres:16
environment:
  POSTGRES_DB: docking
  POSTGRES_USER: docking
  POSTGRES_PASSWORD: docking
volumes:
  - ./data/postgres:/var/lib/postgresql/data
ports: ["5432:5432"]
```

broker:
image: valkey/valkey:7
ports: ["6379:6379"]

api:
build: ./backend
environment:
DATABASE_URL: postgresql+psycopg://docking:docking@db:5432/docking
BROKER_URL: redis://broker:6379/0
OBJECT_STORE_PATH: /data/object_store
PROTEIN_LIBRARY_PATH: /protein_library
volumes:
- ./data/object_store:/data/object_store
- ./protein_library:/protein_library
depends_on: [db, broker]
ports: ["8000:8000"]

worker:
build: ./worker
environment:
DATABASE_URL: postgresql+psycopg://docking:docking@db:5432/docking
BROKER_URL: redis://broker:6379/0
OBJECT_STORE_PATH: /data/object_store
PROTEIN_LIBRARY_PATH: /protein_library
volumes:
- ./data/object_store:/data/object_store
- ./protein_library:/protein_library
depends_on: [db, broker]

frontend:
build: ./frontend
environment:
VITE_API_BASE: [http://localhost:8000](http://localhost:8000)
ports: ["3000:3000"]
depends_on: [api] </code></pre> |

---

| データモデル（DBスキーマ：実装指示） | テーブル                | カラム（例）                                                                                                                      | 備考                                         |
| ------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 化合物                 | `ligands`           | `id, created_at, name, input_type, smiles, molfile, status, error`                                                          | status: `READY/FAILED`                     |
| 配座                  | `ligand_conformers` | `id, ligand_id, idx, pdb_path, pdbqt_path, status`                                                                          | idxで複数配座                                   |
| タンパク                | `proteins`          | `id, name, category, organism, source_id, receptor_pdbqt_path, receptor_meta_json, default_box_json, pocket_method, status` | `default_box_json={center,size}`           |
| 実行（親）               | `runs`              | `id, created_at, ligand_id, preset, options_json, status, total_tasks, done_tasks, failed_tasks`                            | UIの進捗表示の核                                  |
| タスク（子）              | `tasks`             | `id, run_id, protein_id, conformer_id, status, started_at, finished_at, attempts, error, log_path`                          | status: `PENDING/RUNNING/SUCCEEDED/FAILED` |
| 結果                  | `results`           | `id, task_id, best_score, pose_paths_json, metrics_json`                                                                    | pose_pathsに複数ポーズ                           |
| 正規化（推奨）             | `protein_baselines` | `protein_id, method, quantiles_json, mean, std, updated_at`                                                                 | percentile算出に使用                            |

---

| API仕様（最小：実装担当AIはこの通りに実装） | エンドポイント                        | 入力                                             | 出力                                                 | UIでの用途       |       |
| ------------------------ | ------------------------------ | ---------------------------------------------- | -------------------------------------------------- | ------------ | ----- |
| Health                   | `GET /health`                  | なし                                             | `{ok:true}`                                        | 起動確認         |       |
| 化合物登録                    | `POST /ligands`                | `{name?, smiles?, molfile?}`                   | `{ligand_id, status}`                              | 画面1→次へ       |       |
| 化合物3D化状態                 | `GET /ligands/{id}`            | なし                                             | ligand詳細                                           | 入力エラー表示      |       |
| タンパク一覧                   | `GET /proteins?category=&q=`   | なし                                             | `proteins[]`                                       | 画面2          |       |
| Run作成                    | `POST /runs`                   | `{ligand_id, protein_ids[], preset, options?}` | `{run_id}`                                         | 画面3→実行       |       |
| Run進捗                    | `GET /runs/{id}/status`        | なし                                             | `{status, total, done, failed, running[], eta?なし}` | ダッシュボード/結果画面 |       |
| Run結果                    | `GET /runs/{id}/results`       | なし                                             | `ranking[], per_protein[]`                         | 画面4          |       |
| Task詳細                   | `GET /tasks/{id}`              | なし                                             | task詳細＋logリンク                                      | 失敗理由表示       |       |
| 成果物DL                    | `GET /runs/{id}/export?fmt=csv | sdf`                                           | なし                                                 | file         | 共有・記録 |

---

| Workerパイプライン（必須：処理順と責務を固定） | ステップ          | 入力                                  | 出力                      | 失敗時の扱い                     |
| -------------------------- | ------------- | ----------------------------------- | ----------------------- | -------------------------- |
| 1                          | 入力検証/正規化      | SMILES/Molfile                      | RDKit Mol               | 失敗→ligand.status=FAILED＋理由 |
| 2                          | 3D配座生成        | RDKit Mol                           | conformers（N個）          | 失敗→ligand FAILED           |
| 3                          | リガンドPDBQT化    | conformer                           | ligand.pdbqt            | 失敗→該当task FAILED（他は継続）     |
| 4                          | 受容体取得         | protein_library                     | receptor.pdbqt          | 無い→task FAILED（管理者に追加促す）   |
| 5                          | ボックス決定（既定は自動） | receptor情報                          | `{center,size}`         | 自動失敗→フォールバック（粗い全域or固定箱）    |
| 6                          | ドッキング実行       | ligand.pdbqt + receptor.pdbqt + box | poses + scores          | タイムアウト→リトライ→FAILED         |
| 7                          | 結果整形          | poses                               | best_score + pose_paths | 保存失敗→FAILED                |
| 8                          | 正規化（推奨）       | best_score + baseline               | percentile等             | baseline無→生スコアのみ表示         |
| 9                          | 可視化データ生成      | receptor + pose                     | viewer用ファイル             | 失敗しても結果自体は表示可能（UIは簡易表示）    |

---

| 自動ポケット（ユーザー非選択）実装ルール | 優先順位        | 条件                              | 実装指示                                            |
| -------------------- | ----------- | ------------------------------- | ----------------------------------------------- |
| 1                    | ライブラリ既定ボックス | `proteins.default_box_json` が存在 | それを必ず使用（最速・安定）                                  |
| 2                    | 自動ポケット推定    | 既定ボックスが無い                       | P2Rank等をworker側で実行→上位1件を採用→固定size箱生成            |
| 3                    | フォールバック     | 自動推定が失敗/出力0                     | 受容体全体のバウンディングボックスから粗い箱を作る（ただしサイズ上限を設ける）         |
| UI露出                 | 既定          | 常に隠す                            | Advanced optionsでのみ「手動箱」をONにできるが、一般ユーザーの導線に置かない |

---

| プリセット（Fast/Balanced/Thorough）実装指示 | プリセット   | 代表パラメータ（例）                                           | 意図                                 |
| --------------------------------- | ------- | ---------------------------------------------------- | ---------------------------------- |
| Fast                              | 配座少/探索弱 | `num_conformers=5, exhaustiveness=4, num_poses=5`    | まず当たり付け                            |
| Balanced                          | 標準      | `num_conformers=15, exhaustiveness=8, num_poses=10`  | 日常運用の既定                            |
| Thorough                          | 重め      | `num_conformers=30, exhaustiveness=16, num_poses=20` | 精査（ただしUIは「遅くなる可能性」を表示するが時間見積は出さない） |
| Advanced options                  | 折りたたみ   | `pH/tautomer列挙/box手動/seed固定/timeout`                 | 既定は触らせない                           |

---

| 結果表示（分かりやすさ最優先の指示） | 表示要素              | ルール                                            | UI配置         |
| ------------------ | ----------------- | ---------------------------------------------- | ------------ |
| ランキング              | 上位タンパクの並び         | 既定は「best_scoreの昇順」＋（あれば）percentile             | 画面4の最上段      |
| 注意書き               | 仮説生成である旨          | 常時表示（小さく固定）                                    | 画面4のヘッダ付近    |
| タンパクカード            | タンパクごとの詳細         | `score` / `percentile` / `pose数` / `状態（成功/失敗）` | ランキング下       |
| 3Dビュー              | receptor + pose表示 | 上位1件は自動で表示、切替可能                                | カード内 or 右ペイン |
| 失敗の見せ方             | 失敗も一覧に残す          | 「失敗理由（短文）」＋「ログを見る」                             | ダッシュボード＋画面4  |
| エクスポート             | CSV/SDF           | Run単位で一括                                       | 画面4の右上       |

---

| ダッシュボード（進捗が一目で分かる）実装指示 | 機能                                           | 実装内容                                   |
| ---------------------- | -------------------------------------------- | -------------------------------------- |
| Run一覧                  | `created_at`降順、検索、状態フィルタ                     | `/runs?status=` を追加しても良い               |
| Run詳細                  | 全体%（done/total）、失敗数、処理中標的                    | `GET /runs/{id}/status` をポーリング（例：2〜5秒） |
| タスク一覧                  | protein別に `PENDING/RUNNING/SUCCEEDED/FAILED` | 失敗は短文＋ログリンク                            |
| ログ                     | taskごとのstdout/stderrを保存                      | `object_store/logs/{task_id}.txt`      |

---

| 実装手順（開発の順番：この順に作る） | ステップ             | 具体作業                                     | 完了条件                                |
| ------------------ | ---------------- | ---------------------------------------- | ----------------------------------- |
| 1                  | スケルトン作成          | monorepo生成、compose雛形、`/health`           | `docker compose up --build` でAPIが応答 |
| 2                  | DB/ORM           | 上記テーブルの最小実装（runs/tasks/proteins/ligands） | migration適用で起動                      |
| 3                  | UI骨格             | 4画面のルーティング＋ステッパー                         | ダミーデータで画面遷移可                        |
| 4                  | 化合物入力→登録         | エディタ→APIへ送信→ligand作成                     | 入力が保存され、エラーが表示される                   |
| 5                  | Run作成→Task生成     | protein_idsからtask直積生成してenqueue           | runのtotal_tasksが正しく出る               |
| 6                  | Worker最小（1タスク完走） | ligand3D→pdbqt→vina→結果保存                 | 1標的で結果が見える                          |
| 7                  | 複数標的並列           | workerをスケールして並列化（同一compose）              | 複数proteinが同時に進む                     |
| 8                  | 進捗UI             | run statusをポーリングしバー表示                    | 全体%と状態が一致                           |
| 9                  | 自動ポケット           | default_box→自動推定→フォールバック                 | 既定でユーザー入力なし完走                       |
| 10                 | 可視化              | 3D viewerでpose表示                         | 上位poseがブラウザで見える                     |
| 11                 | エクスポート           | CSV/SDF出力                                | DLでき、内容が正しい                         |
| 12                 | docs整備           | README/architecture/licenses             | 第三者がclone→起動→実行できる                  |

---

| 管理者向け：タンパク質ライブラリ形式（manifest方式を必須化） | ファイル         | 例 | 説明 |
| ---------------------------------- | ------------ | - | -- |
| `protein_library/manifest.json`    | <pre><code>[ |   |    |
| {                                  |              |   |    |

```
"id": "prot_001",
"name": "Example Kinase A",
"category": "Kinase",
"organism": "Homo sapiens",
"source_id": "PDB:XXXX",
"receptor_pdbqt": "receptors/prot_001/receptor.pdbqt",
"default_box": {"center":[0,0,0], "size":[22,22,22]},
"notes": "preprocessed"
```

}
] </code></pre> | UI表示・処理に必要な最小メタデータ。`default_box`が無い場合は自動ポケットへ |
| `scripts/import_proteins.py` |  | manifestをDBへ投入 | 追加・更新をidで追跡 |
| 資産配置 |  | `protein_library/receptors/<id>/receptor.pdbqt` | workerが参照できるパスに固定 |

---

| 計算資源・安定稼働（落ちないための必須仕様） | 項目                     | 実装指示                                         |
| ---------------------- | ---------------------- | -------------------------------------------- |
| タイムアウト                 | docking/ポケット推定/変換ごとに上限 | タスクごとにtimeoutを設定し、超過はFAILED＋ログ保存             |
| リトライ                   | 一時失敗（I/O等）は再試行         | `max_retries=2`程度、同じ入力で再現する失敗は打ち切り           |
| 隔離                     | 外部コマンドはsubprocessで隔離   | 標準出力/エラーをログ保存                                |
| 入力サニタイズ                | SMILES/Molfileの異常を想定   | “落とさずに説明付きで返す”                               |
| 同時実行                   | workerスケールで増やす         | `docker compose up --scale worker=4` で並列化可能に |
| ディスク管理                 | object_store肥大対策       | Run単位のクリーンアップ（任意）を管理画面に用意しても良い               |

---

| セキュリティ（最低限） | 項目              | 実装指示                                        |
| ----------- | --------------- | ------------------------------------------- |
| 認証          | MVPはローカル限定なら省略可 | 将来のためにユーザー概念を入れるなら `users/runs.user_id` を追加 |
| 任意コード実行対策   | 外部入力をコマンドに直結しない | ファイル名はuuid化、shell=True禁止                    |
| ファイルDL      | パス・トラバーサル防止     | object_storeはidベースで解決し、任意パスを受けない            |
| リソース枯渇      | 大量投入を抑制         | 1Runの上限（標的数/配座数）をサーバ側で制限                    |

---

| ライセンス/無料要件（実装担当AIへの指示） | 指示                            | 実装作業                                    |
| ---------------------- | ----------------------------- | --------------------------------------- |
| 依存の棚卸                  | 依存追加の度に `docs/licenses.md` 更新 | パッケージ名/用途/リンク/ライセンス/注意点（配布条件）を記録        |
| バージョン固定                | “動く組合せ”を固定                    | Dockerfile内でバージョンをpin（RDKit/Vina/Java等） |
| オプション分離                | もし強いコピーレフトが入るなら機能を分離          | 例：相互作用解析などは別コンテナにして既定OFF                |

---

| 受入テスト（最低限このチェックを通す） | テスト              | 手順          | 合格条件                      |
| ------------------- | ---------------- | ----------- | ------------------------- |
| 起動                  | clone→compose up | 新規Ubuntuで実施 | エラー無くUI/APIが起動            |
| 単一標的                | 1化合物×1標的         | 既定設定でRun    | 結果画面にスコアとポーズ表示            |
| 複数標的                | 1化合物×N標的         | 標準セットでRun   | 進捗が更新され、ランキングが出る          |
| 失敗耐性                | わざと壊れた入力         | 不正SMILES等   | UIに説明が出て、サーバが落ちない         |
| 自動ポケット              | box無し標的          | 自動推定経由      | 完走 or フォールバックで完走し、失敗理由が明確 |
| Export              | CSV/SDF          | 画面4からDL     | 内容がRunと一致                 |

---

| 納品物（他AIへの依頼成果として要求するもの） | 納品物                              | 完成条件                            |
| ----------------------- | -------------------------------- | ------------------------------- |
| リポジトリ                   | 上記構成のmonorepo                    | `docker compose up --build` で起動 |
| サンプル                    | 最低1つ以上の標的エントリ                    | 初回起動後すぐ試せる                      |
| ドキュメント                  | README + architecture + licenses | 第三者が再現できる                       |
| テスト                     | 最低限のAPIテスト（health/run作成）         | CIなしでもローカルで実行可                  |
| 画面                      | 4画面＋Run履歴                        | 進捗と結果が視覚的に分かる                   |

---

| 補足（実装担当AIへの注意喚起） | 内容                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------- |
| 数値の解釈            | タンパク質間でスコアを“同一物差し”として扱うのは危険なので、MVPは「ランキング＝仮説」として提示し、将来の正規化（percentile等）は拡張で実装できる構造にする |
| UXの最優先事項         | 「迷わない」「落ちない」「進捗が見える」— 設定を増やすより、既定の成功率と可視化を優先する                                        |
| 拡張性              | 最初から `Run(親)→Task(子)` を堅牢に設計しておけば、複数化合物×複数標的へ自然に拡張できる（Task直積生成）                       |
