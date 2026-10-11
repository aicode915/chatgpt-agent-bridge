#!/bin/bash
# 一键启动隧道脚本（兼容 Git 本地源码开发）
# 推荐方式：直接使用 npx chatgpt-agent-bridge
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

if [ ! -d "$PROJECT_DIR/node_modules" ]; then
  echo "→ 首次运行：未检测到 node_modules，正在执行 npm install..."
  npm install
fi

if [ ! -f "$PROJECT_DIR/dist/cli.js" ]; then
  echo "→ 未检测到编译产物 dist/cli.js，正在自动编译 (npm run build)..."
  npm run build
fi

exec node "$PROJECT_DIR/dist/cli.js" "$@"
