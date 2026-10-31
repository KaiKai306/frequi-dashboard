import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Activity, ArrowUpRight, ChevronRight, Eye, EyeOff, LogOut, Moon, RefreshCw, ShieldCheck, Sun, Wallet } from 'lucide-react';
import { useBot } from '../context/BotContext';
import { DashboardNavigation, useOpenChart, type DashboardPage } from '../context/DashboardNavigation';
import { WalletBalanceModal } from './WalletBalanceModal';
import { SignalSummary } from './SignalSummary';
import { PortfolioPanel } from './PortfolioPanel';
import { Coin, StudioDialog } from './StudioPrimitives';
import { ActiveTradesView } from '../views/ActiveTradesView';
import { FreqUIDashboardView } from '../views/FreqUIDashboardView';
import { formatUtc8 } from '../utils/dateUtils';
import type { Trade } from '../types';
import type { ChartQuote } from '../views/CandleChartView';
import '../styles/modern.css';

const CandleChartView = lazy(() => import('../views/CandleChartView').then(m => ({ default: m.CandleChartView })));
const ClosedTradesView = lazy(() => import('../views/ClosedTradesView').then(m => ({ default: m.ClosedTradesView })));
const BotLogsView = lazy(() => import('../views/BotLogsView').then(m => ({ default: m.BotLogsView })));
type Page = DashboardPage | 'overview';
const tabs: { id: Page; label: string }[] = [{ id: 'overview', label: '账户总览' }, { id: 'trading', label: '行情与持仓' }, { id: 'analysis', label: '收益分析' }, { id: 'history', label: '成交记录' }, { id: 'logs', label: '运行日志' }];
const Loading = () => <div className="studio-loading">正在读取数据…</div>;
function Card({ title, children, extra, className = '' }: { title: string; children: ReactNode; extra?: ReactNode; className?: string }) {
  return <section className={`studio-card ${className}`} aria-label={title}><header className="studio-card-head"><h2>{title}</h2>{extra}</header><div className="studio-card-body">{children}</div></section>;
}

