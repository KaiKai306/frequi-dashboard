import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Activity, ArrowUpRight, BarChart3, CandlestickChart, ChartNoAxesCombined, CircleHelp, Clock3, Eye, EyeOff, History, LayoutDashboard, LogOut, Moon, RefreshCw, Sun, Terminal } from 'lucide-react';
import { useBot } from '../context/BotContext';
import { DashboardNavigation, type DashboardPage } from '../context/DashboardNavigation';
import { ActiveTradesView } from '../views/ActiveTradesView';
import { BotControlView } from '../views/BotControlView';
import { FreqUIDashboardView } from '../views/FreqUIDashboardView';
import { CockpitMetrics } from './CockpitMetrics';
import { PerformanceSummary } from './PerformanceSummary';
import type { ChartQuote } from '../views/CandleChartView';
import '../styles/cockpit.css';

const CandleChartView = lazy(() => import('../views/CandleChartView').then(m => ({ default: m.CandleChartView })));
const ClosedTradesView = lazy(() => import('../views/ClosedTradesView').then(m => ({ default: m.ClosedTradesView })));
const BotLogsView = lazy(() => import('../views/BotLogsView').then(m => ({ default: m.BotLogsView })));
const EquityCurveView = lazy(() => import('../views/EquityCurveView').then(m => ({ default: m.EquityCurveView })));
const SignalsView = lazy(() => import('../views/SignalsView').then(m => ({ default: m.SignalsView })));
const Loading = () => <div className="cockpit-loading">正在加载数据视图…</div>;
const navigation = [
  { id: 'trading', label: '交易总览', icon: LayoutDashboard, description: '行情、持仓与策略状态' },
  { id: 'analysis', label: '收益分析', icon: ChartNoAxesCombined, description: '资金曲线与策略表现' },
  { id: 'history', label: '成交记录', icon: History, description: '已平仓交易与历史记录' },
  { id: 'logs', label: '运行日志', icon: Terminal, description: '策略运行与连接事件' },
] as const;

function Panel({ title, icon, children, className = '', extra }: { title: string; icon: ReactNode; children: ReactNode; className?: string; extra?: ReactNode }) {
  return <section className={`cockpit-panel ${className}`} aria-label={title}>
    <header className="cockpit-panel-heading"><h2>{icon}{title}</h2>{extra}</header>
    <div className="cockpit-panel-content">{children}</div>
  </section>;
}

