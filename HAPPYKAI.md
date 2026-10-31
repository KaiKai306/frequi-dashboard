# Happykai 适配说明

上游来源和固定提交见 `UPSTREAM.json`，原 MIT 许可保留在 `LICENSE`。

生产入口为 `/preview/`，构建命令 `pnpm run build`，使用上游冻结 `pnpm-lock.yaml`；只发布 `dist/` 静态产物及许可/来源文件。生产网关、Compose 叠加文件和验收/回滚脚本见 [ops/happykai](ops/happykai/README.md)。这些文件不包含真实认证信息。

此版本为单机器人中文桌面只读预览。后端固定同源，正式币安密钥不进入前端；面板密码只保留在当前标签页会话。不要运行上游的通用代理 `server.js` 或按上游示例 Dockerfile 直接发布。

桌面使用固定交易驾驶舱：常驻侧边导航切换交易总览、收益分析、成交记录和运行日志。首页为顶部账户摘要、中间行情图、右侧策略状态、下方持仓与每日收益摘要；各区块不再拖动、关闭或浮动。小高度桌面在内容区域内滚动，导航与页头保持固定。原有图表、指标和交易数据视图继续复用，图表的“价格线”开关只控制成本、平仓和止损线显示。

字体优先使用系统界面字体和简体中文无衬线回退，不下载外部字体。正文/表格 13px，账户金额使用较大等宽数字和较小币种单位；图表工具栏在空间不足时换行，日志按时间与正文分行显示。新桌面不读取或覆盖原 v1/v2 拖动布局记录。

行情标题显示现有 K 线响应的最新收盘价和本根 K 线相对开盘价的变化，并标明周期；不是逐笔成交价或 24 小时涨跌。沿用图表每 30 秒轮询，没有增加行情请求。价格变化短暂高亮、账户数值变化淡入、连接状态呼吸灯和刷新倒计时提供动态反馈，支持系统减少动态效果偏好。收益柱图只使用实际返回的日记录，空数据不生成模拟走势；资金曲线优先采用接口的钱包总值，避免只用可用 USDT 误算净值。

保留现有 Freqtrade 模拟服务与原版面板；预览没有完整回测任务管理与交易控制。接口认证、行情与指标需要在日本节点使用当地凭据验证；桌面交互使用虚构的空持仓和有成交数据分别检查。模拟浏览器验证不代表实盘收益或用户本地网络性能。

## 分支与上游升级

- `main` 保留上游原样，作为升级基线。
- `happykai/preview` 保存已经部署的中文、只读、安全接入和指标适配。
- `ui/desktop-terminal`、`ui/typography` 保存此前的终端布局和字体改进。
- `ui/fixed-cockpit` 保存固定驾驶舱布局和动态数据反馈，验证后快进合入 `happykai/preview`。
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
