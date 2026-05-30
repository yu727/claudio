#!/bin/bash
# Claudio AI Radio — 快速部署脚本（适用于全新Ubuntu 24.04服务器）
# 用法: curl -sSL https://raw.githubusercontent.com/your-repo/Claudio/main/quick-deploy.sh | sudo bash

set -e

echo "=========================================="
echo "  Claudio AI Radio 快速部署"
echo "  适用于: Ubuntu 24.04 阿里云服务器"
echo "=========================================="

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then
    echo "错误: 请使用 sudo 运行此脚本"
    exit 1
fi

# 更新系统
echo "[1/5] 更新系统..."
apt update && apt upgrade -y

# 安装基础依赖
echo "[2/5] 安装基础依赖..."
apt install -y curl git build-essential

# 安装Node.js
echo "[3/5] 安装Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 安装pnpm
echo "[4/5] 安装pnpm..."
npm install -g pnpm

# 克隆项目（如果还没有）
echo "[5/5] 准备项目..."
DEPLOY_DIR="/opt/claudio"

if [ ! -d "$DEPLOY_DIR" ]; then
    mkdir -p $DEPLOY_DIR
    # 如果有git仓库，克隆项目
    # git clone https://github.com/your-repo/Claudio.git $DEPLOY_DIR
    # 否则需要手动上传项目文件
    echo "请将项目文件上传到 $DEPLOY_DIR"
    exit 1
fi

cd $DEPLOY_DIR

# 运行主部署脚本
if [ -f "deploy.sh" ]; then
    bash deploy.sh
else
    echo "错误: 未找到 deploy.sh 脚本"
    echo "请确保项目文件已完整上传到 $DEPLOY_DIR"
    exit 1
fi
