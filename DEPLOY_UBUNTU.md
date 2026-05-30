# Claudio AI Radio — Ubuntu 24.04 部署指南

## 快速部署（推荐）

### 1. 上传项目到服务器
```bash
# 在本地机器上使用scp上传
scp -r ./Claudio-main root@你的阿里云IP:/opt/

# 或者使用rsync（更高效）
rsync -avz --progress ./Claudio-main/ root@你的阿里云IP:/opt/Claudio-main/
```

### 2. 登录服务器并运行部署脚本
```bash
# SSH登录服务器
ssh root@你的阿里云IP

# 进入项目目录
cd /opt/Claudio-main

# 给部署脚本执行权限
chmod +x deploy.sh

# 运行部署脚本
sudo bash deploy.sh
```

### 3. 配置API密钥
```bash
# 编辑环境变量文件
nano /opt/claudio/apps/server/.env

# 填入你的API密钥：
# CLAUDE_API_KEY=你的Claude API密钥
# FISH_AUDIO_API_KEY=你的Fish Audio密钥（可选）

# 重启服务使配置生效
sudo systemctl restart claudio-server
```

### 4. 配置阿里云安全组
1. 登录阿里云控制台
2. 进入ECS实例详情
3. 点击"安全组" → "配置规则"
4. 添加入方向规则：
   - 端口：8080，协议：TCP，授权对象：0.0.0.0/0
   - 端口：3000，协议：TCP，授权对象：0.0.0.0/0（可选）

### 5. 访问应用
```
http://你的阿里云公网IP:8080
```

---

## 手动部署（高级）

如果不想使用自动部署脚本，可以按以下步骤手动操作：

### 1. 系统准备
```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装必要工具
sudo apt install -y curl git build-essential

# 安装Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs

# 安装pnpm
sudo npm install -g pnpm
```

### 2. 项目配置
```bash
# 创建部署目录
sudo mkdir -p /opt/claudio

# 复制项目文件
sudo cp -r . /opt/claudio/

# 设置权限
sudo chown -R $USER:$USER /opt/claudio
```

### 3. 构建项目
```bash
cd /opt/claudio

# 安装依赖
pnpm install

# 构建前端
pnpm --filter @ai-radio/web build

# 构建后端
pnpm --filter @ai-radio/server build
```

### 4. 配置环境变量
```bash
# 创建环境变量文件
cat > apps/server/.env << 'EOF'
SERVER_PORT=8080
NCM_API_BASE_URL=http://localhost:3000
CLAUDE_API_KEY=你的Claude API密钥
FISH_AUDIO_API_KEY=你的Fish Audio密钥（可选）
EOF
```

### 5. 手动启动服务
```bash
# 启动NCM代理（后台运行）
nohup node apps/server/ncm-server.mjs > ncm.log 2>&1 &

# 等待NCM代理启动
sleep 5

# 启动主服务器（后台运行）
nohup node apps/server/dist/index.js > server.log 2>&1 &
```

### 6. 配置systemd服务（推荐）
```bash
# 创建NCM代理服务
sudo tee /etc/systemd/system/claudio-ncm.service > /dev/null << EOF
[Unit]
Description=Claudio NCM API Proxy
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/claudio
ExecStart=/usr/bin/node apps/server/ncm-server.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 创建主服务器服务
sudo tee /etc/systemd/system/claudio-server.service > /dev/null << EOF
[Unit]
Description=Claudio AI Radio Server
After=network.target claudio-ncm.service
Requires=claudio-ncm.service

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/claudio/apps/server
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
EnvironmentFile=/opt/claudio/apps/server/.env

[Install]
WantedBy=multi-user.target
EOF

# 重新加载systemd配置
sudo systemctl daemon-reload

# 启用并启动服务
sudo systemctl enable claudio-ncm claudio-server
sudo systemctl start claudio-ncm
sudo systemctl start claudio-server
```

---

## 服务管理命令

### 查看服务状态
```bash
# 查看所有Claudio服务状态
sudo systemctl status claudio-server claudio-ncm

# 查看单个服务状态
sudo systemctl status claudio-server
sudo systemctl status claudio-ncm
```

### 查看日志
```bash
# 实时查看主服务器日志
sudo journalctl -u claudio-server -f

# 查看NCM代理日志
sudo journalctl -u claudio-ncm -f

# 查看最近100行日志
sudo journalctl -u claudio-server -n 100
```

### 重启服务
```bash
# 重启所有服务
sudo systemctl restart claudio-server claudio-ncm

# 重启单个服务
sudo systemctl restart claudio-server
```

### 停止服务
```bash
sudo systemctl stop claudio-server claudio-ncm
```

---

## 防火墙配置

### 使用ufw（Ubuntu默认防火墙）
```bash
# 启用防火墙（如果未启用）
sudo ufw enable

# 开放端口
sudo ufw allow 8080/tcp
sudo ufw allow 3000/tcp

# 查看防火墙状态
sudo ufw status
```

### 阿里云安全组
1. 登录阿里云控制台
2. 进入ECS实例详情
3. 点击"安全组" → "配置规则"
4. 添加入方向规则：
   - 端口：8080，协议：TCP，授权对象：0.0.0.0/0
   - 端口：3000，协议：TCP，授权对象：0.0.0.0/0

---

## 数据备份

### 备份数据库
```bash
# 备份SQLite数据库
cp /opt/claudio/apps/server/data/ai-radio.sqlite /opt/claudio/backup/ai-radio-$(date +%Y%m%d).sqlite
```

