---
name: api-endpoint
description: バックエンドに新しいAPIエンドポイントを追加します。「APIエンドポイント追加」「新しいエンドポイント」「REST API作成」などのリクエストで使用します。
---

# API Endpoint 追加スキル

このスキルは、Simple Docking Dashboard バックエンドに新しい API エンドポイントを追加する際の手順とパターンを定義します。

## 目的

- コードベース探索を最小化
- プロジェクト固有のパターンを適用
- 見落としを防止（ログ、エラー処理、レート制限など）

## このプロジェクトのファイル構成

```
backend/app/
├── main.py          ← エンドポイント定義（ここに追加）
├── models.py        ← SQLAlchemy モデル
├── schemas.py       ← Pydantic スキーマ（リクエスト/レスポンス）
├── tasks.py         ← Celery タスク
├── db.py            ← データベース設定
└── tests/
    └── test_*.py    ← pytest テスト
```

## エンドポイント追加の標準フロー

### 1. スキーマ定義（必要な場合）

`backend/app/schemas.py` に Pydantic モデルを追加：

```python
# リクエストスキーマ
class ResourceCreate(BaseModel):
    name: str
    value: int

# レスポンススキーマ
class ResourceOut(BaseModel):
    id: int
    name: str
    value: int
    created_at: datetime

    class Config:
        from_attributes = True  # SQLAlchemy モデルから変換
```

### 2. エンドポイント実装

`backend/app/main.py` の `create_app()` 関数内に追加：

#### GETエンドポイントのテンプレート

```python
@app.get("/resources/{resource_id}", response_model=ResourceOut)
@limiter.limit(f"{settings.rate_limit_per_minute}/minute")
def get_resource(
    request: Request,
    resource_id: int,
    session: Session = Depends(get_session)
):
    logger.info(f"Fetching resource {resource_id}")

    resource = session.query(Resource).filter(Resource.id == resource_id).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")

    return resource
```

#### POSTエンドポイントのテンプレート

```python
@app.post("/resources", response_model=ResourceOut)
@limiter.limit(f"{settings.rate_limit_per_minute}/minute")
def create_resource(
    request: Request,
    payload: ResourceCreate,
    session: Session = Depends(get_session)
):
    logger.info(f"Creating resource: {payload.name}")

    # 入力バリデーション
    if len(payload.name) > 255:
        raise HTTPException(
            status_code=400,
            detail="Name too long (max 255 characters)"
        )

    try:
        resource = Resource(
            name=payload.name,
            value=payload.value,
            created_at=datetime.utcnow()
        )
        session.add(resource)
        session.commit()
        session.refresh(resource)

        logger.info(f"Resource created: {resource.id}")
        return resource

    except Exception as e:
        logger.error(f"Failed to create resource: {e}")
        session.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(e)}"
        )
```

#### リスト取得エンドポイントのテンプレート

```python
@app.get("/resources", response_model=List[ResourceOut])
@limiter.limit(f"{settings.rate_limit_per_minute}/minute")
def list_resources(
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: Session = Depends(get_session)
):
    logger.info(f"Listing resources (skip={skip}, limit={limit})")

    resources = session.query(Resource).offset(skip).limit(limit).all()
    return resources
```

## このプロジェクト特有の必須ルール

### ✅ 必ず含めるもの

1. **レート制限デコレータ**
   ```python
   @limiter.limit(f"{settings.rate_limit_per_minute}/minute")
   ```

2. **リクエストオブジェクト**（レート制限に必要）
   ```python
   def endpoint(request: Request, ...):
   ```

3. **ログ記録**
   ```python
   logger.info(f"Operation description")
   logger.error(f"Error description: {e}")
   ```

4. **エラー処理**
   ```python
   raise HTTPException(status_code=404, detail="Not found")
   ```

5. **レスポンスモデル指定**
   ```python
   @app.get("/path", response_model=SchemaOut)
   ```

6. **セッション依存性注入**
   ```python
   session: Session = Depends(get_session)
   ```

