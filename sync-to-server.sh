#!/bin/bash
# 快速同步修复代码到服务器的脚本

# ============================================
# 配置区域 - 从 openspec/specs/deployment.md 读取
# ============================================
SERVER_USER="root"                    # 服务器用户名
SERVER_HOST="120.77.222.205"          # 服务器地址（IP或域名）
SSH_PORT="52222"                      # SSH端口
PROJECT_PATH="~/hotnews"              # 项目在服务器上的路径
# ============================================

set -e  # 遇到错误立即退出

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

TAG="${1:-}"
MODE="${2:-}"

if [ -z "$TAG" ]; then
    echo "用法: $0 <image-tag> [--rollback]"
    exit 1
fi

if [ "$MODE" != "--rollback" ]; then
    if [ "$TAG" = "latest" ] || echo "$TAG" | grep -qi '^latest$'; then
        echo "❌ 禁止使用 latest，请使用明确版本号 tag（如 v1.2.3）"
        exit 1
    fi
    if ! echo "$TAG" | grep -q '^v'; then
        echo "❌ 镜像 tag 必须以 v 开头（如 v1.2.3），当前: $TAG"
        exit 1
    fi
fi

if [ "$MODE" != "--rollback" ] && [ "$MODE" != "--force" ]; then
    if [ ! -f ".local_validation_ok" ]; then
        echo "❌ 拒绝部署：未检测到本地 Docker 验证标记文件 .local_validation_ok"
        echo "请先在本地运行："
        echo "  bash docker/local-validate.sh"
        echo "验证通过后再执行部署。"
        echo "如果你明确要跳过（不推荐）："
        echo "  $0 <image-tag> --force"
        exit 1
    fi

    validated_tag=$(grep -E '^viewer_tag=' .local_validation_ok 2>/dev/null | tail -n 1 | cut -d= -f2-)
    if [ -z "$validated_tag" ]; then
        echo "❌ 拒绝部署：.local_validation_ok 缺少 viewer_tag=...（请重新运行本地验证）"
        echo "请先在本地运行："
        echo "  export TREND_RADAR_VIEWER_TAG=$TAG"
        echo "  bash docker/local-validate.sh"
        exit 1
    fi
    if [ "$validated_tag" != "$TAG" ]; then
        echo "❌ 拒绝部署：本地验证的 viewer_tag 与本次部署 tag 不一致"
        echo "  validated viewer_tag: $validated_tag"
        echo "  deploy tag:          $TAG"
        echo "请重新按本次 tag 进行本地验证后再部署："
        echo "  export TREND_RADAR_VIEWER_TAG=$TAG"
        echo "  bash docker/local-validate.sh"
        exit 1
    fi
fi

copy_files() {
    local dest="$1"
    shift

    local remote_host="${dest%%:*}"
    local remote_path="${dest#*:}"

    remote_path_expanded=$(ssh -p "${SSH_PORT}" -o ConnectTimeout=5 "$remote_host" "eval echo $remote_path")
    if [ -z "$remote_path_expanded" ]; then
        echo "❌ 远端路径解析失败: $remote_path"
        exit 1
    fi

    ssh -p "${SSH_PORT}" -o ConnectTimeout=5 "$remote_host" "mkdir -p '$remote_path_expanded'" >/dev/null

    if command -v rsync >/dev/null 2>&1; then
        if ssh -p "${SSH_PORT}" -o ConnectTimeout=5 "$remote_host" "command -v rsync" >/dev/null 2>&1; then
            rsync -avz --progress -e "ssh -p ${SSH_PORT}" "$@" "$dest"
            return
        fi
    fi

    echo "⚠️  远端未安装 rsync（或本机无 rsync），改用 tar+ssh 同步"
    tar_args=()
    for f in "$@"; do
        dir=$(cd "$(dirname "$f")" && pwd)
        base=$(basename "$f")
        tar_args+=("-C" "$dir" "$base")
    done
    COPYFILE_DISABLE=1 tar -czf - "${tar_args[@]}" | ssh -p "${SSH_PORT}" "$remote_host" "tar -xzf - -C '$remote_path_expanded'"
}

echo "🚀 开始同步修复代码到服务器..."
echo "服务器: ${SERVER_USER}@${SERVER_HOST}"
echo "路径: ${PROJECT_PATH}"
echo ""

# 1. 测试 SSH 连接
echo "📡 测试服务器连接..."
if ! ssh -p ${SSH_PORT} -o ConnectTimeout=5 ${SERVER_USER}@${SERVER_HOST} "echo '连接成功'"; then
    echo "❌ 无法连接到服务器，请检查服务器地址和 SSH 配置"
    exit 1
fi

# 2. 同步修复的文件
echo ""
echo "📦 同步修复文件..."
copy_files "${SERVER_USER}@${SERVER_HOST}:${PROJECT_PATH}/trendradar/web/" \
    trendradar/web/server.py

copy_files "${SERVER_USER}@${SERVER_HOST}:${PROJECT_PATH}/trendradar/web/" \
    trendradar/web/news_viewer.py

copy_files "${SERVER_USER}@${SERVER_HOST}:${PROJECT_PATH}/trendradar/web/templates/" \
    trendradar/web/templates/viewer.html

copy_files "${SERVER_USER}@${SERVER_HOST}:${PROJECT_PATH}/docker/" \
    docker/docker-compose.yml \
    docker/docker-compose-build.yml \
    docker/entrypoint.sh \
    docker/Dockerfile.viewer \
    docker/requirements.viewer.txt

echo "⚠️  文档同步可选，跳过"

