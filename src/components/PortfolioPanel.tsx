import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Info, SlidersHorizontal } from 'lucide-react';
import { useBot } from '../context/BotContext';
import { StudioDialog } from './StudioPrimitives';

export function PortfolioPanel({ analysis = false }: { analysis?: boolean }) {
  const { botState, activeTrades, profitSummary, dailyRecords, initialCapital, setInitialCapital, resetInitialCapitalToAuto, isManualCapital, formatCurrency, hideBalances, isConnected } = useBot();
  const [range, setRange] = useState(30);
  const [mode, setMode] = useState<'curve' | 'bars' | 'dual'>('curve');
  const [config, setConfig] = useState(false);
  const [capital, setCapital] = useState(String(initialCapital));
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const id = useId().replace(/:/g, '');
  useEffect(() => { if (!ref.current) return; const ro = new ResizeObserver(entries => setWidth(Math.max(260, entries[0].contentRect.width))); ro.observe(ref.current); return () => ro.disconnect(); }, []);
  const total = botState.total_balance ?? botState.balance;
  const realized = profitSummary?.profit_closed_coin ?? 0;
  const floating = activeTrades.reduce((s, t) => s + (t.profit_abs ?? t.stake_amount * t.profit_ratio), 0);
  const pnl = realized + floating;
  const roi = initialCapital > 0 ? pnl / initialCapital * 100 : null;
  const points = useMemo(() => {
    let value = initialCapital;
    const records = [...dailyRecords].sort((a, b) => a.date.localeCompare(b.date)).map(r => { value += r.abs_profit; return { label: r.date, value, daily: r.abs_profit, count: r.trade_count }; });
    const visible = range ? records.slice(-range) : records;
    const baseline = visible.length ? visible[0].value - visible[0].daily : initialCapital;
    return [{ label: '区间起点', value: baseline, daily: 0, count: 0 }, ...visible, { label: '当前钱包', value: total, daily: floating, count: (profitSummary?.closed_trade_count ?? 0) + activeTrades.length }];
  }, [dailyRecords, initialCapital, total, floating, range, profitSummary?.closed_trade_count, activeTrades.length]);
  const height = analysis ? 285 : 230;
  const left = 5, right = width < 500 ? 53 : 66, top = 20, bottom = 29;
  const curveHeight = mode === 'dual' ? (height - top - bottom) * .61 : height - top - bottom;
  const values = points.map(p => p.value);
  const extent = Math.max(...values) - Math.min(...values);
  const pad = Math.max(extent * .25, Math.abs(total) * .002, 1);
  const min = Math.min(...values) - pad, max = Math.max(...values) + pad;
  const x = (i: number) => left + (width - left - right) * i / Math.max(1, points.length - 1);
  const y = (value: number) => top + (max - value) / (max - min) * curveHeight;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ');
  const floor = top + curveHeight;
  const barTop = mode === 'dual' ? floor + 20 : top;
  const barHeight = height - bottom - barTop;
  const dailyMax = Math.max(1, ...points.map(p => Math.abs(p.daily)));
  const zero = barTop + barHeight * .62;
  const barW = Math.min(22, (width - right) / points.length * .5);
  const formatted = isConnected ? formatCurrency(total).replace(/ USDT$/, '') : '—';
  const [whole, decimals] = formatted.split('.');
  const active = hover == null ? null : points[hover];
  const positive = pnl >= 0;
  const inspectedPnl = active ? (hover === points.length - 1 ? pnl : active.value - initialCapital) : 0;
  const periodDays = points.slice(1, -1);


  return <section className={`studio-card portfolio-panel ${analysis ? 'portfolio-analysis' : ''}`} aria-label="账户净值">
    <header className="studio-card-head"><h2>账户净值 <span>USDT</span></h2><div className="studio-segments" aria-label="净值时间范围">{[[7, '近7天'], [30, '近30天'], [0, '全部']].map(([value, label]) => <button key={value} aria-pressed={range === value} onClick={() => { setRange(Number(value)); setHover(null); }}>{label}</button>)}</div></header>
    <div className="portfolio-headline" aria-label="账户摘要"><div><div className="portfolio-total">{whole}{decimals && <span>.{decimals}</span>}</div><div className="portfolio-return"><span className={positive ? 'studio-positive' : 'studio-negative'}><ArrowUpRight size={14} />{roi == null ? '—' : `${positive ? '+' : ''}${roi.toFixed(2)}%`}</span><span>累计收益率</span><span className="portfolio-return-money">{formatCurrency(pnl, { showSign: true })}</span></div></div><div className="portfolio-side"><span>可用余额</span><strong>{formatCurrency(botState.free_balance ?? botState.balance).replace(/ USDT$/, '')}</strong><span>现货{botState.dry_run ? '模拟' : '账户'}</span></div></div>
    <div className="portfolio-chart-bar"><div className="studio-view-switch">{([['curve', '资产曲线'], ['bars', '每日盈亏'], ['dual', '全景视图']] as const).map(([value, label]) => <button key={value} aria-pressed={mode === value} onClick={() => { setMode(value); setHover(null); }}>{label}</button>)}</div><button className="studio-icon" aria-label="调整初始资金" title="调整初始资金" onClick={() => { setCapital(String(initialCapital)); setConfig(true); }}><SlidersHorizontal size={16} /></button></div>
    <div className="portfolio-chart" ref={ref} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ height }} role="img" tabIndex={0} aria-label="账户净值与每日盈亏走势，可用左右方向键查看日期" onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); setHover(e.key === 'Home' ? 0 : e.key === 'End' ? points.length - 1 : Math.max(0, Math.min(points.length - 1, (hover ?? points.length - 1) + (e.key === 'ArrowLeft' ? -1 : 1)))); } }} onBlur={() => setHover(null)} onPointerMove={e => { const rect = e.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(points.length - 1, Math.round(((e.clientX - rect.left) * width / rect.width - left) / (width - left - right) * (points.length - 1))))); }}>
        <defs><linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="var(--studio-curve)" stopOpacity=".14" /><stop offset="1" stopColor="var(--studio-curve)" stopOpacity="0" /></linearGradient></defs>
        {mode !== 'bars' && <>{[0, .333, .666, 1].map(k => <g key={k}><line x1={left} x2={width - right} y1={top + curveHeight * k} y2={top + curveHeight * k} className="studio-grid-line" /><text x={width - right + 12} y={top + curveHeight * k + 4} className="studio-axis">{hideBalances ? '•••' : (max - (max - min) * k).toLocaleString('en-US', { maximumFractionDigits: 1 })}</text></g>)}<path d={`${line} L${x(points.length - 1)},${floor} L${left},${floor} Z`} fill={`url(#area-${id})`} /><path d={line} fill="none" stroke="var(--studio-curve)" strokeWidth="2" strokeLinejoin="round" /><circle cx={x(points.length - 1)} cy={y(total)} r="7" fill="var(--studio-curve)" opacity=".12" /><circle cx={x(points.length - 1)} cy={y(total)} r="3" fill="var(--studio-curve)" /></>}
        {mode !== 'curve' && <><line x1={left} x2={width - right} y1={zero} y2={zero} className="studio-grid-line" />{points.map((p, i) => { const h = Math.abs(p.daily) / dailyMax * Math.min(barHeight * .34, 65); return <rect key={i} x={x(i) - barW / 2} y={p.daily >= 0 ? zero - h : zero} width={barW} height={h || 1} rx="2" fill={p.daily >= 0 ? 'var(--studio-positive)' : 'var(--studio-negative)'} opacity=".8" />; })}<text x={width - right + 12} y={zero + 4} className="studio-axis">0.00</text></>}
        {[0, Math.round((points.length - 1) / 3), Math.round((points.length - 1) * 2 / 3), points.length - 1].filter((v, i, a) => a.indexOf(v) === i).map(i => <text key={i} x={x(i)} y={height - 4} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} className="studio-axis">{i === 0 ? '起点' : i === points.length - 1 ? '现在' : points[i].label.slice(5).replace('-', '.')}</text>)}
        {active && <><line x1={x(hover!)} x2={x(hover!)} y1={top} y2={height - bottom} className="studio-crosshair" />{mode !== 'bars' && <circle cx={x(hover!)} cy={y(active.value)} r="4" fill="var(--studio-curve)" />}</>}
      </svg>
      {active && <div className="portfolio-tooltip" style={{ left: Math.max(4, Math.min(width - 180, x(hover!) - 80)) }}><span>{active.label}</span><strong>{formatCurrency(mode === 'bars' ? active.daily : active.value)}</strong><dl><div><dt>{hover === points.length - 1 ? '当前浮动' : '当日盈亏'}</dt><dd>{formatCurrency(active.daily, { showSign: true })}</dd></div><div><dt>成交笔数</dt><dd>{active.count}</dd></div><div><dt>累计收益</dt><dd>{formatCurrency(inspectedPnl, { showSign: true })}</dd></div><div><dt>累计收益率</dt><dd>{initialCapital > 0 ? `${(inspectedPnl / initialCapital * 100).toFixed(2)}%` : '—'}</dd></div></dl></div>}
    </div>
    <div className="portfolio-foot-metrics"><div><span>已实现盈亏</span><strong className={realized >= 0 ? 'studio-positive' : 'studio-negative'}>{formatCurrency(realized, { showSign: true }).replace(/ USDT$/, '')}<small> USDT</small></strong><p>已平仓交易累计</p></div><div><span>持仓浮动盈亏</span><strong className={floating < 0 ? 'studio-negative' : ''}>{formatCurrency(floating, { showSign: true }).replace(/ USDT$/, '')}<small> USDT</small></strong><p>当前持仓 {activeTrades.length} 笔</p></div><div><span>累计已平仓</span><strong>{profitSummary?.closed_trade_count ?? 0}<small> 笔</small></strong><p>胜率 {((profitSummary?.winrate ?? 0) * 100).toFixed(1)}%</p></div></div>
    {analysis && <div className="portfolio-analysis-facts"><span>初始资金<strong>{formatCurrency(initialCapital)}</strong></span><span>区间峰值<strong>{formatCurrency(Math.max(...values))}</strong></span><span>盈利 / 亏损日<strong>{periodDays.filter(p => p.daily > 0).length} / {periodDays.filter(p => p.daily < 0).length}</strong></span></div>}
    {analysis && <p className="studio-chart-note"><Info size={13} />历史净值按初始资金与每日已实现盈亏重建；最新点为钱包总值。</p>}
    {config && <StudioDialog title="初始资金设置" onClose={() => setConfig(false)}><p className="studio-dialog-copy">历史净值按初始资金与已实现盈亏计算。当前钱包总值始终使用账户接口数据。</p><label className="studio-field">初始资金 · USDT<input type="number" min="0.01" value={capital} onChange={e => setCapital(e.target.value)} /></label><p className="studio-dialog-copy">当前：{isManualCapital ? '手动设置' : '自动推算'}</p><div className="studio-dialog-actions"><button onClick={() => { resetInitialCapitalToAuto(); setConfig(false); }}>恢复自动</button><button className="studio-primary" disabled={!Number.isFinite(Number(capital)) || Number(capital) <= 0} onClick={() => { setInitialCapital(Number(capital)); setConfig(false); }}>保存</button></div></StudioDialog>}
  </section>;
}
