# 候选规则与公开资料核查

检索：2026-10-31。原文与访问状态、内容SHA256保存在工作目录 `quant-strategy-study/sources/`、`source-index*.json`。以下分别标注作者主张、工程事实和本轮实现，不把访问成功当成盈利证明。

| 来源 | 读到的内容 | 对本轮的影响 |
| --- | --- | --- |
| [Freqtrade 策略仓库](https://github.com/freqtrade/freqtrade-strategies) | 官方说明示例是开发起点，结果依赖币种、周期与区间，需先回测再Dry-run | 公开策略不直接替换运行账户，保留固定版本和全部失败结果 |
| [ADXMomentum](https://github.com/freqtrade/freqtrade-strategies/blob/main/user_data/strategies/berlinguyinca/ADXMomentum.py) | 1h；ADX14>25、正DI25>25且强于负DI、MOM14>0，反向退出；原版1%ROI、25%止损 | 复现信号及1%ROI，统一改为本研究8%止损/8小时冷却；属于归一化变体，不冒充原版成绩 |
| [Supertrend](https://github.com/freqtrade/freqtrade-strategies/blob/main/user_data/strategies/Supertrend.py) | 原版六个趋势带和旧优化参数，26.5%止损，移动止损；源码自述指标未获得论文一致性验证 | 本轮实现透明的单条ATR10×3+SMA200过滤原型，不复制旧调参收益。实际技术库实现已阅读并执行因果检查 |
| [TrendRider](https://github.com/freqtrade/freqtrade-strategies/blob/main/user_data/strategies/TrendRiderStrategy.py) | 1h并引用4h/1d，默认custom stoploss关闭；参考BTC使用`BTC/USDT:USDT`格式 | 不直接用于当前现货账户；另做EMA20回调+50/200趋势的固定可解释原型，明确不是TrendRider复现 |
| [ReinforcedSmoothScalp](https://github.com/freqtrade/freqtrade-strategies/blob/main/user_data/strategies/berlinguyinca/ReinforcedSmoothScalp.py) | 1m、重采样过滤、紧ROI与多指标 | 作为短线成本/数据对齐问题的审阅材料，不在本轮扩到1m；不能用15m OHLC假装复现1m策略 |
| [NostalgiaForInfinity README](https://github.com/iterativv/NostalgiaForInfinity)及[文档](https://iterativv.github.io/NostalgiaForInfinity/) | 建议5m、40—80币种、6—12并发持仓及动态仓位；提供可自动更新和重启交易容器的侧车 | 与当前两个币种、两仓配置不同，单独保留后续研究。此次未安装该策略、侧车或扩大交易池；大源码超过抓取上限，未声称完成完整审计 |
| [Liu/Tsyvinski：Risks and Returns of Cryptocurrency](https://www.nber.org/papers/w24877) | 2018工作论文摘要报告加密市场时间序列动量和注意力因子，后发表于2021年RFS | 仅作为动量研究动机，未复现论文；不是2026年BTC/ETH 15m盈利证据 |
| [Backtesting traps](https://brookmiles.github.io/freqtrade-stuff/2021/04/12/backtesting-traps/) | 开发者示例讨论盘中路径与紧移动止损使回测过好 | 对照当前正式撮合规则；全周期统一5m细分，并保留盘口/跳空/排队等未覆盖限制 |

## Reddit 与开源批量验证经验

本次成功读取 [r/algotrading 搜索RSS](https://www.reddit.com/r/algotrading/search.rss?q=crypto%20freqtrade%20strategy&restrict_sr=on&sort=new)的帖子正文；此前轮次未取得正文的限制已有变化。本次只把它作为候选与方法线索，不据此归纳社区共识。

- [2026-10-02：416个策略与七阶段验证](https://www.reddit.com/r/algotrading/comments/1wvj596/i_generated_hundreds_of_crypto_trading_strategies/)及其评论RSS实际读取。作者称416个公开策略仅10个通过自建流程、BTC剥头皮0/18，并链接[Crypto-Strategies](https://github.com/CacheCarti/Crypto-Strategies)。这些数字为作者自述，未在本项目复现，仓库还推广其运行平台，不能当作独立权威评测。
- 实际读到的评论质疑：大量相关策略共享同一行情，七道筛选并非七个独立概率事件；即便保留验证段，也可能从大量试验中碰巧筛出赢家。有人提出DSR/PBO/多重检验等方法。本轮没有计算这些统计量，因而不声称378项中的最高收益具有统计显著性。
- [2026-09-17：169笔交易与过拟合讨论](https://www.reddit.com/r/algotrading/comments/1witlif/am_i_still_overfitting_or_is_this_a_genuine_edge/)的帖子正文可读，作者用清算热力图与趋势确认，区分实时产生信号与事后重建信号。当前没有可信的历史清算热图数据，不用OHLCV虚构复现其收益。
- [2026-07-31：趋势跟随合约案例](https://www.reddit.com/r/algotrading/comments/1vbbolu/would_you_give_this_a_paper_run_trend_following/)作者自述长期高收益也伴随约38%净值回撤，且交易27币合约、资金费和1%权益风险。与本项目两币现货不可直接比较，未采用其杠杆或自述收益。

后续两个Reddit请求返回429，已停止继续请求该站点，没有更换代理或绕过限制。Google返回跳转占位页，Bing RSS结果不够相关，均不作为已检索到有效策略证据。

## 为什么保留时间跨度对照与不同仓位

50/200根均线在4h相当于200/800小时，在1h变为50/200小时、15m变为12.5/50小时。改变周期既提高检查频率，也改变经济含义。因此额外保留始终对应200/800小时的均线对照，而不是把任何变化都归功于“更快”。

当前1000USDT账户每次100、最多两仓，初始名义占用最多约20%。将每笔改为250或450会把最大占用提高到约50%或90%，也会改变亏损承受力和资金不足时的交易机会。这一轮全部用正式引擎独立重跑，不能把收益简单乘2.5/4.5，也不能把仓位放大的结果叫成策略信号更有效。

## 复现与授权边界

Freqtrade/technical及其上游开源许可由对应项目提供；本目录给出规则来源和实际变体，未复制或运行下载的复杂策略/安装脚本。研究源码只调用固定镜像已安装的指标与正式回测引擎。公开数据/论文/社区只读检索，没有发帖、评论、私信或联系作者。
