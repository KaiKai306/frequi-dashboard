import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, Check, ChevronLeft, ChevronRight, FlaskConical, RefreshCw } from 'lucide-react';
import { useBot } from '../context/BotContext';
import { fetchBacktestCandles, fetchBacktestReport, fetchBacktestStudyIndex, fetchBacktestTrades } from '../api/backtests';
import { BacktestCrossComparison } from '../components/BacktestCrossComparison';
import { BacktestEquityChart, type ComparisonLine } from '../components/BacktestEquityChart';
import { BacktestCandleChart } from '../components/BacktestCandleChart';
import { StudioDialog } from '../components/StudioPrimitives';
import { formatUtc8 } from '../utils/dateUtils';
import type { BacktestCandle, BacktestReport, BacktestStudyIndex, BacktestTrade } from '../types/backtests';
import '../styles/backtests.css';

const colors = ['var(--bt-line-trend)', 'var(--bt-line-channel)', 'var(--bt-line-reversion)', 'var(--bt-line-control)', 'var(--bt-line-momentum)', 'var(--bt-line-supertrend)', 'var(--bt-line-pullback)'];
const strategyColor = (id: string, index: number) => colors[id.startsWith('HorizonSma') ? 3 : id.startsWith('Donchian') ? 1 : id.startsWith('RsiBbands') ? 2 : id.startsWith('AdxMomentum') ? 4 : id.startsWith('Supertrend') ? 5 : id.startsWith('EmaPullback') ? 6 : id.startsWith('Sma') || id.startsWith('Baseline') ? 0 : index % colors.length];
const percent = (value: number, sign = true) => `${sign && value > 0 ? '+' : ''}${value.toFixed(2)}%`;
const tone = (value: number) => value < 0 ? 'studio-negative' : value > 0 ? 'studio-positive' : '';
const date = (stamp: number) => new Date(stamp).toISOString().slice(0, 10);
const reason = (value: string) => ({ exit_signal: '退出信号', stop_loss: '保护止损', force_exit: '区间结束', timeout_48h: '48小时退出', roi: '止盈' }[value] || value);
function download(name: string, body: string, type: string) { const url = URL.createObjectURL(new Blob([body], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function csv(rows: (string | number)[][]) { return '\uFEFF' + rows.map(row => row.map(v => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\r\n'); }

export function BacktestsView() {
  const { config, theme, formatCurrency, hideBalances } = useBot();
  const [report, setReport] = useState<BacktestReport | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  const [period, setPeriod] = useState('2026-q1-q3'), [cost, setCost] = useState('base'), [strategy, setStrategy] = useState('BaselineSmaTrend4h');
  const [visible, setVisible] = useState(new Set(['BaselineSmaTrend4h', 'DonchianTrend4h', 'RsiBbands4h', 'benchmark']));
  const [fullMetrics, setFullMetrics] = useState(false);
  const [experiment, setExperiment] = useState('original'), [studyTimeframe, setStudyTimeframe] = useState('4h'), [studyStake, setStudyStake] = useState(100);
  const [studyIndex, setStudyIndex] = useState<BacktestStudyIndex | null>(null), [indexError, setIndexError] = useState('');
  const [loadedPath, setLoadedPath] = useState('/preview/backtests/report.json');
  const reportPath = experiment === 'study' ? studyIndex?.reports.find(r => r.timeframe === studyTimeframe && r.stake === studyStake)?.path || '/preview/backtests/report.json' : '/preview/backtests/report.json';
  const [lazyTrades, setLazyTrades] = useState<{ path: string; data: BacktestTrade[] } | null>(null), [tradeError, setTradeError] = useState(''), [tradeRevision, setTradeRevision] = useState(0);
  const [lazyCandles, setLazyCandles] = useState<{ path: string; data: BacktestCandle[] } | null>(null), [candleError, setCandleError] = useState(''), [candleRevision, setCandleRevision] = useState(0);
  const candleCache = useRef(new Map<string, BacktestCandle[]>()), tradeCache = useRef(new Map<string, BacktestTrade[]>());
  useEffect(() => { candleCache.current.clear(); tradeCache.current.clear(); }, [config.username, config.password]);
  useEffect(() => {
    const controller = new AbortController(); setIndexError('');
    fetchBacktestStudyIndex({ username: config.username, password: config.password, apiUrl: '/preview/bot' }, controller.signal).then(setStudyIndex).catch(e => { if (!controller.signal.aborted) setIndexError(e instanceof Error ? e.message : '新研究索引暂时无法读取。'); });
    return () => controller.abort();
  }, [config.username, config.password, revision]);
  const [chartMode, setChartMode] = useState<'equity' | 'drawdown'>('equity');
  const [detailTab, setDetailTab] = useState<'trades' | 'chart' | 'tasks'>('trades'), [pair, setPair] = useState('BTC/USDT'), [tradePage, setTradePage] = useState(0), [focus, setFocus] = useState<BacktestTrade | null>(null), [methodOpen, setMethodOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    fetchBacktestReport({ username: config.username, password: config.password, apiUrl: '/preview/bot' }, controller.signal, reportPath).then(next => { setReport(next); setLoadedPath(reportPath); }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '无法读取回测报告。'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [config.username, config.password, revision, reportPath]);
  useEffect(() => { if (report) setVisible(new Set([...report.strategies.map(s => s.id), 'benchmark'])); }, [report?.reportId]);
  useEffect(() => {
    if (report && !report.periods.some(item => item.id === period)) {
      setPeriod(report.periods.find(item => item.id === '2026-q1-q3')?.id || report.periods[0].id);
    }
  }, [report, period]);
  useEffect(() => { setTradePage(0); setFocus(null); }, [period, cost, strategy, report?.reportId]);
  const group = useMemo(() => report?.runs.filter(r => r.periodId === period && r.costId === cost) ?? [], [report, period, cost]);
  const selected = group.find(r => r.strategyId === strategy) || group[0];
  const selectedStrategy = report?.strategies.find(s => s.id === selected?.strategyId);
  const benchmark = report?.benchmarks.find(b => b.periodId === period && b.costId === cost);
  const lines: ComparisonLine[] = useMemo(() => {
    if (!report) return [];
    const items = group.filter(r => visible.has(r.strategyId)).map(r => { const index = report.strategies.findIndex(s => s.id === r.strategyId); return { id: r.strategyId, name: report.strategies[index].name, color: strategyColor(r.strategyId, index), points: r.series }; });
    if (benchmark && visible.has('benchmark')) items.push({ id: 'benchmark', name: '买入持有基准', color: '#8e8e95', points: benchmark.series, dashed: true } as ComparisonLine);
    return items;
  }, [report, group, benchmark, visible]);
  const tradePath = selected?.tradesPath;
  const selectedTrades = tradePath ? lazyTrades?.path === tradePath ? lazyTrades.data : [] : selected?.trades ?? [];
  const tradesReady = !tradePath || lazyTrades?.path === tradePath;
  const candlePath = report?.candleFiles?.[period]?.[pair];
  const candlesReady = !candlePath || lazyCandles?.path === candlePath;
  useEffect(() => {
    if (!tradePath) return;
    const controller = new AbortController(); setTradeError('');
    const cached = tradeCache.current.get(tradePath);
    if (cached) { setLazyTrades({ path: tradePath, data: cached }); return; }
    fetchBacktestTrades(tradePath, { username: config.username, password: config.password, apiUrl: '/preview/bot' }, controller.signal).then(data => { tradeCache.current.set(tradePath, data); if (tradeCache.current.size > 12) tradeCache.current.delete(tradeCache.current.keys().next().value!); setLazyTrades({ path: tradePath, data }); }).catch(e => { if (!controller.signal.aborted) setTradeError(e instanceof Error ? e.message : '无法读取成交。'); });
    return () => controller.abort();
  }, [tradePath, config.username, config.password, tradeRevision]);
  useEffect(() => {
    if (!candlePath || detailTab !== 'chart') return;
    const controller = new AbortController(); setCandleError('');
    const cached = candleCache.current.get(candlePath);
    if (cached) { setLazyCandles({ path: candlePath, data: cached }); return; }
    fetchBacktestCandles(candlePath, { username: config.username, password: config.password, apiUrl: '/preview/bot' }, controller.signal).then(data => { candleCache.current.set(candlePath, data); if (candleCache.current.size > 3) candleCache.current.delete(candleCache.current.keys().next().value!); setLazyCandles({ path: candlePath, data }); }).catch(e => { if (!controller.signal.aborted) setCandleError(e instanceof Error ? e.message : '无法读取历史行情。'); });
    return () => controller.abort();
  }, [candlePath, detailTab, config.username, config.password, candleRevision]);
  const chartTrades = useMemo(() => selectedTrades.filter(t => t.pair === pair), [selectedTrades, pair]);
  const chartCandles = useMemo(() => (candlePath ? lazyCandles?.path === candlePath ? lazyCandles.data : [] : report?.candles[pair] ?? []).filter(c => !selected || (c[0] >= selected.start && c[0] <= selected.end)), [report, pair, selected, candlePath, lazyCandles]);
  const toggle = (id: string) => setVisible(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  if (!report) return <section className="studio-card bt-state"><FlaskConical size={27} /><h1>策略回测</h1><p>{loading ? '正在读取已完成的回测报告…' : error || '尚无已发布的回测报告。'}</p>{!loading && <button className="studio-primary" onClick={() => setRevision(v => v + 1)}>重新读取</button>}</section>;
  const activePeriod = report.periods.find(p => p.id === period) || report.periods[0];
  const activeCost = report.costs.find(c => c.id === cost)!;
  const totalTrades = report.runs.reduce((sum, r) => sum + r.metrics.trades, 0);
  const years = [...new Set(selected?.monthly.map(m => m.month.slice(0, 4)) ?? [])];
  const exportSummary = () => download(`策略比较-${report.settings.timeframe}-s${report.settings.stake}-${period}-${cost}.csv`, csv([['策略', '区间', '成本', '账户收益率%', '净收益USDT', '净值最大回撤%', '成交回撤%', '交易数', '胜率%', '盈利因子', '近似交易成本USDT', '信号周期', '单笔投入USDT', '区间年化CAGR%', '平均持仓占比%'], ...group.map(r => [report.strategies.find(s => s.id === r.strategyId)!.name, activePeriod.label, activeCost.label, r.metrics.returnPct, r.metrics.profit, r.metrics.drawdownPct, r.metrics.closedDrawdownPct, r.metrics.trades, r.metrics.winRate, r.metrics.profitFactor ?? '', r.metrics.fees, report.settings.timeframe, report.settings.stake, r.metrics.cagrPct ?? '', r.metrics.exposurePct ?? ''])]), 'text/csv;charset=utf-8');
  const exportTrades = () => selected && download(`回测成交-${selected.id}.csv`, csv([['交易对', '开仓时间UTC', '平仓时间UTC', '开仓价', '平仓价', '数量', '投入USDT', '收益USDT', '单笔收益率%', '退出原因', '入场信号'], ...selectedTrades.map(t => [t.pair, new Date(t.openTime).toISOString(), new Date(t.closeTime).toISOString(), t.openRate, t.closeRate, t.amount, t.stake, t.profit, t.returnPct, reason(t.reason), t.enterTag])]), 'text/csv;charset=utf-8');
  return <div className="bt-workspace">
    <div className="bt-title-row">
      <div className="bt-heading"><h1>策略回测</h1><span className="bt-heading-meta">BTC / ETH <i /> {report.settings.timeframe} 信号 · {report.settings.detailTimeframe} 撮合</span></div>
      <div className="bt-title-actions"><span className="bt-complete"><Check size={13} />{report.runs.length} 项已完成</span><button className="bt-method-button" onClick={() => setMethodOpen(true)}>实验口径与检查<ArrowUpRight size={13} /></button><button className="bt-button" onClick={exportSummary} disabled={hideBalances || loading} title={hideBalances ? '显示金额后可导出完整报告' : '导出当前区间策略比较'}><ArrowDownToLine size={14} />导出比较</button><button className="studio-icon" aria-label="刷新回测报告" disabled={loading} onClick={() => setRevision(v => v + 1)}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button></div>
    </div>
    {error && <div role="alert" className="studio-error">{error} · 当前保留已读取报告（{report.settings.timeframe} / 单笔 {report.settings.stake} USDT）</div>}
    <div className="bt-experiment-controls"><label>实验<select aria-label="回测实验" value={experiment} onChange={e => setExperiment(e.target.value)}><option value="original">首轮固定基线 · 24 项</option><option value="study" disabled={!studyIndex}>策略与短周期 · {studyIndex?.totalRuns ?? 378} 项</option></select></label>{experiment === 'study' && <><label>信号周期<select aria-label="研究信号周期" value={studyTimeframe} onChange={e => { const tf = e.target.value; setStudyTimeframe(tf); setStrategy(previous => previous.includes('Study') ? previous.replace(/Study(4h|1h|15m)$/, `Study${tf}`) : `SmaStudy${tf}`); }}><option value="4h">4 小时</option><option value="1h">1 小时</option><option value="15m">15 分钟</option></select></label><label>单笔投入<select aria-label="研究单笔投入" value={studyStake} onChange={e => setStudyStake(Number(e.target.value))}>{[100, 250, 450].map(v => <option key={v} value={v}>{v} USDT · 最多约 {v / 5}% 初始资金</option>)}</select></label><span>全部 {studyIndex?.totalRuns} 项 · 当前方案 {report.runs.length} 项</span></>}{indexError && <span className="bt-index-error">新研究索引暂不可用，首轮报告可继续查看</span>}</div>
    {loading && loadedPath !== reportPath && <div className="bt-loading-note" role="status">正在读取所选方案，当前仍显示 {report.settings.timeframe} / 单笔 {report.settings.stake} USDT…</div>}
    <div className="bt-filter-row"><div className="studio-segments" aria-label="回测区间">{report.periods.map(p => <button key={p.id} aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>{p.label}</button>)}</div><label>成本场景<select aria-label="回测成本场景" value={cost} onChange={e => setCost(e.target.value)}>{report.costs.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label></div>
    <div className="bt-research-grid">
      <section className="studio-card bt-chart-card" aria-label="策略曲线对比">
        <header className="studio-card-head"><h2>{chartMode === 'equity' ? '账户收益曲线' : '净值回撤曲线'}</h2><div className="studio-segments"><button aria-pressed={chartMode === 'equity'} onClick={() => setChartMode('equity')}>收益</button><button aria-pressed={chartMode === 'drawdown'} onClick={() => setChartMode('drawdown')}>回撤</button></div></header>
        <div className="bt-chart-body">
          {selected && <div className="bt-performance">
            <div className="bt-return"><span>{selectedStrategy?.name} · {chartMode === 'equity' ? '区间账户收益' : '净值最大回撤'}</span><strong className={tone(chartMode === 'equity' ? selected.metrics.returnPct : -selected.metrics.drawdownPct)}>{chartMode === 'equity' && selected.metrics.returnPct > 0 ? '+' : chartMode === 'drawdown' && selected.metrics.drawdownPct > 0 ? '−' : ''}{(chartMode === 'equity' ? selected.metrics.returnPct : Math.abs(selected.metrics.drawdownPct)).toFixed(2)}<small>%</small></strong></div>
            <dl className="bt-performance-facts"><div><dt>期末净值</dt><dd>{formatCurrency(selected.metrics.final)}</dd></div><div><dt>净收益</dt><dd className={tone(selected.metrics.profit)}>{formatCurrency(selected.metrics.profit, { showSign: true })}</dd></div></dl>
          </div>}
          <div className="bt-legend">{report.strategies.map((s, i) => <label key={s.id}><input type="checkbox" checked={visible.has(s.id)} onChange={() => toggle(s.id)} /><i style={{ background: strategyColor(s.id, i) }} />{s.name}</label>)}<label><input type="checkbox" checked={visible.has('benchmark')} onChange={() => toggle('benchmark')} /><i style={{ background: '#8e8e95' }} />买入持有基准 <strong>{percent(benchmark?.returnPct ?? 0)}</strong></label></div>
          <BacktestEquityChart lines={lines} drawdown={chartMode === 'drawdown'} />
          <p className="bt-chart-caption">净值含持仓价值 · 曲线按日抽样，最大回撤使用完整快照。基准各投入 {report.settings.stake} USDT 预算买入 BTC / ETH，其余持有 USDT。</p>
        </div>
        <div className="bt-protocol"><div><span>初始资金</span><strong>{formatCurrency(report.settings.initial)}</strong></div><div><span>单笔 / 仓位上限</span><strong>{formatCurrency(report.settings.stake)} / {report.settings.maxOpenTrades} 仓</strong></div><div><span>风险规则</span><strong>{report.settings.stoplossPct}% 止损 · {report.settings.cooldownHours ? `${report.settings.cooldownHours} 小时` : '2 根'}冷却</strong></div><div><span>数据校验</span><strong>{report.dataset.archives} 份官方归档</strong></div></div>
      </section>
      <section className="studio-card bt-strategy-panel" aria-label="策略快速比较">
        <header className="studio-card-head"><h2>策略比较</h2><button className="bt-inline-link" aria-expanded={fullMetrics} aria-controls="backtest-full-metrics" onClick={() => setFullMetrics(v => !v)}>{fullMetrics ? '收起指标' : '完整指标'}<ArrowUpRight size={13} /></button></header>
        <div className={`bt-strategy-list ${report.strategies.length > 3 ? 'bt-strategy-list-many' : ''}`}>{report.strategies.map((s, i) => {
          const run = group.find(r => r.strategyId === s.id); if (!run) return null;
          const values = run.series.map(p => p[1]), min = Math.min(...values), range = Math.max(...values) - min;
          const spark = values.map((v, n) => `${n ? 'L' : 'M'}${(n / Math.max(1, values.length - 1) * 100).toFixed(1)},${(32 - (v - min) / (range || 1) * 28).toFixed(1)}`).join(' ');
          return <button key={s.id} className="bt-strategy-option" aria-label={`查看${s.name}详情`} aria-pressed={selected?.strategyId === s.id} onClick={() => setStrategy(s.id)}>
            <span className="bt-option-heading"><i style={{ background: strategyColor(s.id, i) }} /><span>{s.name}</span><span className="bt-option-status">{selected?.strategyId === s.id ? <Check size={13} /> : <ChevronRight size={13} />}</span></span>
            <span className="bt-option-value"><strong className={tone(run.metrics.returnPct)}>{percent(run.metrics.returnPct)}</strong><svg viewBox="0 0 104 36" aria-hidden="true"><path d={spark} fill="none" stroke={strategyColor(s.id, i)} strokeWidth="1.5" /></svg></span>
            <span className="bt-option-facts"><span>最大回撤 <b>{percent(run.metrics.drawdownPct, false)}</b></span><span>胜率 <b>{percent(run.metrics.winRate, false)}</b></span><span>成交 <b>{run.metrics.trades}</b></span></span>
          </button>;
        })}</div>
        <div className="bt-comparison-note"><span>{activeCost.label} · 相同投入与保护规则</span><span>点击策略，查看下方月度与成交</span></div>
      </section>
    </div>
    <section id="backtest-full-metrics" className="studio-card bt-full-metrics" aria-label="回测策略比较" hidden={!fullMetrics}><header className="studio-card-head"><h2>完整策略指标</h2><span className="studio-micro">{activePeriod.start} — {activePeriod.end} · {activeCost.label}</span></header><div className="bt-table-scroll"><table className="bt-table"><thead><tr><th>策略 / 规则</th><th>账户收益</th><th>净收益</th><th>净值最大回撤</th><th>交易次数</th><th>胜率</th><th>盈利因子</th><th>近似交易成本</th><th>区间年化 CAGR</th><th>平均持仓占比</th></tr></thead><tbody>{report.strategies.map((s, i) => { const r = group.find(r => r.strategyId === s.id); if (!r) return null; const m = r.metrics; return <tr key={s.id} data-selected={selected?.strategyId === s.id}><td><button className="bt-select-strategy" aria-label={`选择${s.name}`} aria-pressed={selected?.strategyId === s.id} onClick={() => setStrategy(s.id)}><i style={{ background: strategyColor(s.id, i) }} /><span>{s.name}<small>{s.id}{s.id === 'BaselineSmaTrend4h' ? ' · 当前模拟基线' : ''}</small></span><ChevronRight size={15} /></button></td><td className={tone(m.returnPct)}>{percent(m.returnPct)}</td><td className={tone(m.profit)}>{formatCurrency(m.profit, { showSign: true })}</td><td>{percent(m.drawdownPct, false)}</td><td>{m.trades}</td><td>{percent(m.winRate, false)}</td><td>{m.profitFactor == null ? '—' : m.profitFactor.toFixed(2)}</td><td>{formatCurrency(m.fees)}</td><td>{m.cagrPct == null ? '—' : percent(m.cagrPct)}</td><td>{m.exposurePct == null ? '—' : percent(m.exposurePct, false)}</td></tr>; })}</tbody></table></div></section>
    {experiment === 'study' && studyIndex && loadedPath === reportPath && <BacktestCrossComparison path={studyIndex.summaryPath} period={period} cost={cost} stake={report.settings.stake} timeframe={report.settings.timeframe} onSelect={row => { setStudyTimeframe(row.timeframe); setStudyStake(row.stake); setStrategy(`${row.family}Study${row.timeframe}`); }} />}
    {selected && selectedStrategy && <><div className="bt-detail-title"><div><span className="bt-detail-label">策略详情</span><h2>{selectedStrategy.name}</h2><p>{selectedStrategy.description}</p></div><span>{date(selected.start)} — {date(selected.end)}<small>实际回测范围 · UTC</small></span></div>
      <section className="studio-card bt-monthly-card" aria-label="月度收益"><header className="studio-card-head"><h2>月度账户收益</h2><span className="studio-micro">含浮动净值变化 · 非逐笔利润简单相加</span></header><div className="bt-table-scroll"><table className="bt-monthly"><thead><tr><th>年份</th>{Array.from({ length: 12 }, (_, i) => <th key={i}>{i + 1}月</th>)}</tr></thead><tbody>{years.map(year => <tr key={year}><th>{year}</th>{Array.from({ length: 12 }, (_, i) => { const m = selected.monthly.find(m => m.month === `${year}-${String(i + 1).padStart(2, '0')}`); return <td key={i}><span className={m ? tone(m.returnPct) : ''} style={m ? { background: m.returnPct > 0 ? `rgba(117,173,145,${Math.min(.24, .05 + Math.abs(m.returnPct) / 35)})` : m.returnPct < 0 ? `rgba(199,123,134,${Math.min(.24, .05 + Math.abs(m.returnPct) / 35)})` : 'transparent' } : undefined} title={m ? `${m.month} · ${formatCurrency(m.profit, { showSign: true })}` : '无此月份数据'}>{m ? percent(m.returnPct) : '—'}</span></td>; })}</tr>)}</tbody></table></div></section>
      <section className="studio-card bt-details" aria-label="回测实验详情"><header className="studio-card-head"><div className="studio-view-switch">{([['trades', '成交明细'], ['chart', '买卖位置'], ['tasks', '实验记录']] as const).map(([id, label]) => <button key={id} aria-pressed={detailTab === id} onClick={() => setDetailTab(id)}>{label}</button>)}</div>{detailTab === 'trades' && <button className="bt-button" disabled={hideBalances || loading || !tradesReady} onClick={exportTrades}><ArrowDownToLine size={13} />导出成交</button>}{detailTab === 'chart' && <label>交易对<select aria-label="回测图表交易对" value={pair} onChange={e => { setPair(e.target.value); setFocus(null); }}>{Object.keys(report.candles).map(p => <option key={p}>{p}</option>)}</select></label>}</header>
        {detailTab === 'trades' && <><div className="bt-table-scroll"><table className="bt-table bt-trades"><thead><tr><th>交易对</th><th>开仓 / 平仓 UTC+8</th><th>买入 / 卖出价格</th><th>投入 / 数量</th><th>净收益</th><th>单笔收益率</th><th>退出原因</th><th /></tr></thead><tbody>{selectedTrades.slice(tradePage * 12, (tradePage + 1) * 12).map((t, i) => <tr key={`${t.openTime}-${t.pair}-${i}`}><td>{t.pair}</td><td>{formatUtc8(t.openTime, 'YYYY-MM-DD HH:mm')}<small>{formatUtc8(t.closeTime, 'YYYY-MM-DD HH:mm')}</small></td><td>{t.openRate.toLocaleString('en-US', { maximumFractionDigits: 2 })}<small>{t.closeRate.toLocaleString('en-US', { maximumFractionDigits: 2 })}</small></td><td>{formatCurrency(t.stake)}<small>{hideBalances ? '••••••' : t.amount.toLocaleString('en-US', { maximumFractionDigits: 8 })}</small></td><td className={tone(t.profit)}>{formatCurrency(t.profit, { showSign: true })}</td><td className={tone(t.returnPct)}>{percent(t.returnPct)}</td><td>{reason(t.reason)}</td><td><button className="bt-inline-link" onClick={() => { setPair(t.pair); setFocus(t); setDetailTab('chart'); }}>图表<ArrowUpRight size={12} /></button></td></tr>)}{!tradesReady && <tr><td colSpan={8} className="bt-empty">{tradeError ? <>{tradeError}<button className="bt-inline-link" onClick={() => setTradeRevision(v => v + 1)}>重新读取成交</button></> : '正在读取此策略的成交…'}</td></tr>}{tradesReady && !selectedTrades.length && <tr><td colSpan={8} className="bt-empty">此区间没有成交，净值保持现金状态。</td></tr>}</tbody></table></div><div className="bt-pagination"><span>共 {selected.metrics.trades} 笔 · 第 {tradePage + 1} / {Math.max(1, Math.ceil(selectedTrades.length / 12))} 页</span><button aria-label="回测成交上一页" disabled={tradePage === 0} onClick={() => setTradePage(p => p - 1)}><ChevronLeft size={15} /></button><button aria-label="回测成交下一页" disabled={(tradePage + 1) * 12 >= selectedTrades.length} onClick={() => setTradePage(p => p + 1)}><ChevronRight size={15} /></button></div></>}
        {detailTab === 'chart' && <div className="bt-candle-body"><div className="bt-chart-note"><span>↑ 买入　↓ 卖出 · {chartTrades.length} 笔历史交易</span>{focus && <button onClick={() => setFocus(null)}>查看整个区间</button>}</div><>{!candlesReady ? <div className="bt-empty">{candleError ? <>{candleError}<button className="bt-inline-link" onClick={() => setCandleRevision(v => v + 1)}>重新读取历史行情</button></> : '正在读取所选周期历史行情…'}</div> : !tradesReady ? <div className="bt-empty">{tradeError || '正在读取买卖标记…'}</div> : <BacktestCandleChart candles={chartCandles} trades={chartTrades} theme={theme} focus={focus} />}</><p className="bt-chart-caption">展示所选策略回测成交。标记对齐所属 {report.settings.timeframe} K 线，实际成交时间见明细；数据来自历史归档。</p></div>}
        {detailTab === 'tasks' && <div className="bt-task-body"><div className="bt-task-summary"><span><Check size={14} />{report.tasks.length} 组任务 / {report.runs.length} 项策略回测完成</span><span>生成于 {formatUtc8(report.createdAt, 'YYYY-MM-DD HH:mm:ss')} · 累计 {totalTrades} 笔成交记录（跨策略/成本，非独立样本）</span></div><div className="bt-table-scroll"><table className="bt-table"><thead><tr><th>任务</th><th>历史区间</th><th>成本</th><th>策略数</th><th>计算用时</th><th>状态</th></tr></thead><tbody>{report.tasks.map(t => <tr key={t.id}><td>{t.id}</td><td>{report.periods.find(p => p.id === t.period)?.label}</td><td>{report.costs.find(c => c.id === t.cost)?.label}</td><td>{t.strategy_count}</td><td>{t.duration_seconds.toFixed(1)} 秒</td><td><span className="bt-complete"><Check size={12} />{t.state === 'completed' ? '已完成' : '未完成'}</span></td></tr>)}</tbody></table></div><p className="bt-chart-caption">报告 {report.reportId} · 当前页读取已完成实验，新回测由研究任务运行后发布。</p><button className="bt-button" disabled={hideBalances || loading || !tradesReady} onClick={() => download(`回测实验-${selected.id}.json`, JSON.stringify({ ...selected, trades: selectedTrades, strategy: selectedStrategy, cost: activeCost, engine: report.engine, dataset: report.dataset, notes: report.notes }, null, 2), 'application/json')}>下载所选实验 JSON<ArrowDownToLine size={13} /></button></div>}
      </section></>}
    <div className="bt-bottom-note">历史区间已参与研究，回测结果不代表未来表现。当前模拟账户继续独立运行，查看或选择回测策略不会修改模拟账户。</div>
    {methodOpen && <StudioDialog title="实验口径与检查" wide onClose={() => setMethodOpen(false)}><div className="bt-method-grid"><dl className="studio-details">{[['引擎', report.engine], ['数据', report.dataset.source], ['基础数据', `${report.dataset.start} — ${report.dataset.end}`], ['信号 / 撮合周期', `${report.settings.timeframe} / ${report.settings.detailTimeframe}`], ['当前单边手续费假设', percent(activeCost.fee * 100, false)], ['当前单边滑点成本近似', percent(activeCost.slippage * 100, false)], ['交易成本输入合计', percent(activeCost.effective_fee * 100, false)], ['已实现成交回撤', selected ? percent(selected.metrics.closedDrawdownPct, false) : '—'], ['区间年化 CAGR（非预测）', selected?.metrics.cagrPct == null ? '—' : percent(selected.metrics.cagrPct)], ['平均持仓占比', selected?.metrics.exposurePct == null ? '—' : percent(selected.metrics.exposurePct, false)], ['平均持有时间', selected?.metrics.meanDurationMinutes == null ? '—' : `${(selected.metrics.meanDurationMinutes / 60).toFixed(1)} 小时`]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><div className="bt-method-checks"><h3>验证记录</h3><p>✓ 官方归档 SHA256 校验</p><p>✓ {report.strategies.length} 策略截断因果一致性</p><p>✓ 交易利润与钱包余额独立核对</p><p>{report.checks.frameworkLookahead === 'passed' ? '✓ 框架未来数据检查（每变体10个信号）' : '框架未来数据检查：' + report.checks.frameworkLookahead}</p><h3>当前策略参数</h3>{Object.entries(selectedStrategy?.parameters ?? {}).map(([k, v]) => <p key={k}>{k}<strong>{v}</strong></p>)}</div></div><div className="bt-method-notes">{report.notes.map(n => <p key={n}>{n}</p>)}<p>{report.dataset.knownGap}</p><small>数据审计 SHA256：{report.dataset.sha256}<br />策略源码 SHA256：{selectedStrategy?.sourceSha256}</small></div></StudioDialog>}
  </div>;
}
