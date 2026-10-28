# 席位 SEAT.AI｜汽车座椅产业 AI 观察

用于 GitHub Pages 的静态展示站。页面与资讯文件均由静态托管提供，不依赖 Next.js、Sites、Cloudflare Worker 或云端数据库。分类、搜索、收藏、资讯详情和原文出处在浏览器内工作。

## 本机预览与构建

要求 Node.js ≥22.13.0，使用项目锁文件安装依赖：

```powershell
npm ci
npm run check
npm run dev
npm run build
npm run preview
```

`npm run build` 先做 TypeScript 检查，再生成 `dist/`。默认项目路径为 `/seat-ai-observer/`；本机开发和预览也需打开该子路径。若部署为账号主页或自定义域名根路径，可在构建进程设置 `SITE_BASE_PATH=/`。不要直接打开 `index.html` 文件进行离线预览；资讯文件需要 HTTP 读取。

## 资讯文件契约

生成器将数据写到 `public/data/news.json`，构建时复制为 `dist/data/news.json`。UI 使用 `import.meta.env.BASE_URL + 'data/news.json'` 加载，不请求任何写入接口。

```json
{
  "articles": [],
  "runs": [],
  "settings": {
    "schedule": {
      "enabled": false,
      "time": "10:00",
      "timezone": "Asia/Shanghai",
      "mode": "local",
      "verified": false
    }
  },
  "generatedAt": "有效的 ISO 时间戳"
}
```

文章字段与原站点保持兼容：`id`、`title`、`summary`、`category`、`relatedCategories`、`aiRelation`、`sourceName`、`url`、`publishedAt`、`collectedAt`、`evidenceNote`、`tags`。`publishedAt` 可为 null；原文地址只允许无凭据的 HTTPS URL。十个类别包括整椅、骨架、核心件、电机、执行器、发泡、面套、线束、开关和控制器。

运行记录含 `runId`、`completedAt`、`status`（success/partial/failed）、`addedCount`、`checkedSources`、`note`、`failures`。可选 `kind` 为 collection/bootstrap/configuration，用来区分真正采集与初始化或配置。

只有在本机计划确实保存后，才将 `settings.schedule.enabled` 设为 true；`mode` 必须为 local，UI 才显示本机任务已配置。只有完成采集及推送、上线验证后，才将 `verified` 设为 true。最后成功采集时间使用 `settings.lastSuccessfulCollectionAt`，或带 `kind: collection` 的成功/部分成功记录；不得用数据文件导出时间冒充成功采集时间。

## 数据与事实边界

- 原文发布日期、采集时间和文件生成时间分别记录。
- 初始历史资讯快照不代表本机定时采集已经运行。
- “明确涉及 AI”包含技术应用、研发与行业 AI 治理；阶段和落地范围看收录依据。
- “智能化相关”和“产业技术”不代表已经使用 AI。
- 数据文件加载或校验失败时，页面明确报错；刷新失败保留当前已成功显示的数据。
- 收藏仅保存在当前浏览器；网站不上传收藏信息。

## 每日更新与发布

本机采集、去重、校验、日志、静态导出、推送和 GitHub Pages 上线验证由配套 `scripts/` 与 `config/` 维护。此 README 本身不证明 Windows 计划已经安装，也不证明 GitHub Pages 已经上线。电脑须在执行时开机联网，关机情况下只能在后续补跑。

发布仓库只应包含展示代码、公开资讯和必要发布流程。认证信息、模型密钥、私人配置、本地运行日志与运行数据库不得提交。

## 设计来源

产品流程参考 [AIHOT](https://github.com/KKKKhazix/AIHOT) 的资讯筛选、去重、中文摘要与日报思路；本站独立命名、设计与实现，未复用 AIHOT 名字和 Logo。
