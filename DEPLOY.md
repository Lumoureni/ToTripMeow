# To Trip 服务器部署指南

本文说明如何将 **To Trip**（旅行路线规划应用）部署到 Linux 云服务器，供多人通过浏览器联网使用。

---

## 一、架构说明

生产环境采用 **单进程部署**：

```
用户浏览器
    ↓ HTTP/HTTPS
Express（端口 3001）
    ├── /api/*     → 后端 API（行程存储、高德代理）
    └── /*         → 前端静态页面（dist/）
```

- 前端构建产物在 `dist/`
- 行程数据保存在服务器 `data/workspace.json`（首次运行自动创建）
- 需配置高德地图 Key 才能搜索地点与规划路线

---

## 二、服务器要求

| 项目 | 建议 |
|------|------|
| 系统 | Ubuntu 22.04 / Debian 12 / CentOS 8+ |
| Node.js | **20.x 或更高**（推荐 LTS） |
| 内存 | ≥ 512 MB |
| 磁盘 | ≥ 1 GB |
| 端口 | 开放 `3001`（或你自定义的 `PORT`） |

---

## 三、部署步骤

### 1. 安装 Node.js

以 Ubuntu 为例：

```bash
# 安装 Node.js 20（使用 NodeSource）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证
node -v   # 应显示 v20.x.x
npm -v
```

### 2. 获取项目代码

```bash
# 安装 git（如未安装）
sudo apt-get install -y git

# 克隆仓库（替换为你的仓库地址）
cd /opt
sudo git clone https://github.com/Lumoureni/ToTripMeow.git
sudo chown -R $USER:$USER ToTripMeow
cd ToTripMeow

# 若使用含联网部署的分支：
git checkout cursor/multi-user-network-bcaa
```

### 3. 安装依赖

```bash
npm install
```

### 4. 配置环境变量

```bash
cp .env.example .env
nano .env
```

`.env` 示例（生产环境）：

```env
# 服务端口
PORT=3001
# 监听所有网卡（必须，否则外网无法访问）
HOST=0.0.0.0

# 生产环境建议设置 CORS 白名单（逗号分隔，不要有空格）
# 若前面有 Nginx 反代，填你的域名
CORS_ORIGINS=https://trip.example.com

# 高德 Web 服务 Key（服务端：地点搜索、路线规划）
AMAP_KEY=你的高德Web服务Key

# 高德 JS API Key（前端地图显示，构建时写入前端）
VITE_AMAP_KEY=你的高德JS_API_Key
VITE_AMAP_SECURITY_CODE=你的安全密钥
```

> **重要**：`VITE_*` 变量在 **构建时** 注入，修改后必须重新执行 `npm run build`。

#### 高德 Key 申请

