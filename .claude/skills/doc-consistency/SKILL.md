---
name: doc-consistency
description: AGENTS.md と CLAUDE.md の整合性をチェックし、同期します。「ドキュメント整合性チェック」「AGENTS.md 同期」などで使用します。
---

# Documentation Consistency Skill

AGENTS.md と CLAUDE.md の整合性を保証します。

## 目的

- 2つのファイルの内容が一致しているか確認
- 差分がある場合は警告
- 必要に応じて同期

## チェック内容

1. 両ファイルが存在するか
2. 内容が一致しているか
3. 一方が更新されている場合は警告

## 実行手順

1. AGENTS.md を読み込み
2. CLAUDE.md を読み込み
3. 内容を比較
4. 差分があれば報告
5. ユーザーに同期を提案

## 推奨アクション

プロジェクトでは以下のいずれかを推奨：

### オプション1: 統一（推奨）
```bash
# AGENTS.md を CLAUDE.md にリネーム
mv AGENTS.md CLAUDE.md
```

### オプション2: シンボリックリンク
```bash
# CLAUDE.md から AGENTS.md へリンク
ln -s AGENTS.md CLAUDE.md
```

### オプション3: 分離
- CLAUDE.md: 常時ロードするルール
- AGENTS.md: 詳細なドキュメント

## 自動チェック

定期的にこのSkillを実行して整合性を確認してください。
