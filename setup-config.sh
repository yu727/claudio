#!/bin/bash
# Claudio AI Radio — 配置向导脚本
# 用于快速配置API密钥和其他设置

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

DEPLOY_DIR="/opt/claudio"
ENV_FILE="$DEPLOY_DIR/apps/server/.env"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Claudio AI Radio 配置向导${NC}"
echo -e "${GREEN}========================================${NC}"

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}请使用 sudo 运行此脚本${NC}"
    exit 1
fi

# 检查部署目录是否存在
if [ ! -d "$DEPLOY_DIR" ]; then
    echo -e "${RED}错误: 部署目录不存在: $DEPLOY_DIR${NC}"
    echo -e "${YELLOW}请先运行部署脚本${NC}"
    exit 1
fi

# 备份现有配置
if [ -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}备份现有配置...${NC}"
    cp "$ENV_FILE" "$ENV_FILE.backup.$(date +%Y%m%d%H%M%S)"
fi

# 交互式配置
echo -e "\n${BLUE}[1/4] Claude API 配置${NC}"
echo -e "${YELLOW}Claude API用于AI音乐规划和DJ消息生成功能${NC}"
read -p "请输入你的 Claude API Key (必需): " CLAUDE_API_KEY

if [ -z "$CLAUDE_API_KEY" ]; then
    echo -e "${RED}警告: 未提供Claude API Key，AI功能将使用模拟模式${NC}"
    CLAUDE_API_KEY="your_claude_api_key_here"
fi

echo -e "\n${BLUE}[2/4] Fish Audio TTS 配置${NC}"
echo -e "${YELLOW}Fish Audio用于生成DJ语音消息（可选）${NC}"
read -p "请输入你的 Fish Audio API Key (可选，回车跳过): " FISH_AUDIO_API_KEY

if [ -z "$FISH_AUDIO_API_KEY" ]; then
    echo -e "${YELLOW}跳过Fish Audio配置，TTS功能将使用模拟模式${NC}"
    FISH_AUDIO_API_KEY="your_fish_audio_api_key_here"
fi

echo -e "\n${BLUE}[3/4] OpenWeather 配置${NC}"
echo -e "${YELLOW}OpenWeather用于获取天气信息（可选，有免费替代）${NC}"
read -p "请输入你的 OpenWeather API Key (可选，回车跳过): " OPENWEATHER_API_KEY

if [ -z "$OPENWEATHER_API_KEY" ]; then
    echo -e "${YELLOW}跳过OpenWeather配置，将使用免费的wttr.in服务${NC}"
    OPENWEATHER_API_KEY=""
fi

echo -e "\n${BLUE}[4/4] 服务器配置${NC}"
read -p "服务器端口 (默认 8080): " SERVER_PORT
SERVER_PORT=${SERVER_PORT:-8080}

read -p "NCM代理端口 (默认 3000): " NCM_PORT
NCM_PORT=${NCM_PORT:-3000}

# 写入配置文件
echo -e "\n${YELLOW}写入配置文件...${NC}"
cat > "$ENV_FILE" << EOF
# Claudio AI Radio 生产环境配置
# 生成时间: $(date)

# 服务器配置
SERVER_PORT=$SERVER_PORT
NCM_API_BASE_URL=http://localhost:$NCM_PORT

# API密钥配置
CLAUDE_API_KEY=$CLAUDE_API_KEY
FISH_AUDIO_API_KEY=$FISH_AUDIO_API_KEY

# 可选配置
OPENWEATHER_API_KEY=$OPENWEATHER_API_KEY
OPENWEATHER_CITY=Jiangxi

# Claude高级配置（可选）
# CLAUDE_BASE_URL=https://api.anthropic.com
# CLAUDE_MODEL=claude-sonnet-4-20250514

# 网易云音乐配置（可选）
# NCM_UID=your_netease_uid
# NCM_COOKIE=your_netease_cookie
EOF

# 设置文件权限
chmod 600 "$ENV_FILE"
chown $(logname):$(logname) "$ENV_FILE"

echo -e "${GREEN}配置文件已保存到: $ENV_FILE${NC}"

# 重启服务
echo -e "\n${YELLOW}重启服务以应用新配置...${NC}"
if systemctl is-active --quiet claudio-server; then
    systemctl restart claudio-server
    echo -e "${GREEN}claudio-server 已重启${NC}"
else
    echo -e "${YELLOW}claudio-server 未运行，跳过重启${NC}"
fi

if systemctl is-active --quiet claudio-ncm; then
    systemctl restart claudio-ncm
    echo -e "${GREEN}claudio-ncm 已重启${NC}"
else
    echo -e "${YELLOW}claudio-ncm 未运行，跳过重启${NC}"
fi

# 显示完成信息
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  配置完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e ""
echo -e "${GREEN}访问地址: http://$SERVER_IP:$SERVER_PORT${NC}"
echo -e ""
echo -e "${YELLOW}配置摘要:${NC}"
echo -e "  Claude API: $(if [ "$CLAUDE_API_KEY" != "your_claude_api_key_here" ]; then echo "已配置"; else echo "未配置"; fi)"
echo -e "  Fish Audio: $(if [ "$FISH_AUDIO_API_KEY" != "your_fish_audio_api_key_here" ]; then echo "已配置"; else echo "未配置"; fi)"
echo -e "  OpenWeather: $(if [ -n "$OPENWEATHER_API_KEY" ]; then echo "已配置"; else echo "使用免费服务"; fi)"
echo -e "  服务器端口: $SERVER_PORT"
echo -e "  NCM代理端口: $NCM_PORT"
echo -e ""
echo -e "${YELLOW}如需修改配置，可以编辑: $ENV_FILE${NC}"
echo -e "${YELLOW}查看服务状态: sudo systemctl status claudio-server claudio-ncm${NC}"
echo -e "${YELLOW}查看实时日志: sudo journalctl -u claudio-server -f${NC}"
echo -e "${GREEN}========================================${NC}"
