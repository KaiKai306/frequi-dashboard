# Happykai 适配说明

上游来源和固定提交见 `UPSTREAM.json`，原 MIT 许可保留在 `LICENSE`。

生产入口为 `/preview/`，构建命令 `pnpm run build`，使用上游冻结 `pnpm-lock.yaml`；只发布 `dist/` 静态产物及许可/来源文件。生产网关、Compose 叠加文件和验收/回滚脚本见 [ops/happykai](ops/happykai/README.md)。这些文件不包含真实认证信息。

此版本为单机器人中文桌面只读预览。后端固定同源，正式币安密钥不进入前端；面板密码只保留在当前标签页会话。不要运行上游的通用代理 `server.js` 或按上游示例 Dockerfile 直接发布。

默认入口采用用户选定的 design-v2 版中文桌面工作台：顶部导航切换账户总览、行情与持仓、收益分析、成交记录和运行日志，黑灰卡片、Manrope 本地数字字体及系统中文字体。账户总览组合总资产、收益曲线、资金分布、持仓和策略状态；支持深浅主题和隐藏金额。资金曲线保留时间范围、曲线/柱图/全景、键盘查看及初始资金设置，数据来自现有只读接口。

行情复用原图表引擎和每 30 秒轮询，保留 BTC/ETH、周期切换、历史加载、SMA50/200、价格线和交易标记；行情标题显示本根 K 线相对开盘价的变化。持仓提供简洁表、完整字段与详情；成交保留分页、排序、Excel/PDF 导出。日志每条单行显示，长正文在日志区域横向滚动，并保留筛选、行数和自动滚动。字体从本站加载，Manrope OFL 许可随源码和静态文件保留。

用户选定的原设计入口 `/preview/design-v2-20261031/index.html` 保留；上一个固定驾驶舱可从 `/preview/legacy-fixed-cockpit/index.html` 访问。默认入口构建使用 `/preview/`，API 固定为 `/preview/bot` 和 `/preview/market`，避免不同静态路径改变请求位置。发布时保留旧哈希资源和静态目录 inode，先复制资源，最后原子替换首页，无需重启容器。

保留现有 Freqtrade 模拟服务与原版面板；预览没有完整回测任务管理与交易控制。接口认证、行情与指标需要在日本节点使用当地凭据验证；桌面交互使用虚构的空持仓和有成交数据分别检查。模拟浏览器验证不代表实盘收益或用户本地网络性能。

## 分支与上游升级

- `main` 保留上游原样，作为升级基线。
- `happykai/preview` 保存已经部署的中文、只读、安全接入和指标适配。
- `ui/desktop-terminal`、`ui/typography` 保存此前的终端布局和字体改进。
- `ui/fixed-cockpit` 保存此前的固定驾驶舱布局和动态数据反馈。
- `ui/design-v2` 保存用户确认的顶部导航工作台及日志单行修整，验证后快进合入 `happykai/preview`。
- `upstream` 指向 `https://github.com/hddm-github/frequi-dashboard.git`。
- `origin` 指向用户 Fork：`https://github.com/KaiKai306/frequi-dashboard`；通过该仓库专用 Deploy key 推送，不使用其他项目的密钥。

上游升级先在独立分支合并和验证，不直接覆盖正在运行的版本：

```sh
git fetch upstream
git switch main
git merge --ff-only upstream/main
git switch happykai/preview
git switch -c upgrade/trellis-YYYYMMDD
git merge upstream/main
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build
```

运行中文登录、现货图表/周期/历史、只读路由和原版接口的检查后，再合并与发布。GitHub Fork 的默认分支若仍是 `main`，应切换到 `happykai/preview` 才能查看本项目的定制代码。上游附带的同步工作流仅处理 `main`，不负责验证或发布定制分支。

同目录 `*.before-*` 文件是变更前备份，已加入 Git 和 Docker 排除规则；构建产物、依赖、私钥、私有认证目录也不进入仓库。