export function FixedDashboard() {
  const { botState, activeTrades, activeBotId, selectedPair, isConnected, isConnecting, refreshData, theme, setTheme,
    refreshCountdown, refreshInterval, setRefreshInterval, deleteProfile, hideBalances, toggleHideBalances } = useBot();
  const [page, setPage] = useState<DashboardPage>('trading');
  const [positionsTab, setPositionsTab] = useState<'active' | 'closed'>('active');
  const [refreshing, setRefreshing] = useState(false);
  const [quote, setQuote] = useState<ChartQuote | null>(null);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) setClock(new Date()); }, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const currentPage = navigation.find(item => item.id === page)!;
  const currentQuote = quote?.pair === selectedPair ? quote : null;
  const quoteAge = currentQuote ? clock.getTime() - currentQuote.updatedAt : Infinity;
  const refresh = async () => {
    setRefreshing(true);
    try { await refreshData(undefined, true); } finally { setRefreshing(false); }
  };
  return <DashboardNavigation.Provider value={setPage}>
    <div className="terminal-shell cockpit-shell">
      <aside className="cockpit-sidebar" aria-label="主导航">
        <div className="cockpit-logo" title="Happykai"><CandlestickChart size={27} /><span>HK</span></div>
        <nav>{navigation.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setPage(id)} aria-current={page === id ? 'page' : undefined}>
          <Icon size={21} /><span>{label}</span>
        </button>)}</nav>
        <a href="/" className="cockpit-original" title="打开原版面板"><ArrowUpRight size={20} /><span>原版面板</span></a>
        <div className="cockpit-sidebar-foot"><span className="cockpit-node-mark">JP</span><span>日本节点</span></div>
      </aside>
      <div className="cockpit-body">
        <header className="cockpit-header">
          <div className="cockpit-wordmark"><strong>Happykai</strong><span>量化交易工作台</span></div>
          <div className="cockpit-header-controls">
            <span className={`cockpit-connection ${isConnected ? 'connected' : ''}`} role="status"><i />{isConnecting ? '正在连接' : isConnected ? '日本节点已连接' : '连接中断'}</span>
            <div className="cockpit-refresh-controls">
              <select aria-label="自动刷新间隔" value={refreshInterval} onChange={event => setRefreshInterval(Number(event.target.value))}>
                <option value={6}>6 秒更新</option><option value={15}>15 秒更新</option><option value={30}>30 秒更新</option><option value={0}>手动更新</option>
              </select>
              <button onClick={refresh} disabled={refreshing} aria-label="刷新" title="刷新数据"><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /></button>
            </div>
            <button onClick={toggleHideBalances} aria-label={hideBalances ? '显示金额' : '隐藏金额'} title={hideBalances ? '显示金额' : '隐藏金额'}>{hideBalances ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? '切换浅色' : '切换深色'} title={theme === 'dark' ? '切换浅色' : '切换深色'}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
            <button onClick={() => { if (activeBotId) deleteProfile(activeBotId); }} aria-label="退出登录" title="退出登录"><LogOut size={16} /></button>
          </div>
        </header>
        <main className={`cockpit-page cockpit-page-${page}`}>
          <div className="cockpit-page-heading">
            <div><h1>{currentPage.label}<span className="cockpit-mode">{botState.dry_run ? '现货模拟' : '实盘数据'}</span></h1><p>{currentPage.description}</p></div>
            <div className="cockpit-clock"><Clock3 size={14} /><time>{clock.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</time><span>UTC+8</span></div>
          </div>
          <CockpitMetrics />
          {page === 'trading' && <div className="cockpit-trading-grid">
            <Panel title="市场行情" icon={<CandlestickChart size={17} />} className="cockpit-chart-panel" extra={<span className="cockpit-panel-note">K 线 · 30 秒更新</span>}>
              <div className="cockpit-quote" aria-label="最新K线行情">
                <div><strong>{selectedPair || '等待行情'}</strong><span>Binance Spot</span></div>
                {currentQuote ? <><strong className="cockpit-quote-price" key={`${currentQuote.pair}:${currentQuote.timeframe}:${currentQuote.close}`}>{currentQuote.close.toLocaleString('en-US', { maximumFractionDigits: 2 })}<small> USDT</small></strong>
                  <span className={`cockpit-quote-change ${currentQuote.change < 0 ? 'negative' : 'positive'}`}>{currentQuote.change >= 0 ? '+' : ''}{currentQuote.change.toFixed(2)}%<small>本根 {currentQuote.timeframe} K线</small></span>
                  <span className={`cockpit-quote-status ${quoteAge > 90000 ? 'stale' : ''}`}>{quoteAge > 90000 ? '行情待更新' : '行情已更新'}</span>
                </> : <span className="cockpit-panel-note">正在读取最新 K 线…</span>}
              </div>
              <div className="cockpit-chart-view"><Suspense fallback={<Loading />}><CandleChartView onQuote={setQuote} /></Suspense></div>
            </Panel>
            <Panel title="策略运行" icon={<Activity size={17} />} className="cockpit-strategy-panel" extra={<span className={`cockpit-state-badge ${isConnected && botState.state === 'running' ? 'running' : ''}`}>{!isConnected ? '未连接' : botState.state === 'running' ? '运行中' : '已停止'}</span>}><BotControlView /></Panel>
            <section className="cockpit-panel cockpit-positions-panel" aria-label="持仓与成交">
              <header className="cockpit-panel-heading">
                <div className="cockpit-tabs" role="tablist" aria-label="持仓和成交">
                  <button role="tab" id="positions-active-tab" aria-selected={positionsTab === 'active'} aria-controls="cockpit-positions-content" onClick={() => setPositionsTab('active')}>当前持仓 <span>{activeTrades.length}</span></button>
                  <button role="tab" id="positions-closed-tab" aria-selected={positionsTab === 'closed'} aria-controls="cockpit-positions-content" onClick={() => setPositionsTab('closed')}>历史成交</button>
                </div>
                <span className="cockpit-panel-note">持仓上限 {botState.max_open_trades} 笔</span>
              </header>
              <div className="cockpit-panel-content" id="cockpit-positions-content" role="tabpanel" aria-labelledby={positionsTab === 'active' ? 'positions-active-tab' : 'positions-closed-tab'}>{positionsTab === 'active' ? <ActiveTradesView /> : <Suspense fallback={<Loading />}><ClosedTradesView /></Suspense>}</div>
            </section>
            <Panel title="策略表现" icon={<BarChart3 size={17} />} className="cockpit-performance-panel" extra={<button className="cockpit-link-button" onClick={() => setPage('analysis')}>查看分析 <ArrowUpRight size={13} /></button>}><PerformanceSummary /></Panel>
          </div>}
          {page === 'analysis' && <div className="cockpit-analysis-grid">
            <Panel title="运行概览" icon={<BarChart3 size={17} />} className="cockpit-overview-panel"><FreqUIDashboardView /></Panel>
            <Panel title="资金曲线" icon={<ChartNoAxesCombined size={17} />}><Suspense fallback={<Loading />}><EquityCurveView /></Suspense></Panel>
            <Panel title="信号统计" icon={<Activity size={17} />}><Suspense fallback={<Loading />}><SignalsView /></Suspense></Panel>
          </div>}
          {page === 'history' && <Panel title="历史成交" icon={<History size={17} />} className="cockpit-full-panel"><Suspense fallback={<Loading />}><ClosedTradesView /></Suspense></Panel>}
          {page === 'logs' && <Panel title="运行日志" icon={<Terminal size={17} />} className="cockpit-full-panel"><Suspense fallback={<Loading />}><BotLogsView /></Suspense></Panel>}
        </main>
        <footer className="cockpit-footer"><span><CircleHelp size={12} />只读预览</span><span>{botState.strategy} · {botState.timeframe}</span><span className="cockpit-refresh-progress">{refreshInterval > 0 ? <><i style={{ transform: `scaleX(${Math.max(0, Math.min(1, refreshCountdown / refreshInterval))})` }} />{refreshCountdown}s 后更新</> : '手动更新'}</span></footer>
      </div>
    </div>
  </DashboardNavigation.Provider>;
}
