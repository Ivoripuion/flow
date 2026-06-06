#!/bin/bash

# Flow 一键启动脚本 (Mac/Linux)
# 使用方法: ./start.sh

set -e  # 遇到错误立即退出

echo "🚀 Flow - 开源 ePub 阅读器"
echo "=========================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 错误处理
error_exit() {
    echo -e "${RED}❌ 错误: $1${NC}"
    exit 1
}

success_msg() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning_msg() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

info_msg() {
    echo -e "ℹ️  $1"
}

# 检测操作系统
OS="$(uname -s)"
case "${OS}" in
    Linux*)     PLATFORM="linux";;
    Darwin*)    PLATFORM="mac";;
    *)          error_exit "不支持的操作系统: ${OS}";;
esac

info_msg "检测到操作系统: ${PLATFORM}"

# 检测 Node.js
if ! command -v node &> /dev/null; then
    error_exit "未检测到 Node.js，请先安装 Node.js 18 或更高版本
    访问 https://nodejs.org/ 下载安装"
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    error_exit "Node.js 版本过低 (${NODE_VERSION})，需要 18 或更高版本
    当前版本: $(node -v)
    访问 https://nodejs.org/ 下载最新版本"
fi

success_msg "Node.js $(node -v)"

# 检测 pnpm
if ! command -v pnpm &> /dev/null; then
    warning_msg "未检测到 pnpm，正在自动安装..."
    npm install -g pnpm || error_exit "安装 pnpm 失败"
    success_msg "pnpm 安装成功"
else
    success_msg "pnpm $(pnpm -v)"
fi

# 进入项目根目录
cd "$(dirname "$0")"

# 检测 .env.local 文件
if [ ! -f "apps/reader/.env.local" ]; then
    warning_msg "未检测到配置文件，正在创建默认配置..."

    cat > apps/reader/.env.local << 'EOF'
# Flow 配置文件
# 详细说明请查看文档

# 云存储配置 (可选)
# NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# AI 配置在应用内通过界面设置，无需在此配置
EOF

    success_msg "配置文件已创建: apps/reader/.env.local"
    info_msg "如需启用云存储功能，请编辑配置文件填入 Supabase 凭据"
fi

# 安装依赖
info_msg "正在检查和安装依赖..."
pnpm install || error_exit "安装依赖失败"
success_msg "依赖安装完成"

# 启动应用并延迟打开浏览器
echo ""
echo "=========================="
success_msg "准备启动 Flow"
echo ""
info_msg "启动后请在浏览器访问: http://localhost:7127"
info_msg "按 Ctrl+C 停止应用"
info_msg "浏览器将在 5 秒后自动打开..."
echo ""
echo "=========================="
echo ""

# 延迟打开浏览器（后台进程）
(
    sleep 5
    if [ "$PLATFORM" = "mac" ]; then
        open http://localhost:7127 2>/dev/null
    else
        xdg-open http://localhost:7127 2>/dev/null || echo "请手动打开浏览器访问: http://localhost:7127"
    fi
) &
BROWSER_PID=$!

# 清理函数：脚本退出时杀掉后台浏览器进程
cleanup() {
    kill $BROWSER_PID 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# 启动应用
pnpm dev
