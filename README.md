# 🎮 GamePics

**一个精美的游戏截图画廊，基于 Cloudflare R2 + Pages 构建。**

零服务器成本、全球 CDN 加速、手机/平板/电脑完美适配。

<p align="center">
  <img src="https://img.shields.io/badge/Cloudflare-Pages-F38020?logo=cloudflare&logoColor=white" alt="Cloudflare Pages">
  <img src="https://img.shields.io/badge/Storage-R2-F38020?logo=cloudflare&logoColor=white" alt="Cloudflare R2">
  <img src="https://img.shields.io/badge/Cost-$0-34D399" alt="Zero Cost">
  <img src="https://img.shields.io/badge/License-MIT-blue" alt="MIT License">
</p>

---

## ✨ 功能特性

| 特性 | 描述 |
|:---|:---|
| 🧱 **瀑布流画廊** | 自适应 Masonry 布局，原生 CSS 实现，零 JS 布局计算 |
| 🎮 **游戏分类** | 自动读取 R2 文件夹结构，按游戏名分类浏览 |
| 🔍 **全屏灯箱** | 高清预览，键盘 ← → ESC 导航，移动端触摸滑动 |
| ♾️ **无限滚动** | 滚动到底自动加载，配合 R2 cursor 分页 |
| 🖼️ **懒加载** | IntersectionObserver 实现，进入视口才加载 |
| 🔎 **即时搜索** | 350ms 防抖，按文件名/游戏名模糊搜索 |
| 🌙 **暗色主题** | 深色背景 + 玻璃态设计，专为截图展示优化 |
| 📱 **全端响应** | 手机 2 列 → 平板 3 列 → 电脑 4~6 列 |
| ⚡ **极速加载** | Cloudflare CDN 全球边缘缓存，零冷启动 |
| 💰 **零成本** | R2 免费层 10GB 存储 + Pages 无限请求 |

## 📸 预览

### 桌面端
> 暗色主题 + 玻璃态 Header + 渐变分类标签

### 移动端
> 自适应 2 列瀑布流 + 全宽搜索栏

---

## 🏗️ 架构

```
用户浏览器
    ├── 请求页面 ──→ Cloudflare Pages (静态前端)
    ├── /api/*   ──→ Pages Functions (Worker)
    │                    └── R2 Binding ──→ R2 Bucket (列出文件)
    └── 加载图片 ──→ R2 公开域名 (CDN 缓存)
```

**技术栈**：纯原生 HTML / CSS / JavaScript — 零框架、零构建、零依赖（运行时）。

---

## 🚀 快速部署（5 分钟）

### 前提条件