### ❌ 避けるべきこと

- 直接 print() を使う（logger を使用）
- グローバル変数の変更
- 認証なしで機密情報を返す（現在 MVP のため未実装だが将来的に追加）
- レスポンスモデルなしでデータを返す

## データベース操作のパターン

### 単一レコード取得

```python
resource = session.query(Resource).filter(Resource.id == id).first()
if not resource:
    raise HTTPException(404, "Not found")
```

### 複数レコード取得

```python
resources = session.query(Resource).filter(
    Resource.status == "active"
).all()
```

### 作成

```python
try:
    resource = Resource(**data)
    session.add(resource)
    session.commit()
    session.refresh(resource)  # IDなど自動生成値を取得
    return resource
except Exception as e:
    session.rollback()
    raise HTTPException(500, f"Database error: {str(e)}")
```

### 更新

```python
resource = session.query(Resource).filter(Resource.id == id).first()
if not resource:
    raise HTTPException(404, "Not found")

resource.name = new_name
session.commit()
session.refresh(resource)
return resource
```

### 削除

```python
resource = session.query(Resource).filter(Resource.id == id).first()
if not resource:
    raise HTTPException(404, "Not found")

session.delete(resource)
session.commit()
return {"ok": True}
```

## バリデーションパターン

### 文字列長チェック

```python
if len(payload.field) > MAX_LENGTH:
    raise HTTPException(400, f"Field too long (max {MAX_LENGTH})")
```

### 必須フィールドチェック

```python
if not payload.required_field:
    raise HTTPException(400, "Required field is missing")
```

### 既存データ確認

```python
existing = session.query(Resource).filter(
    Resource.name == payload.name
).first()
if existing:
    raise HTTPException(409, "Resource already exists")
```

## テスト追加

`backend/tests/test_<feature>.py` にテストを追加：

```python
def test_get_resource(client, session):
    # Setup
    resource = Resource(name="test", value=123)
    session.add(resource)
    session.commit()

    # Test
    response = client.get(f"/resources/{resource.id}")

    # Assert
    assert response.status_code == 200
    assert response.json()["name"] == "test"

def test_create_resource(client):
    response = client.post("/resources", json={
        "name": "test",
        "value": 123
    })

    assert response.status_code == 200
    assert "id" in response.json()
```

## チェックリスト

新しいエンドポイントを追加する際は以下を確認：

- [ ] `schemas.py` にスキーマ定義（必要な場合）
- [ ] `main.py` にエンドポイント追加
- [ ] `@limiter.limit()` デコレータ追加
- [ ] `request: Request` 引数追加
- [ ] `logger.info()` でログ記録
- [ ] `HTTPException` でエラー処理
- [ ] `response_model` 指定
- [ ] 入力バリデーション実装
- [ ] データベーストランザクション管理
- [ ] テストケース追加（`backend/tests/`）
- [ ] OpenAPI ドキュメント確認（`/docs`）

## 実装の最小限確認

このSkillにより、以下の確認だけで実装開始できます：

1. **新しいモデルが必要か？** → `models.py` 確認
2. **既存のエンドポイントに変更があったか？** → `main.py` の最新数行のみ確認
3. **新しい依存関係があるか？** → `import` 文のみ確認

**不要な探索**（Skillに書いてある）：
- ~~どのファイルに書くか~~
- ~~どのパターンで書くか~~
- ~~エラー処理の方法~~
- ~~ログの書き方~~
- ~~レート制限の適用方法~~

## 既存エンドポイント例

参考：`main.py:87-116` の `create_ligand` エンドポイント
参考：`main.py:131-151` の `list_proteins` エンドポイント
参考：`main.py:177-238` の `create_run` エンドポイント

## 注意事項

- 現在MVP版のため認証なし（将来的に追加予定）
- CORS は `settings.cors_origins` で設定済み
- レート制限は `settings.rate_limit_per_minute` で設定済み（デフォルト60req/min）
- OpenAPI ドキュメントは自動生成される（`/docs`）
