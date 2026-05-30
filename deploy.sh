#!/bin/bash
# Claudio AI Radio — Ubuntu 24.04 部署脚本
# 用法: sudo bash deploy.sh

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Claudio AI Radio 部署脚本${NC}"
echo -e "${GREEN}  目标系统: Ubuntu 24.04${NC}"
echo -e "${GREEN}========================================${NC}"

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}请使用 sudo 运行此脚本${NC}"
    exit 1
fi

# 获取实际用户（非root）
ACTUAL_USER=${SUDO_USER:-$USER}
DEPLOY_DIR="/opt/claudio"
REPO_URL="" # 如果使用git克隆，设置仓库URL

# ── 1. 系统更新 ──
echo -e "\n${YELLOW}[1/7] 更新系统包...${NC}"
apt update
apt upgrade -y

# ── 2. 安装必要依赖 ──
echo -e "\n${YELLOW}[2/7] 安装系统依赖...${NC}"
apt install -y curl git build-essential

# 安装 Node.js 20.x
echo -e "${YELLOW}安装 Node.js 20.x...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 验证Node.js版本
NODE_VERSION=$(node --version)
echo -e "${GREEN}Node.js 版本: $NODE_VERSION${NC}"

# 安装 pnpm
echo -e "${YELLOW}安装 pnpm...${NC}"
npm install -g pnpm

# 验证pnpm版本
PNPM_VERSION=$(pnpm --version)
echo -e "${GREEN}pnpm 版本: $PNPM_VERSION${NC}"

# ── 3. 准备部署目录 ──
echo -e "\n${YELLOW}[3/7] 准备部署目录...${NC}"

# 创建部署目录
mkdir -p $DEPLOY_DIR

# 如果当前目录有项目文件，复制过去
if [ -f "package.json" ] && [ -f "pnpm-workspace.yaml" ]; then
    echo -e "${YELLOW}从当前目录复制项目文件...${NC}"
    cp -r . $DEPLOY_DIR/
else
    echo -e "${RED}未找到项目文件，请将项目文件上传到当前目录${NC}"
    exit 1
fi

# 设置目录权限
chown -R $ACTUAL_USER:$ACTUAL_USER $DEPLOY_DIR
chmod -R 755 $DEPLOY_DIR

# ── 4. 安装项目依赖并构建 ──
echo -e "\n${YELLOW}[4/7] 安装项目依赖并构建...${NC}"
cd $DEPLOY_DIR

# 使用实际用户运行pnpm
su - $ACTUAL_USER -c "cd $DEPLOY_DIR && pnpm install"
su - $ACTUAL_USER -c "cd $DEPLOY_DIR && pnpm --filter @ai-radio/web build"
su - $ACTUAL_USER -c "cd $DEPLOY_DIR && pnpm --filter @ai-radio/server build"

# ── 5. 配置环境变量 ──
echo -e "\n${YELLOW}[5/7] 配置环境变量...${NC}"

# 创建环境变量文件
cat > $DEPLOY_DIR/apps/server/.env << 'EOF'
# Claudio AI Radio 生产环境配置
SERVER_PORT=8080
NCM_API_BASE_URL=http://localhost:3000

# 必需的API密钥（请替换为你的实际密钥）
CLAUDE_API_KEY=your_claude_api_key_here
FISH_AUDIO_API_KEY=your_fish_audio_api_key_here

# 可选配置
# CLAUDE_BASE_URL=https://api.anthropic.com
# CLAUDE_MODEL=claude-sonnet-4-20250514
# OPENWEATHER_API_KEY=your_openweather_key
# OPENWEATHER_CITY=Jiangxi
EOF

# 设置环境变量文件权限
chown $ACTUAL_USER:$ACTUAL_USER $DEPLOY_DIR/apps/server/.env
chmod 600 $DEPLOY_DIR/apps/server/.env

echo -e "${YELLOW}请编辑 $DEPLOY_DIR/apps/server/.env 文件，填入你的API密钥${NC}"

# ── 6. 创建systemd服务 ──
echo -e "\n${YELLOW}[6/7] 创建系统服务...${NC}"

# NCM代理服务
cat > /etc/systemd/system/claudio-ncm.service << EOF
[Unit]
Description=Claudio NCM API Proxy
After=network.target

[Service]
Type=simple
User=$ACTUAL_USER
WorkingDirectory=$DEPLOY_DIR
ExecStart=/usr/bin/node apps/server/ncm-server.mjs
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# 主服务器服务
cat > /etc/systemd/system/claudio-server.service << EOF
[Unit]
Description=Claudio AI Radio Server
After=network.target claudio-ncm.service
Requires=claudio-ncm.service

[Service]
Type=simple
User=$ACTUAL_USER
WorkingDirectory=$DEPLOY_DIR/apps/server
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=$DEPLOY_DIR/apps/server/.env

[Install]
WantedBy=multi-user.target
EOF

# 重新加载systemd配置
systemctl daemon-reload

# ── 7. 启动服务 ──
echo -e "\n${YELLOW}[7/7] 启动服务...${NC}"

# 启用并启动服务
systemctl enable claudio-ncm
systemctl enable claudio-server
systemctl start claudio-ncm

# 等待NCM服务启动
echo -e "${YELLOW}等待NCM代理服务启动...${NC}"
for i in {1..30}; do
    if curl -sf http://localhost:3000/search?keywords=test > /dev/null 2>&1; then
        echo -e "${GREEN}NCM代理服务已启动${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}NCM代理服务启动超时${NC}"
        exit 1
    fi
    sleep 1
done

# 启动主服务器
systemctl start claudio-server

# 等待主服务器启动
echo -e "${YELLOW}等待主服务器启动...${NC}"
for i in {1..30}; do
    if curl -sf http://localhost:8080 > /dev/null 2>&1; then
        echo -e "${GREEN}主服务器已启动${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}主服务器启动超时${NC}"
        exit 1
    fi
    sleep 1
done

# ── 配置防火墙 ──
echo -e "\n${YELLOW}配置防火墙...${NC}"
if command -v ufw &> /dev/null; then
    ufw allow 8080/tcp
    ufw allow 3000/tcp
    echo -e "${GREEN}防火墙规则已添加${NC}"
else
    echo -e "${YELLOW}未检测到ufw，请手动配置防火墙开放端口8080和3000${NC}"
fi

# ── 获取服务器IP ──
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

# ── 完成信息 ──
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  部署完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e ""
echo -e "${GREEN}访问地址: http://$SERVER_IP:8080${NC}"
echo -e ""
echo -e "${YELLOW}管理命令:${NC}"
echo -e "  查看状态: sudo systemctl status claudio-server claudio-ncm"
echo -e "  查看日志: sudo journalctl -u claudio-server -f"
echo -e "  重启服务: sudo systemctl restart claudio-server claudio-ncm"
echo -e "  停止服务: sudo systemctl stop claudio-server claudio-ncm"
echo -e ""
echo -e "${YELLOW}配置文件位置:${NC}"
echo -e "  环境变量: $DEPLOY_DIR/apps/server/.env"
echo -e "  项目目录: $DEPLOY_DIR"
echo -e ""
echo -e "${RED}重要提醒:${NC}"
echo -e "  1. 请编辑 $DEPLOY_DIR/apps/server/.env 填入正确的API密钥"
echo -e "  2. 确保阿里云安全组已开放8080和3000端口"
echo -e "  3. 数据库文件位于 $DEPLOY_DIR/apps/server/data/"
echo -e "  4. TTS缓存位于 $DEPLOY_DIR/apps/server/cache/tts/"
echo -e "${GREEN}========================================${NC}"