function Allocation() {
  const { botState, isConnected, formatCurrency, theme } = useBot();
  const [wallet, setWallet] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const total = botState.total_balance ?? botState.balance, free = botState.free_balance ?? botState.balance;
  const valid = isConnected && total > 0 && free >= 0 && free <= total + .01;
  const used = valid ? Math.max(0, total - free) : 0;
  const assets = (botState.currencies ?? []).filter(c => c.currency !== botState.stake_currency && (c.est_stake ?? 0) > 0);
  const known = assets.reduce((s, c) => s + (c.est_stake ?? 0), 0);
  const exactAssets = assets.length > 0 && Math.abs(known - used) < Math.max(.02, total * .001);
  const rows = [{ name: '可用资金', symbol: botState.stake_currency || 'USDT', value: free }, ...(exactAssets ? assets.map(c => ({ name: c.currency === 'BTC' ? 'Bitcoin' : c.currency === 'ETH' ? 'Ethereum' : c.currency, symbol: c.currency, value: c.est_stake ?? 0 })) : [{ name: '持仓 / 占用', symbol: '已占用资金', value: used }])];
  const colors = ['#d3d3d3', '#8b8b91', '#aaa2c5', '#6b6b75'];
  let cursor = -Math.PI / 2;
  const slices = rows.map((r, i) => { const a = cursor; cursor += valid ? Math.PI * 2 * r.value / total : 0; return { ...r, a: a + .014, b: cursor - .014, i }; });
  const ring = (a: number, b: number, dy = 0) => { const point = (r: number, ry: number, t: number) => `${170 + r * Math.cos(t)},${121 + dy + ry * Math.sin(t)}`; return `M${point(125, 74, a)} A125,74 0 ${b - a > Math.PI ? 1 : 0} 1 ${point(125, 74, b)} L${point(91, 52, b)} A91,52 0 ${b - a > Math.PI ? 1 : 0} 0 ${point(91, 52, a)} Z`; };
  return <Card title="资金分布" className="allocation-card" extra={<span className="studio-micro">ALLOCATION</span>}><div className="studio-orbit"><svg viewBox="0 0 340 260" aria-hidden="true"><defs>{colors.map((c, i) => <linearGradient key={i} id={`metal-${i}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor={c} /><stop offset=".5" stopColor={c} stopOpacity=".65" /><stop offset="1" stopColor={c} /></linearGradient>)}</defs><ellipse cx="170" cy="127" rx="156" ry="100" fill="none" stroke="var(--studio-border)" strokeDasharray="2 5" transform="rotate(-12 170 127)" /><ellipse cx="170" cy="127" rx="145" ry="110" fill="none" stroke="var(--studio-border)" opacity=".5" transform="rotate(25 170 127)" />{!valid && <ellipse cx="170" cy="121" rx="108" ry="63" fill="none" stroke="var(--studio-border)" strokeWidth="28" />}{slices.filter(s => s.b > s.a).map(s => <g key={s.i} opacity={hover != null && hover !== s.i ? .3 : 1} onPointerEnter={() => setHover(s.i)} onPointerLeave={() => setHover(null)}><path d={ring(s.a, s.b, 10)} fill={colors[s.i % colors.length]} opacity=".28" /><path d={ring(s.a, s.b)} fill={`url(#metal-${s.i % colors.length})`} stroke="#ffffff15" strokeWidth="1" /></g>)}</svg><div className="studio-ring-label"><span>{hover == null ? '持仓占比' : rows[hover].name}</span><strong>{valid ? ((hover == null ? used : rows[hover].value) / total * 100).toFixed(1) : '—'}<small>%</small></strong></div></div><div className="studio-allocation-list">{rows.map((r, i) => <button key={r.symbol} onClick={() => setWallet(true)} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}><i style={{ background: colors[i % colors.length] }} /><span>{r.name}<small>{r.symbol}</small></span><span className="studio-allocation-value">{valid ? formatCurrency(r.value).replace(/ USDT$/, '') : '—'}<small>{valid ? `${(r.value / total * 100).toFixed(1)}%` : '—'}</small></span></button>)}</div><button className="studio-card-footer" onClick={() => setWallet(true)} aria-label="查看钱包明细"><Wallet size={14} />查看钱包明细<ArrowUpRight size={14} /></button><WalletBalanceModal isOpen={wallet} onClose={() => setWallet(false)} stakeCurrency={botState.stake_currency} currencyUnit="USDT" stakeBalance={botState.balance} stakeFree={free} totalBalance={total} currencies={botState.currencies} formatCurrency={formatCurrency} isDark={theme === 'dark'} /></Card>;
}

function Strategy() {
  const { botState, activeTrades, isConnected, formatCurrency } = useBot();
  const [open, setOpen] = useState(false);
  const openChart = useOpenChart();
  const running = isConnected && botState.state === 'running';
  const max = botState.max_open_trades;
  const status = !isConnected ? '未连接' : botState.state === 'running' ? '运行中' : botState.state === 'stopped' ? '已停止' : '重载中';
  return <Card title="策略状态" className="strategy-card" extra={<span className={`studio-status-chip ${running ? 'running' : ''}`}><i />{status}</span>}><div className="studio-strategy-name"><span className="studio-strategy-icon"><Activity size={23} strokeWidth={1.2} /></span><div><h3>{botState.strategy === 'BaselineSmaTrend4h' ? '双均线趋势' : botState.strategy}</h3><p>{botState.strategy}</p></div><strong>{botState.timeframe}</strong></div><div className="studio-capacity"><span>持仓名额</span><strong>{activeTrades.length}<small> / {max < 0 ? '不限' : max}</small></strong></div><div className="studio-capacity-track">{Array.from({ length: max > 0 ? Math.min(max, 20) : 8 }, (_, i) => <i key={i} className={i < activeTrades.length ? 'filled' : ''} />)}</div><div className="studio-strategy-pairs">{botState.whitelist.map(pair => <button key={pair} onClick={() => openChart(pair)}>{pair}<ArrowUpRight size={12} /></button>)}</div><button className="studio-card-footer" onClick={() => setOpen(true)}><ShieldCheck size={14} /><span>策略参数与运行信息</span><ChevronRight size={14} /></button>{open && <StudioDialog title="策略参数" onClose={() => setOpen(false)}><dl className="studio-details">{[['策略', botState.strategy], ['运行状态', status], ['策略周期', botState.timeframe], ['运行模式', botState.dry_run ? '现货模拟' : '实盘数据'], ['单笔投入', Number.isFinite(Number(botState.stake_amount)) ? formatCurrency(Number(botState.stake_amount)) : botState.stake_amount], ['持仓上限', max < 0 ? '不限' : `${max} 笔`], ['计价币种', botState.stake_currency], ['Freqtrade', botState.version]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><p className="studio-dialog-copy">当前工作空间只读。交易控制与配置可前往<a href="/">原版面板 ↗</a>。</p></StudioDialog>}</Card>;
}

function Positions({ onDetail, onHistory }: { onDetail: (t: Trade) => void; onHistory: () => void }) {
  const { activeTrades, formatCurrency, hideBalances } = useBot();
  const [full, setFull] = useState(false);
  const openChart = useOpenChart();
  return <Card title="当前持仓" className="positions-card" extra={<div className="studio-card-actions"><span className="studio-count">{String(activeTrades.length).padStart(2, '0')}</span><button aria-pressed={full} onClick={() => setFull(!full)}>{full ? '简洁视图' : '完整字段'}</button><button onClick={onHistory}>成交记录<ArrowUpRight size={13} /></button></div>}>{full ? <ActiveTradesView onDetail={onDetail} /> : <div className="studio-table-scroll"><table className="studio-positions" aria-label="当前持仓"><thead><tr><th>交易对</th><th>持仓数量</th><th>当前价 <small>USDT</small></th><th>浮动盈亏 <small>USDT</small></th><th /></tr></thead><tbody>{activeTrades.map(t => <tr key={t.trade_id}><td><button className="studio-asset" onClick={() => onDetail(t)}><Coin pair={t.pair} /><span>{t.pair}<small>{t.pair.startsWith('BTC') ? 'Bitcoin' : t.pair.startsWith('ETH') ? 'Ethereum' : '现货'} · {formatUtc8(t.open_timestamp || t.open_date, 'MM-DD HH:mm')}</small></span></button></td><td>{hideBalances ? '••••••' : t.amount.toLocaleString('en-US', { maximumFractionDigits:8 })}<small>{t.pair.split('/')[0]}</small></td><td>{t.current_rate?.toLocaleString('en-US', { maximumFractionDigits: 2 }) ?? '—'}</td><td className={t.profit_ratio < 0 ? 'studio-negative' : 'studio-positive'}>{formatCurrency(t.profit_abs ?? t.stake_amount * t.profit_ratio, { showSign: true }).replace(/ USDT$/, '')}<small>{(t.profit_ratio * 100).toFixed(2)}%</small></td><td><div className="studio-row-actions"><button aria-label="详情" onClick={() => onDetail(t)}><ChevronRight size={17} /></button><button onClick={() => openChart(t.pair)}>图表<ArrowUpRight size={13} /></button></div></td></tr>)}</tbody></table>{!activeTrades.length && <div className="studio-empty"><Activity size={26} /><div><strong>等待下一次入场</strong><p>暂无持仓 · 策略正在等待入场信号</p></div></div>}</div>}<div className="studio-position-foot"><span><i />数据随账户自动更新</span><span>完整价格、止损与入场信号可在详情查看</span></div></Card>;
}

function PerformanceStrip() {
  const { profitSummary, formatCurrency, activeTrades } = useBot();
  return <div className="studio-performance-strip">{[['已实现盈亏', formatCurrency(profitSummary?.profit_closed_coin ?? 0, { showSign: true })], ['胜率', `${((profitSummary?.winrate ?? 0) * 100).toFixed(1)}%`], ['最大回撤', `${(profitSummary?.max_drawdown_pct ?? 0).toFixed(2)}%`], ['当前持仓', `${activeTrades.length} 笔`]].map(([k, v]) => <div key={k}><span>{k}</span><strong>{v}</strong></div>)}</div>;
}

export function ModernDashboard() {
  const { botState, activeBotId, isConnected, isConnecting, refreshData, theme, setTheme, refreshCountdown, refreshInterval, setRefreshInterval, deleteProfile, hideBalances, toggleHideBalances, selectedPair, lastError, formatCurrency } = useBot();
  const [page, setPage] = useState<Page>('overview');
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => { mainRef.current?.scrollTo({ top: 0, left: 0 }); }, [page]);
  const [refreshing, setRefreshing] = useState(false);
  const [quote, setQuote] = useState<ChartQuote | null>(null);
  const [detail, setDetail] = useState<Trade | null>(null);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => { if (!document.hidden) setClock(new Date()); }, 1000); return () => clearInterval(timer); }, []);
  const refresh = async () => { setRefreshing(true); try { await refreshData(undefined, true); } finally { setRefreshing(false); } };
  const currentQuote = quote?.pair === selectedPair ? quote : null;
  return <DashboardNavigation.Provider value={setPage}><div className="modern-shell studio-shell"><header className="studio-header"><a className="studio-brand" href="#" onClick={e => { e.preventDefault(); setPage('overview'); }}><svg viewBox="0 0 36 36" aria-hidden="true"><path d="M9 7v22M27 7 9 25m10-10 9 14" /></svg><span>Happykai</span></a><nav aria-label="主导航">{tabs.map(tab => <button key={tab.id} onClick={() => setPage(tab.id)} aria-current={page === tab.id ? 'page' : undefined}>{tab.label}</button>)}</nav><div className="studio-header-tools"><button className="studio-icon" aria-label={hideBalances ? '显示金额' : '隐藏金额'} onClick={toggleHideBalances}>{hideBalances ? <EyeOff size={18} /> : <Eye size={18} />}</button><button className="studio-icon" aria-label={theme === 'dark' ? '切换浅色' : '切换深色'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button><a href="/" className="studio-original">原版面板<ArrowUpRight size={13} /></a><button className="studio-avatar" aria-label="退出登录" title="退出登录" onClick={() => activeBotId && deleteProfile(activeBotId)}><LogOut size={16} /></button></div></header>
    <main ref={mainRef} className={`studio-main studio-page-${page}`}><div className="studio-workspace-bar"><div><span className="studio-workspace-name">{botState.dry_run ? '现货模拟账户' : '现货账户'}</span><span className="studio-workspace-tag">BINANCE / USDT</span><span className="studio-readonly">只读</span></div><div className="studio-connection-tools"><span className={`studio-connection ${isConnected ? 'connected' : ''}`} role="status"><i />{isConnecting ? '正在连接' : isConnected ? '日本节点已连接' : '连接中断'}</span><span className="studio-refresh-count">{refreshInterval > 0 ? `${refreshCountdown}s 后更新` : '手动更新'}</span><select aria-label="自动刷新间隔" value={refreshInterval} onChange={e => setRefreshInterval(Number(e.target.value))}><option value={6}>6 秒</option><option value={15}>15 秒</option><option value={30}>30 秒</option><option value={0}>手动</option></select><button className="studio-icon" aria-label="刷新" disabled={refreshing} onClick={refresh}><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /></button></div></div>
    {lastError && <div className="studio-error" role="alert">{lastError} · 当前显示最近一次读取的数据<button onClick={refresh}>重试</button></div>}
    {page === 'overview' && <><div className="studio-overview-grid"><PortfolioPanel /><Allocation /></div><div className="studio-bottom-grid"><Positions onDetail={setDetail} onHistory={() => setPage('history')} /><Strategy /></div></>}
    {page === 'trading' && <><div className="studio-market-grid"><Card title="市场行情" className="studio-market-card" extra={<span className="studio-micro">BINANCE SPOT</span>}><div className="studio-market-quote"><Coin pair={selectedPair} /><div><strong>{selectedPair || '等待行情'}</strong><small>实时市场观察</small></div><div className="studio-market-price">{currentQuote ? currentQuote.close.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}<small>USDT</small></div>{currentQuote && <span className={currentQuote.change < 0 ? 'studio-negative' : 'studio-positive'}>{currentQuote.change >= 0 ? '+' : ''}{currentQuote.change.toFixed(2)}%<small>本根 {currentQuote.timeframe} K 线</small></span>}<span className="studio-market-fresh">{currentQuote && clock.getTime() - currentQuote.updatedAt < 90000 ? '行情已更新' : '行情待更新'}</span></div><div className="studio-chart-engine"><Suspense fallback={<Loading />}><CandleChartView onQuote={setQuote} /></Suspense></div></Card><div className="studio-market-aside"><Strategy /><Allocation /></div></div><Positions onDetail={setDetail} onHistory={() => setPage('history')} /></>}
    {page === 'analysis' && <><PerformanceStrip /><div className="studio-analysis-grid"><PortfolioPanel analysis /><Card title="信号统计" className="studio-signals"><SignalSummary /></Card></div><Card title="运行概览" className="studio-recent"><FreqUIDashboardView /></Card></>}
    {page === 'history' && <><PerformanceStrip /><Card title="历史成交" className="studio-history"><Suspense fallback={<Loading />}><ClosedTradesView /></Suspense></Card></>}
    {page === 'logs' && <Card title="运行日志" className="studio-logs"><Suspense fallback={<Loading />}><BotLogsView /></Suspense></Card>}
    <footer className="studio-footer"><span><i />Happykai <span>/</span>量化工作空间</span><span>{clock.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })} UTC+8<a href="/preview/legacy-fixed-cockpit/">旧版中文面板 ↗</a></span></footer></main>
    {detail && <StudioDialog title="持仓详情" onClose={() => setDetail(null)}><div className="studio-detail-hero"><Coin pair={detail.pair} /><div><h3>{detail.pair}</h3><span>现货持仓</span></div><strong className={detail.profit_ratio < 0 ? 'studio-negative' : 'studio-positive'}>{formatCurrency(detail.profit_abs ?? detail.stake_amount * detail.profit_ratio, { showSign: true })}</strong></div><dl className="studio-details">{[['开仓时间', formatUtc8(detail.open_timestamp || detail.open_date, 'YYYY-MM-DD HH:mm:ss')], ['数量', hideBalances ? '••••••' : detail.amount.toLocaleString('en-US', { maximumFractionDigits: 8 })], ['投入金额', formatCurrency(detail.stake_amount)], ['开仓价', detail.open_rate.toLocaleString('en-US')], ['当前价', detail.current_rate?.toLocaleString('en-US') ?? '—'], ['收益率', `${(detail.profit_ratio * 100).toFixed(2)}%`], ['止损价', detail.stop_loss_abs?.toLocaleString('en-US') ?? '—'], ['入场信号', detail.enter_tag || '—']].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><button className="studio-primary studio-wide" onClick={() => setDetail(null)}>关闭</button></StudioDialog>}
  </div></DashboardNavigation.Provider>;
}
