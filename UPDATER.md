# 本机每日更新与 GitHub Pages 发布

这套代码由 Windows 本机启动资讯采集，GitHub Actions 只构建/发布静态网站，不在云端另跑资讯采集。

## 运行条件

- 本机安装 Node.js 24、Git 和官方 Codex CLI；Codex 已通过官方 ChatGPT 登录，Git 已通过官方 GitHub 登录/系统凭据管理器获得此仓库推送权限。
- 每次研究用 `--no-daemon`、`exec --ignore-user-config` 与内置 `model_provider="openai"`。官方 CLI 保留当前用户的认证存储，但忽略用户自定义网关和 MCP 配置。runner 不读、复制或输出 auth.json、API Key 或 Token，不改全局配置/代理。
- 每次启动前仅检查官方 CLI 登录方式确为 ChatGPT；研究/健康子进程移除 API Key、Access Token 和相关 base URL 环境覆盖，只用既有 ChatGPT 缓存登录，不改变父进程或系统环境。发现登录方式不同则失败，不自动购买API或转换认证。
- 研究进程为只读 sandbox、approval never；shell、apps、plugins、browser、memory、multi-agent 关闭，MCP map 为空。模型只输出 JSON，不能修改网页、推送代码或发消息。
- 电脑须开机、联网、Windows 用户保持登录；锁屏可运行。任务使用 InteractiveToken，不保存 Windows 密码；用户退出登录时不会运行。关机无法准点执行，登录后进行补跑。睡眠唤醒取决于硬件和系统策略，不能保证所有机器可唤醒。
- ChatGPT 登录/额度、GitHub 推送权限失效时任务失败并保留原网页，不自动新建账号或购买服务。需要在官方客户端恢复登录。免费域名/托管不等于模型无限额度。

## 数据与校验

- `data/news.json` 为规范数据，`public/data/news.json` 为网页读取的同版本副本。只含已核验内容、运行结果、更新时间和非秘密展示设置。
- `config/sources.json` 是候选官方域名清单；不代表每个入口已接通或每类都有新报道。
- 本机 10:00 运行，检索最近48小时并补查7天。模型须实际读取原文，区分直接AI/研发治理、智能化基础与相邻产业技术，保留原发布日期和证据边界。
- 外部 Node 程序重新请求候选官方 URL，验证 HTTPS 与域名、限制重定向/体积/超时，核对原文短引文及发布日期。未知/未来/时间窗外日期不能当本日新增；direct 引文必须包含明确 AI 术语。
- 单次最多60条；URL去重。真实无新增时保留旧文并记录零新增；核查不足、Schema不符或研究失败时不覆盖已公开数据。
- 已确认的部分来源失败记为 partial；网页显示失败范围，不能把“未检出”解读为全行业没有新资讯。
- 企业来源数按配置根域名计算，同企业多个子域只算一家。
- 独占锁先取得再读取可变快照与日期；同日 runId 幂等。写 JSON 使用同目录临时文件、flush/sync、原子替换和 Windows 有界重试。历史文章达到上限时中止并要求审查存储，不自动删旧文。

## 本机配置与首次验收

请在最终保留的本机仓库目录执行，不要注册指向临时目录的计划。

```powershell
./scripts/Configure-Local.ps1 -Repository aieric2026/seat-ai-observer -PagesUrl https://aieric2026.github.io/seat-ai-observer/
node scripts/health-check.mjs
node scripts/update.mjs --validate-only
node scripts/update.mjs --collect-only
```

`health-check` 通过独立官方 CLI 请求核实当前登录与联网，日志只保存在 `.runtime`；仍需从原生 Windows 任务环境验证，不把当前作者会话成功当作后台运行成功。

采集完成后，在已确认仓库与 Pages 配置正确、源代码首次提交已推送的前提下执行：

```powershell
node scripts/update.mjs --publish-only
```

推送只暂存 `data/news.json` 与 `public/data/news.json`，发现其他已暂存文件时拒绝提交。origin 必须与配置仓库完全匹配；Git 使用已有凭据管理器，禁止交互弹窗或在命令/文件中放 Token。推送后最多等待15分钟，反复读取公开 Pages 的数据版本指纹、runId与条目数量，三者一致才记发布成功。

`.runtime/last-collection.json` 是真实本机采集结果，`.runtime/last-published.json` 是 Pages 实际读回结果。二者必须指向同一 runId，才允许安装每日任务：

```powershell
./scripts/Install-ScheduledTask.ps1 -TaskName SeatAI-Daily-1000
```

注册脚本写入带 `+08:00` 的每日10:00触发及登录后2分钟补跑，支持 StartWhenAvailable、WakeToRun、网络条件、失败后15分钟重试3次、禁止重叠。注册后读取原生任务配置核对触发器和执行路径，不把脚本执行无异常当作已注册。

然后执行一次 `--publish-only` 同步已注册的本机计划展示状态，原生启动计划并核对 LastTaskResult 与日志。当天若已有相同 runId 且 Pages 已验证，正常定时启动会跳过重复采集。首次自然10:00触发仍要等实际发生，不能提前声称已自然运行。

**只有采集→推送→Pages读回→原生任务启动检查均通过，才停用原 Sites 云端任务。** 本仓库脚本不擅自修改原任务。

## 故障与重试

- 本地研究/源核验失败：查看 `.runtime/last-failure.json` 与对应 `.runtime/research/<runId>/`，原网站保留此前数据；任务自动重试。
- 已采集但 Git/Pages 失败：使用 `node scripts/update.mjs --publish-only` 重试，不重复收集同一 runId。
- Codex 桌面更新清除了旧版本路径：runner 会从当前官方安装的 `AppData/Local/OpenAI/Codex/bin` 重新找现有 codex.exe；仍找不到则明确失败，重新执行 Configure-Local。
- 本机路径变动：在新位置重新安装依赖、配置并注册任务；不要只移动文件后沿用旧任务路径。
- 访问源失败、没有合格新增或时间窗不符不会伪造文章；`partial` 表示明确的覆盖缺口。

## 公开仓库边界

`.runtime/`、`node_modules/`、`dist/`、临时 `work/`、本机配置、研究过程日志、原文快照和锁文件必须 Git ignore，且首次推送前要查验 git 实际暂存文件。仓库内不得出现用户 auth 文件、GCM 凭据、API Key、Token 或 Windows 密码。

GitHub Actions 仅 `push main` 与手动触发，所有官方 Action 固定已核实的提交 SHA。它不持有新闻采集密钥，也不运行每日云端资讯任务。

官方参考：[Codex 认证](https://learn.chatgpt.com/docs/auth)、[Codex 配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)。实际访问权限以成功完成的 CLI 请求为准，文档/登录状态不能单独证明某个模型当前可调用。