### 备份配置文件
```bash
# 备份环境变量
cp /opt/claudio/apps/server/.env /opt/claudio/backup/.env-$(date +%Y%m%d)

# 备份用户配置
cp -r /opt/claudio/user /opt/claudio/backup/user-$(date +%Y%m%d)
cp -r /opt/claudio/config /opt/claudio/backup/config-$(date +%Y%m%d)
```

### 自动备份脚本
```bash
#!/bin/bash
# 保存为 /opt/claudio/backup.sh

BACKUP_DIR="/opt/claudio/backup"
DATE=$(date +%Y%m%d)

mkdir -p $BACKUP_DIR

# 备份数据库
cp /opt/claudio/apps/server/data/ai-radio.sqlite $BACKUP_DIR/ai-radio-$DATE.sqlite

# 备份配置
cp /opt/claudio/apps/server/.env $BACKUP_DIR/.env-$DATE
cp -r /opt/claudio/user $BACKUP_DIR/user-$DATE
cp -r /opt/claudio/config $BACKUP_DIR/config-$DATE

# 删除30天前的备份
find $BACKUP_DIR -name "*.sqlite" -mtime +30 -delete
find $BACKUP_DIR -name ".env-*" -mtime +30 -delete
rm -rf $BACKUP_DIR/user-$(date -d "30 days ago" +%Y%m%d)
rm -rf $BACKUP_DIR/config-$(date -d "30 days ago" +%Y%m%d)

echo "备份完成: $DATE"
```

设置定时备份：
```bash
# 给备份脚本执行权限
chmod +x /opt/claudio/backup.sh

# 添加到crontab（每天凌晨2点备份）
sudo crontab -e
# 添加以下行：
0 2 * * * /opt/claudio/backup.sh >> /opt/claudio/backup/backup.log 2>&1
```

---

## 故障排查

### 服务无法启动
```bash
# 查看详细错误信息
sudo journalctl -u claudio-server -n 50 --no-pager

# 检查端口占用
sudo netstat -tlnp | grep -E "8080|3000"

# 检查文件权限
ls -la /opt/claudio/apps/server/dist/index.js
```

### 无法访问网站
```bash
# 检查防火墙
sudo ufw status

# 检查服务是否运行
sudo systemctl status claudio-server

# 测试本地访问
curl http://localhost:8080
```

### 数据库问题
```bash
# 检查数据库文件权限
ls -la /opt/claudio/apps/server/data/

# 检查磁盘空间
df -h

# 检查数据库完整性
sqlite3 /opt/claudio/apps/server/data/ai-radio.sqlite "PRAGMA integrity_check;"
```

---

## 性能优化

### 1. 启用Gzip压缩
编辑 `apps/server/src/index.ts`，添加Gzip压缩中间件。

### 2. 配置Nginx反向代理（可选）
```nginx
server {
    listen 80;
    server_name 你的IP;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 3. 启用HTTPS（使用Let's Encrypt）
```bash
# 安装Certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书（需要域名）
sudo certbot --nginx -d yourdomain.com
```

---

## 更新部署

### 更新项目代码
```bash
cd /opt/claudio

# 拉取最新代码
git pull

# 重新构建
pnpm install
pnpm --filter @ai-radio/web build
pnpm --filter @ai-radio/server build

# 重启服务
sudo systemctl restart claudio-server claudio-ncm
```

### 回滚版本
```bash
# 查看Git历史
git log --oneline

# 回滚到指定版本
git checkout v1.0.0

# 重新构建并重启
pnpm install
pnpm --filter @ai-radio/web build
pnpm --filter @ai-radio/server build
sudo systemctl restart claudio-server claudio-ncm
```

---

## 监控和维护

### 查看资源使用
```bash
# 查看系统资源
htop

# 查看磁盘使用
df -h

# 查看内存使用
free -h
```

### 监控脚本
```bash
#!/bin/bash
# 保存为 /opt/claudio/monitor.sh

# 检查服务状态
if ! systemctl is-active --quiet claudio-server; then
    echo "$(date): claudio-server 未运行，正在重启..."
    sudo systemctl restart claudio-server
fi

if ! systemctl is-active --quiet claudio-ncm; then
    echo "$(date): claudio-ncm 未运行，正在重启..."
    sudo systemctl restart claudio-ncm
fi

# 检查端口是否可访问
if ! curl -sf http://localhost:8080 > /dev/null; then
    echo "$(date): 无法访问 http://localhost:8080"
fi
```

设置定时监控：
```bash
# 给监控脚本执行权限
chmod +x /opt/claudio/monitor.sh

# 添加到crontab（每5分钟检查一次）
sudo crontab -e
# 添加以下行：
*/5 * * * * /opt/claudio/monitor.sh >> /opt/claudio/monitor.log 2>&1
```

---

## 常见问题

### Q: 没有域名可以部署吗？
A: 可以，直接使用阿里云的公网IP访问即可：`http://你的IP:8080`

### Q: 如何修改端口？
A: 编辑 `/opt/claudio/apps/server/.env` 文件，修改 `SERVER_PORT` 值，然后重启服务。

### Q: 数据库在哪里？
A: SQLite数据库文件位于 `/opt/claudio/apps/server/data/ai-radio.sqlite`

### Q: 如何查看实时日志？
A: 使用命令 `sudo journalctl -u claudio-server -f`

### Q: 服务启动失败怎么办？
A: 查看详细错误信息：`sudo journalctl -u claudio-server -n 50 --no-pager`

### Q: 如何备份数据？
A: 参考"数据备份"章节，或使用提供的备份脚本。

### Q: 如何更新到最新版本？
A: 参考"更新部署"章节，拉取代码后重新构建并重启服务。
