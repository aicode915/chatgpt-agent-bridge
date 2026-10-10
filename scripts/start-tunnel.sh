#!/bin/bash
# 一键启动隧道：从项目根目录的 .env 读取 CONTROL_PLANE_API_KEY 与 CONTROL_PLANE_TUNNEL_ID，
# 然后以 chatgpt-agent-bridge profile 启动 tunnel-client（前台运行，Ctrl+C 停止）。
#
# 用法：
#   ./scripts/start-tunnel.sh            # 启动；若已在运行则仅提示（不打扰进行中的任务）
#   ./scripts/start-tunnel.sh --restart  # 先停止现有隧道再启动（注意：会中断进行中的任务）
#
# .env 示例（该文件已被 .gitignore，不会提交）：
#   CONTROL_PLANE_API_KEY=sk-...
#   CONTROL_PLANE_TUNNEL_ID=tunnel_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
#
# 说明：CONTROL_PLANE_TUNNEL_ID 是 tunnel-client 的官方环境变量（优先级：flag > 环境变量 > YAML），
# 所以改 .env 即可切换隧道，无需修改 ~/.config/tunnel-client/chatgpt-agent-bridge.yaml。
set -euo pipefail

PROFILE="chatgpt-agent-bridge"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

if ! command -v tunnel-client >/dev/null 2>&1; then
  echo "✗ 未检测到 'tunnel-client' 命令。请先安装 OpenAI 官方 tunnel-client 工具：" >&2
  echo "  参考：brew install tunnel-client 或访问 https://platform.openai.com/settings/organization/tunnels" >&2
  exit 1
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "⚠️ 提示：系统 PATH 中未检测到 'codex' 命令。Codex CLI (>= 0.161.0) 为必需依赖：" >&2
  echo "  参考：brew install codex 或访问 https://github.com/openai/codex" >&2
fi

if [ ! -f .env ]; then
  echo "✗ 缺少 $PROJECT_DIR/.env（需要配置 CONTROL_PLANE_API_KEY 和 CONTROL_PLANE_TUNNEL_ID）" >&2
  echo "  请先复制模板创建：cp .env.example .env 并填入实际凭证" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

if [ -z "${CONTROL_PLANE_API_KEY:-}" ]; then
  echo "✗ .env 里缺少 CONTROL_PLANE_API_KEY" >&2
  exit 1
fi

if [ -z "${CONTROL_PLANE_TUNNEL_ID:-}" ]; then
  echo "✗ .env 里缺少 CONTROL_PLANE_TUNNEL_ID（= ChatGPT 连接器绑定的那条隧道 ID）" >&2
  exit 1
fi

# 自动安装依赖与自动编译
if [ ! -d "$PROJECT_DIR/node_modules" ]; then
  echo "→ 首次启动：未检测到 node_modules，正在自动执行 npm install..."
  npm install
fi

if [ ! -f "$PROJECT_DIR/dist/server.js" ]; then
  echo "→ 未检测到编译产物 dist/server.js，正在自动编译 (npm run build)..."
  npm run build
fi

# 检查并自动初始化 tunnel-client profile
PROFILE_YAML="${HOME}/.config/tunnel-client/${PROFILE}.yaml"
if [ ! -f "$PROFILE_YAML" ]; then
  echo "→ 首次启动：正在为您自动初始化 tunnel profile: ${PROFILE}..."
  NODE_BIN="$(command -v node)"
  tunnel-client init \
    --sample sample_mcp_stdio_local \
    --profile "$PROFILE" \
    --tunnel-id "$CONTROL_PLANE_TUNNEL_ID" \
    --mcp-command "env WORKSPACE_ROOT=${PROJECT_DIR} ${NODE_BIN} ${PROJECT_DIR}/dist/server.js" \
    --force
fi

RUNNING_PATTERN="tunnel-client run --profile ${PROFILE}"

if pgrep -f "$RUNNING_PATTERN" >/dev/null 2>&1; then
  if [ "${1:-}" = "--restart" ]; then
    echo "→ 停止现有隧道（会中断进行中的任务）..."
    pkill -f "$RUNNING_PATTERN" || true
    for _ in $(seq 1 40); do
      pgrep -f "$RUNNING_PATTERN" >/dev/null 2>&1 || break
      sleep 0.25
    done
    if pgrep -f "$RUNNING_PATTERN" >/dev/null 2>&1; then
      echo "✗ 旧隧道未能停止，请手动检查后重试" >&2
      exit 1
    fi
  else
    echo "✓ 隧道已在运行（profile: ${PROFILE}）"
    echo "  如需重启：./scripts/start-tunnel.sh --restart"
    echo "  健康检查：tunnel-client health --url http://127.0.0.1:8080"
    exit 0
  fi
fi

echo "→ 启动隧道 profile=$PROFILE tunnel_id=$CONTROL_PLANE_TUNNEL_ID"
echo "  （环境变量优先于 profile YAML；Ctrl+C 停止）"
exec tunnel-client run --profile "$PROFILE"
