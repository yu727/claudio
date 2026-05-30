# Claudio AI Radio — Ubuntu 24.04 部署说明

## 快速开始

### 方式一：自动部署（推荐）

1. **上传项目到服务器**
   ```bash
   scp -r ./Claudio-main root@你的阿里云IP:/opt/
   ```

2. **登录服务器并运行部署脚本**
   ```bash
   ssh root@你的阿里云IP
   cd /opt/Claudio-main
   chmod +x deploy.sh
   sudo bash deploy.sh
   ```

3. **配置API密钥**
   ```bash
   sudo bash setup-config.sh
   ```

4. **访问应用**
   ```
   http://你的阿里云公网IP:8080
   ```

### 方式二：手动部署

详细步骤请参考 `DEPLOY_UBUNTU.md` 文件。

---

## 文件说明

| 文件 | 说明 |
|------|------|
| `deploy.sh` | 主部署脚本，自动安装依赖、构建项目、创建系统服务 |
| `setup-config.sh` | 配置向导脚本，交互式配置API密钥 |
| `quick-deploy.sh` | 快速部署脚本（适用于全新服务器） |
| `DEPLOY_UBUNTU.md` | 详细部署指南 |

---

## 部署后配置

### 1. 阿里云安全组配置
在阿里云控制台 → ECS实例 → 安全组 → 添加规则：
- 端口 8080，协议 TCP，授权 0.0.0.0/0
- 端口 3000，协议 TCP，授权 0.0.0.0/0

### 2. 配置API密钥
```bash
# 使用配置向导
sudo bash setup-config.sh

# 或手动编辑配置文件
sudo nano /opt/claudio/apps/server/.env
```

### 3. 重启服务
```bash
sudo systemctl restart claudio-server claudio-ncm
```

---

## 常用命令

### 服务管理
```bash
# 查看状态
sudo systemctl status claudio-server claudio-ncm

# 启动服务
sudo systemctl start claudio-server claudio-ncm

# 停止服务
sudo systemctl stop claudio-server claudio-ncm

# 重启服务
sudo systemctl restart claudio-server claudio-ncm
```

### 查看日志
```bash
# 实时日志
sudo journalctl -u claudio-server -f

# 最近日志
sudo journalctl -u claudio-server -n 100
```

### 数据备份
```bash
# 备份数据库
cp /opt/claudio/apps/server/data/ai-radio.sqlite /opt/claudio/backup/

# 备份配置
cp /opt/claudio/apps/server/.env /opt/claudio/backup/
```

---

## 故障排查

### 服务无法启动
```bash
# 查看错误日志
sudo journalctl -u claudio-server -n 50

# 检查端口占用
sudo netstat -tlnp | grep -E "8080|3000"

# 检查文件权限
ls -la /opt/claudio/apps/server/dist/index.js
```

### 无法访问网站
```bash
# 检查防火墙
sudo ufw status

# 检查服务状态
sudo systemctl status claudio-server

# 本地测试
curl http://localhost:8080
```

### 数据库问题
```bash
# 检查数据库文件
ls -la /opt/claudio/apps/server/data/

# 检查磁盘空间
df -h

# 检查数据库完整性
sqlite3 /opt/claudio/apps/server/data/ai-radio.sqlite "PRAGMA integrity_check;"
```

---

## 更新部署

### 更新代码
```bash
cd /opt/claudio
git pull
pnpm install
pnpm --filter @ai-radio/web build
pnpm --filter @ai-radio/server build
sudo systemctl restart claudio-server claudio-ncm
```

### 回滚版本
```bash
cd /opt/claudio
git log --oneline
git checkout v1.0.0
pnpm install
pnpm --filter @ai-radio/web build
pnpm --filter @ai-radio/server build
sudo systemctl restart claudio-server claudio-ncm
```

---

## 性能优化

### 1. 配置Nginx反向代理（可选）
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

### 2. 启用HTTPS（需要域名）
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

### 3. 配置定时备份
```bash
# 创建备份脚本
cat > /opt/claudio/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/claudio/backup"
DATE=$(date +%Y%m%d)
mkdir -p $BACKUP_DIR
cp /opt/claudio/apps/server/data/ai-radio.sqlite $BACKUP_DIR/ai-radio-$DATE.sqlite
cp /opt/claudio/apps/server/.env $BACKUP_DIR/.env-$DATE
find $BACKUP_DIR -name "*.sqlite" -mtime +30 -delete
EOF

chmod +x /opt/claudio/backup.sh

# 添加定时任务
sudo crontab -e
# 添加：0 2 * * * /opt/claudio/backup.sh
```

---

## 监控脚本

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

# 检查端口可访问性
if ! curl -sf http://localhost:8080 > /dev/null; then
    echo "$(date): 无法访问 http://localhost:8080"
fi
```

设置定时监控：
```bash
chmod +x /opt/claudio/monitor.sh
sudo crontab -e
# 添加：*/5 * * * * /opt/claudio/monitor.sh >> /opt/claudio/monitor.log 2>&1
```

---

## 常见问题

**Q: 没有域名可以部署吗？**
A: 可以，直接使用阿里云的公网IP访问：`http://你的IP:8080`

**Q: 如何修改端口？**
A: 编辑 `/opt/claudio/apps/server/.env`，修改 `SERVER_PORT` 值，然后重启服务。

**Q: 数据库在哪里？**
A: `/opt/claudio/apps/server/data/ai-radio.sqlite`

**Q: 如何查看实时日志？**
A: `sudo journalctl -u claudio-server -f`

**Q: 服务启动失败怎么办？**
A: `sudo journalctl -u claudio-server -n 50 --no-pager`

**Q: 如何备份数据？**
A: 参考"数据备份"章节或使用提供的备份脚本。

**Q: 如何更新到最新版本？**
A: 参考"更新部署"章节，拉取代码后重新构建并重启服务。

---

## 技术支持

如有问题，请查看：
1. 日志文件：`/var/log/syslog`
2. 服务日志：`sudo journalctl -u claudio-server`
3. 项目文档：`/opt/claudio/README.md`
4. 详细部署指南：`/opt/claudio/DEPLOY_UBUNTU.md`
