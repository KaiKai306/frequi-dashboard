# Happykai 适配说明

上游来源和固定提交见 `UPSTREAM.json`，原 MIT 许可保留在 `LICENSE`。

生产入口为 `/preview/`，构建命令 `pnpm run build`，使用上游冻结 `pnpm-lock.yaml`；只发布 `dist/` 静态产物及许可/来源文件。生产网关、Compose 叠加文件和验收/回滚脚本见 [ops/happykai](ops/happykai/README.md)。这些文件不包含真实认证信息。

此版本为单机器人中文桌面只读预览。后端固定同源，正式币安密钥不进入前端；面板密码只保留在当前标签页会话。不要运行上游的通用代理 `server.js` 或按上游示例 Dockerfile 直接发布。

当前是已上线的第一版中文预览，尚未开始后续外观改版。保留现有 Freqtrade 模拟服务与原版面板；预览没有完整回测任务管理与交易控制。当前部署已通过真实接口认证/行情/指标校验和使用虚构数据的桌面浏览器验证；后续升级仍应重新验证兼容性。

## 分支与上游升级

- `main` 保留上游原样，作为升级基线。
- `happykai/preview` 保存已经部署的中文、只读、安全接入和指标适配。
- `upstream` 指向 `https://github.com/hddm-github/frequi-dashboard.git`。
- `origin` 应指向用户实际建立的 GitHub Fork，确认地址后配置，不使用其他项目的 Deploy key。

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
