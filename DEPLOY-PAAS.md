# Railway / Render 部署指南

To Trip 采用 **单进程部署**：Express 同时提供 `/api/*` 与前端 `dist/`。

---

## Railway 快速部署

### 1. 创建项目

1. 登录 [Railway](https://railway.app)
2. **New Project** → **Deploy from GitHub repo**
3. 选择 `Lumoureni/ToTripMeow`，分支选 **main**

### 2. 服务设置

| 项 | 值 |
|---|---|
| Root Directory | 留空 |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |

仓库已包含 `railway.toml`，一般无需手动填写。

### 3. Variables（环境变量）

在 Service → **Variables** 中添加：

```env
HOST=0.0.0.0
AMAP_KEY=你的高德Web服务Key
VITE_AMAP_KEY=你的高德JS_API_Key
VITE_AMAP_SECURITY_CODE=你的安全密钥
ADMIN_USERNAME=admin
ADMIN_PASSWORD=请改为强密码
ADMIN_DISPLAY_NAME=管理员
```

**不要手动设置 `PORT`**（Railway 自动注入）。

部署成功后，将 Railway 域名写入 CORS 并重新部署：

```env
CORS_ORIGINS=https://你的项目.up.railway.app
```

### 4. 验证

访问：

```
https://你的域名.up.railway.app/api/health
```

应返回 JSON。再访问根路径应看到登录页。

### 5. 更新部署

代码推送到 **main** 后，Railway 会自动重新构建部署。

---

## 常见问题

| 现象 | 处理 |
|---|---|
| 页面能开，API 404 | Start Command 必须是 `npm start`，不要用 Static Site |
| 容器启动失败 | 确认 `tsx` 在 `dependencies` 中 |
| 地图不显示 | 检查 `VITE_*` 变量，修改后需 Redeploy |
| CORS 报错 | 设置 `CORS_ORIGINS` 为完整 Railway 域名 |

更多细节见 [DEPLOY.md](./DEPLOY.md)。