- [Node.js](https://nodejs.org/) 18+
- Cloudflare 账号（免费即可）
- 一个已开启**公开访问**的 R2 Bucket

### 步骤

#### 1. 克隆项目

```bash
git clone https://github.com/your-username/gamepics.git
cd gamepics
npm install
```

#### 2. 配置 R2 Bucket

编辑 `wrangler.toml`，将 `bucket_name` 改为你的 Bucket 名称：

```toml
[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "your-bucket-name"   # ← 改为你的 Bucket 名称
```

#### 3. 配置图片域名

编辑 `public/js/app.js`，将 `R2_PUBLIC_URL` 改为你的 R2 公开访问域名：

```javascript
const CONFIG = {
  R2_PUBLIC_URL: 'https://your-r2-domain.com',  // ← 改为你的域名
  // ...
};
```

#### 4. 部署

```bash
# 登录 Cloudflare（首次需要）
npx wrangler login

# 部署到 Cloudflare Pages
npx wrangler pages deploy public
```

#### 5. 绑定 R2（重要！）

部署后，需要在 Cloudflare Dashboard 中绑定 R2 Bucket：

1. 进入 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 侧栏 → **Workers 和 Pages** → 选择 `gamepics` 项目
3. **Settings** → **Functions** → **R2 bucket bindings**
4. 添加绑定：
   - 变量名：`R2_BUCKET`
   - R2 Bucket：选择你的 Bucket
5. **保存** → 重新部署一次

> 💡 或者通过 **连接 GitHub 仓库** 实现自动部署（推送代码即更新）。

---

## 📁 R2 Bucket 截图组织方式

确保截图按 **「游戏名称/截图文件」** 的结构存放：

```
your-bucket/
├── Cyberpunk 2077/
│   ├── night_city_01.jpg
│   ├── johnny_silverhand.png
│   └── ...
├── Elden Ring/
│   ├── malenia_boss.jpg
│   └── ...
├── Red Dead Redemption 2/
│   └── sunset_ride.jpg
└── ...
```

- 每个**顶级文件夹名** = 自动生成的分类标签
- 支持格式：`.jpg` `.jpeg` `.png` `.gif` `.webp` `.bmp` `.avif` `.tiff`
- 文件名和文件夹名支持中文、空格、特殊字符

---

## 🔧 本地开发

```bash
# 安装依赖
npm install

# 启动本地开发服务器（R2 模拟环境）
npm run dev
# → http://localhost:8788

# 连接远程 R2 测试真实数据
npx wrangler pages dev public --remote
```

---

## 📂 项目结构

```
gamepics/
├── wrangler.toml              # Cloudflare Pages + R2 绑定配置
├── package.json               # 项目元数据 + 脚本
├── .gitignore
│
├── functions/                 # 后端 API（Pages Functions / Workers）
│   └── api/
│       ├── games.js           # GET /api/games     列出所有游戏分类
│       ├── images.js          # GET /api/images    分页列出图片
│       └── search.js          # GET /api/search    搜索图片
│
└── public/                    # 前端静态资源
    ├── index.html             # 主页面
    ├── css/
    │   └── style.css          # 设计系统 + 全部样式
    └── js/
        ├── app.js             # 主入口（ES Module）
        ├── gallery.js         # 瀑布流 + 懒加载 + 无限滚动
        ├── lightbox.js        # 全屏灯箱 + 手势
        └── search.js          # 搜索模块
```

---

## 🔌 API 接口

所有 API 返回 JSON 格式。

### `GET /api/games`

列出所有游戏分类（R2 顶级文件夹）。

**响应示例：**
```json
{
  "games": [
    { "name": "Cyberpunk 2077", "prefix": "Cyberpunk 2077/" },
    { "name": "Elden Ring", "prefix": "Elden Ring/" }
  ]
}
```

### `GET /api/images`

分页列出图片。

| 参数 | 类型 | 默认值 | 说明 |
|:---|:---|:---|:---|
| `game` | string | `""` | 游戏名称筛选（空=全部） |
| `cursor` | string | — | 分页游标 |
| `limit` | number | `30` | 每页数量（最大 100） |

**响应示例：**
```json
{
  "images": [
    {
      "key": "Cyberpunk 2077/night_city.jpg",
      "game": "Cyberpunk 2077",
      "name": "night_city.jpg",
      "size": 2048576,
      "sizeFormatted": "2.0 MB",
      "uploaded": "2024-01-15T10:30:00Z"
    }
  ],
  "cursor": "...",
  "hasMore": true
}
```

### `GET /api/search?q=keyword`

按文件名搜索图片（模糊匹配，最多扫描 5000 个对象）。

---

## ⚡ 性能优化建议

| 优化项 | 方法 |
|:---|:---|
| **缓存** | R2 公开域名已通过 Cloudflare CDN 缓存，建议上传时设置 `Cache-Control: public, max-age=31536000` |
| **图片压缩** | 上传前使用工具压缩截图（推荐 [Squoosh](https://squoosh.app/)），4K 截图建议压缩至 500KB~2MB |
| **缩略图** | 开启 [Cloudflare Image Resizing](https://developers.cloudflare.com/images/transform-images/) 可自动生成缩略图（需付费计划） |
| **自定义域名** | 为 R2 绑定自定义域名而非 `r2.dev`，获得完整 CDN + WAF 保护 |

---

## 🛡️ Cloudflare 免费层限额

| 服务 | 免费额度 |
|:---|:---|
| **R2 存储** | 10 GB / 月 |
| **R2 读取** | 1000 万次 / 月（CDN 缓存命中不计） |
| **Pages** | 无限静态请求 |
| **Pages Functions** | 10 万次 / 天 |

> 对于个人游戏截图画廊，免费层通常**完全够用**。

---

## 🤝 贡献

欢迎提交 PR 和 Issue！

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 提交 Pull Request

---

## 📄 License

[MIT License](LICENSE) — 自由使用，随意修改。