1. 登录 [高德开放平台](https://console.amap.com/)
2. 创建应用，分别申请：
   - **Web 服务** Key → 填入 `AMAP_KEY`
   - **Web 端 (JS API)** Key → 填入 `VITE_AMAP_KEY`
3. JS API 需配置 **安全密钥**（`VITE_AMAP_SECURITY_CODE`）及 **域名白名单**（填你的服务器域名或 IP）

### 5. 构建前端

```bash
npm run build
```

成功后会在项目根目录生成 `dist/` 文件夹。

### 6. 启动服务

```bash
npm start
```

看到类似输出即表示成功：

```
To Trip running at http://127.0.0.1:3001
  LAN: http://192.168.x.x:3001
Serving frontend from dist/
```

浏览器访问：`http://你的服务器公网IP:3001`

### 7. 开放防火墙端口

**Ubuntu (ufw)：**

```bash
sudo ufw allow 3001/tcp
sudo ufw reload
```

**云厂商安全组**：在控制台放行入站 TCP `3001`（或你使用的端口）。

---

## 四、使用 systemd 保持后台运行

手动 `npm start` 在 SSH 断开后会停止。建议注册为系统服务：

```bash
sudo nano /etc/systemd/system/totrip.service
```

写入以下内容（**请按实际路径修改**）：

```ini
[Unit]
Description=To Trip Travel Planner
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/ToTripMeow
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

启用并启动：

```bash
# 若用 www-data 用户，需先授权目录
sudo chown -R www-data:www-data /opt/ToTripMeow

sudo systemctl daemon-reload
sudo systemctl enable totrip
sudo systemctl start totrip

# 查看状态
sudo systemctl status totrip

# 查看日志
sudo journalctl -u totrip -f
```

常用命令：

```bash
sudo systemctl restart totrip   # 重启
sudo systemctl stop totrip      # 停止
```

---

## 五、配置 Nginx 反向代理 + HTTPS（推荐）

生产环境建议用 Nginx 提供 HTTPS，隐藏端口 3001。

### 1. 安装 Nginx 与 Certbot

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

### 2. Nginx 配置

```bash
sudo nano /etc/nginx/sites-available/totrip
```

```nginx
server {
    listen 80;
    server_name trip.example.com;   # 改为你的域名

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用站点：

```bash
sudo ln -s /etc/nginx/sites-available/totrip /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 3. 申请 SSL 证书

```bash
sudo certbot --nginx -d trip.example.com
```

按提示完成 HTTPS 配置。之后访问 `https://trip.example.com` 即可。

### 4. 同步更新 .env

```env
CORS_ORIGINS=https://trip.example.com
```

修改后重启服务：

```bash
sudo systemctl restart totrip
```

---

## 六、数据备份

行程数据保存在：

```
/opt/ToTripMeow/data/workspace.json
```

建议定期备份：

```bash
# 手动备份
cp data/workspace.json data/workspace.json.bak.$(date +%Y%m%d)

# 或加入 crontab 每日备份
0 3 * * * cp /opt/ToTripMeow/data/workspace.json /opt/backups/totrip-$(date +\%Y\%m\%d).json
```

> `data/` 目录已在 `.gitignore` 中，不会被 git 提交，部署后数据只存在于服务器本地。

---

## 七、更新部署

代码更新后按以下流程重新部署：

```bash
cd /opt/ToTripMeow
git pull

# 若 .env 或 VITE_* 有变更，需重新构建
npm install
npm run build

sudo systemctl restart totrip
```

---

## 八、多人使用说明

当前版本支持 **多人同时访问同一套服务**：

- 所有用户共享同一份行程工作区（`data/workspace.json`）
- 适合小团队内网或家庭共用
- 并发写入已通过进程内锁保护，避免数据文件损坏

若需 **每账号独立行程 + 管理员开户**（账号隔离），请合并含鉴权功能的分支后再部署，并额外配置：

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=请改为强密码
ADMIN_DISPLAY_NAME=管理员
```

---

## 九、常见问题

### 1. 外网无法访问

- 确认 `HOST=0.0.0.0`（不是 `127.0.0.1`）
- 检查云厂商 **安全组** 是否放行端口
- 检查服务器 **防火墙**（ufw / firewalld）

### 2. 地图不显示 / 搜索失败

- 确认 `AMAP_KEY`、`VITE_AMAP_KEY` 已正确填写
- 修改 `VITE_*` 后必须重新 `npm run build`
- 在高德控制台检查 **域名白名单** 是否包含你的访问域名或 IP
- 查看服务日志是否有 `AMAP_KEY is missing` 警告

### 3. 页面 404，但 API 正常

- 未执行 `npm run build`，或 `dist/` 目录不存在
- 解决：运行 `npm run build` 后重启服务

### 4. CORS 报错

- 生产环境设置 `CORS_ORIGINS` 为实际访问地址（含协议）
- 多个地址用英文逗号分隔，例如：
  `https://trip.example.com,http://192.168.1.100:3001`

### 5. 服务启动后立即退出

```bash
# 查看详细错误
npm start

# 或 systemd 日志
sudo journalctl -u totrip -n 50 --no-pager
```

常见原因：端口被占用、Node 版本过低、依赖未安装。

---

## 十、命令速查

| 场景 | 命令 |
|------|------|
| 本地开发（局域网） | `npm run dev` → 访问 `http://局域网IP:5173` |
| 生产构建 | `npm run build` |
| 生产启动 | `npm start` |
| 后台运行 | `systemctl start totrip` |
| 查看日志 | `journalctl -u totrip -f` |

---

## 十一、目录结构（部署相关）

```
ToTripMeow/
├── dist/              # 前端构建产物（npm run build 生成）
├── data/              # 运行时数据（自动创建，需备份）
│   └── workspace.json
├── server/            # Express 后端
│   └── index.ts
├── .env               # 环境变量（勿提交 git）
├── .env.example       # 环境变量模板
├── package.json
└── DEPLOY.md          # 本文档
```

如有问题，可在 GitHub 仓库提交 Issue。
