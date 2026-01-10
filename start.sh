#!/bin/bash
set -e

echo "🚀 Simple Docking Dashboard"
echo ""

# Dockerチェック
if ! command -v docker &> /dev/null; then
    echo "❌ Docker がインストールされていません"
    echo ""
    echo "インストール方法:"
    echo "  Ubuntu/Debian: sudo apt install docker.io docker-compose-v2"
    echo "  Fedora/RHEL:   sudo dnf install docker docker-compose"
    echo "  Arch:          sudo pacman -S docker docker-compose"
    echo ""
    echo "詳細: https://docs.docker.com/get-docker/"
    exit 1
fi

# Docker Composeチェック
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose V2 がインストールされていません"
    exit 1
fi

echo "✅ Docker 環境を確認しました"
echo ""

# 権限チェック
if ! docker ps &> /dev/null; then
    echo "⚠️  Docker デーモンにアクセスできません"
    echo ""
    echo "以下のいずれかを実行してください:"
    echo "  1. sudo ./start.sh"
    echo "  2. sudo usermod -aG docker $USER && newgrp docker"
    echo ""
    exit 1
fi

# 既存コンテナのチェック
if docker compose ps | grep -q "Up"; then
    echo "📊 既存のコンテナが実行中です"
    docker compose ps
    echo ""
    read -p "再起動しますか？ (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🔄 再起動中..."
        docker compose down
    else
        echo "✅ 既存のコンテナを使用します"
        echo ""
        echo "📱 ブラウザで以下のURLにアクセス:"
        echo "   http://localhost:8090/simple-docking"
        # ブラウザ自動起動
        if command -v xdg-open &> /dev/null; then
            xdg-open http://localhost:8090/simple-docking &
        elif command -v gnome-open &> /dev/null; then
            gnome-open http://localhost:8090/simple-docking &
        elif command -v open &> /dev/null; then
            open http://localhost:8090/simple-docking &
        fi
        exit 0
    fi
fi

# ビルドと起動
echo "🔨 Dockerイメージをビルド中..."
docker compose build

echo ""
echo "🚀 サービスを起動中..."
docker compose up -d

echo ""
echo "⏳ サービスの起動を待機中..."
sleep 5

# ヘルスチェック
for i in {1..30}; do
    if curl -s http://localhost:8090/simple-docking/ > /dev/null 2>&1; then
        echo "✅ サービスが起動しました！"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "⚠️  タイムアウト: サービスの起動に時間がかかっています"
        echo "   ログを確認してください: docker compose logs"
    fi
    sleep 1
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Simple Docking Dashboard が起動しました！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📱 ブラウザで以下のURLにアクセスしてください:"
echo "   http://localhost:8090/simple-docking"
echo ""
echo "📝 便利なコマンド:"
echo "   ログを確認: docker compose logs -f"
echo "   停止:       docker compose down"
echo "   再起動:     docker compose restart"
echo "   状態確認:   docker compose ps"
echo ""

# ブラウザ自動起動
if command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:8090/simple-docking &
elif command -v gnome-open &> /dev/null; then
    gnome-open http://localhost:8090/simple-docking &
elif command -v open &> /dev/null; then
    open http://localhost:8090/simple-docking &
fi