# 3. 在服务器上重启服务
echo ""
echo "🔄 重启服务..."
ssh -p ${SSH_PORT} ${SERVER_USER}@${SERVER_HOST} TAG="$TAG" MODE="$MODE" bash -s << 'ENDSSH'
set -e
PROJECT_PATH=~/hotnews
cd "$PROJECT_PATH"

compose_cmd=""
if command -v docker-compose >/dev/null 2>&1; then
    compose_cmd="docker-compose"
elif docker compose version >/dev/null 2>&1; then
    compose_cmd="docker compose"
fi

health_url=""

# 检测服务类型并重启
if [ -f "docker/docker-compose.yml" ]; then
    echo "检测到 Docker 部署，重启容器..."
    cd docker
    if [ -z "$compose_cmd" ]; then
        echo "❌ 未找到 docker-compose 或 docker compose"
        exit 1
    fi

    if [ "$MODE" = "--rollback" ]; then
        if [ ! -f ".env.prev" ]; then
            echo "❌ 未找到 .env.prev，无法回滚"
            exit 1
        fi
        cp .env.prev .env
        if ! grep -q '^TREND_RADAR_VIEWER_TAG=' .env 2>/dev/null; then
            prev_tag=$(grep -E '^TREND_RADAR_TAG=' .env 2>/dev/null | tail -n 1 | cut -d= -f2-)
            if [ -n "$prev_tag" ]; then
                echo "⚠️ .env 缺少 TREND_RADAR_VIEWER_TAG，使用 TREND_RADAR_TAG=$prev_tag 补齐"
                printf "\nTREND_RADAR_VIEWER_TAG=%s\n" "$prev_tag" >> .env
            else
                echo "❌ 回滚配置缺少 TREND_RADAR_VIEWER_TAG 且无法推断"
                exit 1
            fi
        fi
        echo "↩️ 已回滚到上一次配置 (.env.prev)"
    else
        if [ -f ".env" ]; then
            cp .env .env.prev || true
        fi
        printf "TREND_RADAR_TAG=%s\nTREND_RADAR_MCP_TAG=%s\nTREND_RADAR_VIEWER_TAG=%s\nVIEWER_PORT=8090\n" "$TAG" "$TAG" "$TAG" > .env
    fi

    if [ "$MODE" != "--rollback" ]; then
        existing_8090=$(docker ps --format '{{.ID}} {{.Names}} {{.Ports}}' | grep '127.0.0.1:8090->' || true)

        if [ -n "$existing_8090" ]; then
            echo "⚠️ 发现占用 127.0.0.1:8090 的容器，将先停止以便部署:"
            echo "$existing_8090"
            ids=$(echo "$existing_8090" | awk '{print $1}')
            for id in $ids; do
                docker rm -f "$id" >/dev/null 2>&1 || true
            done
        fi
        docker rm -f trend-radar-viewer >/dev/null 2>&1 || true

        if command -v ss >/dev/null 2>&1; then
            if ss -lntp 2>/dev/null | grep -q ":8090"; then
                echo "❌ 127.0.0.1:8090 已被占用（需要先停掉旧服务或改端口）"
                ss -lntp 2>/dev/null | grep ":8090" || true
                exit 1
            fi
        elif command -v netstat >/dev/null 2>&1; then
            if netstat -lntp 2>/dev/null | grep -q ":8090"; then
                echo "❌ 127.0.0.1:8090 已被占用（需要先停掉旧服务或改端口）"
                netstat -lntp 2>/dev/null | grep ":8090" || true
                exit 1
            fi
        fi
    fi

    $compose_cmd pull trend-radar trend-radar-viewer trend-radar-mcp || true
    $compose_cmd up -d trend-radar-viewer trend-radar trend-radar-mcp

    viewer_cid=$($compose_cmd ps -q trend-radar-viewer || true)
    if [ -z "$viewer_cid" ]; then
        echo "❌ trend-radar-viewer 容器未启动（compose 未创建该服务或启动失败）"
        $compose_cmd ps || true
        exit 1
    fi

    health_url="http://127.0.0.1:8090/health"

    echo "✅ 等待 viewer 健康检查..."
    for i in $(seq 1 30); do
        if curl -fsS "http://127.0.0.1:8090/health" >/dev/null 2>&1; then
            echo "✅ viewer 健康检查通过"
            break
        fi
        if [ "$i" -eq 30 ]; then
            echo "❌ viewer 健康检查失败"
            exit 1
        fi
        sleep 2
    done
elif pgrep -f "trendradar.web.server" > /dev/null; then
    echo "检测到 Python 直接运行，重启服务..."
    pkill -f "trendradar.web.server"
    nohup python3 -m trendradar.web.server --host 0.0.0.0 --port 8080 > /tmp/trendradar.log 2>&1 &
    echo "服务已重启，日志: /tmp/trendradar.log"

    health_url="http://127.0.0.1:8080/health"
else
    echo "⚠️  未检测到运行中的服务，请手动启动"
fi

# 验证服务状态
echo ""
echo "✅ 等待服务启动..."
sleep 3

if [ -n "$health_url" ] && curl -fsS "$health_url" > /dev/null 2>&1; then
    echo "✅ 服务运行正常"
else
    echo "⚠️  服务可能未正常启动，请检查日志"
fi
ENDSSH

echo ""
echo "🎉 同步完成！"
echo ""
echo "验证修复："
echo "  curl -fsS http://${SERVER_HOST}:8090/health"
echo "  curl -fsS http://${SERVER_HOST}:8090/api/news | python3 -m json.tool | head"
echo ""
echo "回滚："
echo "  $0 <any-tag> --rollback"
echo ""
