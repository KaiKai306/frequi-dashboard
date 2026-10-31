import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ChevronLeft, ChevronRight } from 'lucide-react';
import { useBot } from '../context/BotContext';
import { fetchBacktestStudySummary } from '../api/backtests';
import type { BacktestStudyRow, BacktestStudySummary } from '../types/backtests';

const pct = (value: number | undefined) => value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
export function BacktestCrossComparison({ path, period, cost, stake, timeframe, onSelect }: {
  path: string; period: string; cost: string; stake: number; timeframe: string; onSelect: (row: BacktestStudyRow) => void;
}) {
  const { config, hideBalances, formatCurrency } = useBot();
  const [open, setOpen] = useState(false), [summary, setSummary] = useState<BacktestStudySummary | null>(null);
  const [error, setError] = useState(''), [revision, setRevision] = useState(0), [allStakes, setAllStakes] = useState(false);
  const [sort, setSort] = useState('family'), [maxDrawdown, setMaxDrawdown] = useState(100), [page, setPage] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); setError('');
    fetchBacktestStudySummary(path, { username: config.username, password: config.password, apiUrl: '/preview/bot' }, controller.signal).then(setSummary).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '暂时无法读取比较。'); });
    return () => controller.abort();
  }, [open, path, config.username, config.password, revision]);
  useEffect(() => setPage(0), [period, cost, stake, allStakes, sort, maxDrawdown]);
  const rows = useMemo(() => {
    const filtered = summary?.runs.filter(r => r.period === period && r.cost === cost && (allStakes || r.stake === stake) && r.drawdownPct <= maxDrawdown) ?? [];
    return filtered.sort((a, b) => sort === 'return' ? b.returnPct - a.returnPct : sort === 'drawdown' ? a.drawdownPct - b.drawdownPct : a.name.localeCompare(b.name, 'zh-CN') || a.stake - b.stake || ({ '4h': 0, '1h': 1, '15m': 2 }[a.timeframe] ?? 0) - ({ '4h': 0, '1h': 1, '15m': 2 }[b.timeframe] ?? 0));
  }, [summary, period, cost, stake, allStakes, sort, maxDrawdown]);
  const exportRows = () => {
    const records = [['策略', '周期', '单笔USDT', '区间', '成本', '累计账户收益%', '区间年化CAGR%', '净值最大回撤%', '成交数', '近似成本USDT', '平均持仓占比%'], ...rows.map(r => [r.name, r.timeframe, r.stake, period, cost, r.returnPct, r.cagrPct ?? '', r.drawdownPct, r.trades, r.fees, r.exposurePct ?? ''])];
    const content = '\uFEFF' + records.map(row => row.map(v => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `跨周期比较-${period}-${cost}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="studio-card bt-cross" aria-label="跨周期与仓位比较">
    <header className="studio-card-head"><h2>跨周期与仓位比较</h2><button className="bt-inline-link" aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? '收起比较' : '展开比较'}</button></header>
    {open && <>
      <div className="bt-cross-controls"><label><input type="checkbox" checked={allStakes} onChange={e => setAllStakes(e.target.checked)} />同时比较三种仓位</label><label>排序<select aria-label="跨周期排序" value={sort} onChange={e => setSort(e.target.value)}><option value="family">按策略分组</option><option value="return">累计收益从高到低</option><option value="drawdown">最大回撤从低到高</option></select></label><label>当前区间回撤<select aria-label="回撤筛选参考" value={maxDrawdown} onChange={e => setMaxDrawdown(Number(e.target.value))}><option value={100}>不限</option><option value={10}>≤ 10%</option><option value={20}>≤ 20%</option><option value={30}>≤ 30%</option></select></label><button className="bt-button" disabled={hideBalances || !summary} onClick={exportRows}><ArrowDownToLine size={13} />导出跨周期比较</button></div>
      {error && <div className="studio-error" role="alert">{error}<button className="bt-inline-link" onClick={() => setRevision(v => v + 1)}>重新读取比较</button></div>}
      {!summary && !error ? <div className="bt-empty">正在读取全部历史比较…</div> : <><div className="bt-table-scroll"><table className="bt-table"><thead><tr><th>策略</th><th>周期</th><th>单笔投入</th><th>累计账户收益</th><th>区间年化 CAGR</th><th>净值最大回撤</th><th>成交数</th><th>近似交易成本</th><th>平均持仓占比</th><th /></tr></thead><tbody>{rows.slice(page * 21, (page + 1) * 21).map(r => <tr key={r.id} data-selected={r.timeframe === timeframe && r.stake === stake}><td>{r.name}</td><td>{r.timeframe}</td><td>{formatCurrency(r.stake)}</td><td className={r.returnPct < 0 ? 'studio-negative' : 'studio-positive'}>{pct(r.returnPct)}</td><td>{pct(r.cagrPct)}</td><td>{r.drawdownPct.toFixed(2)}%</td><td>{r.trades}</td><td>{formatCurrency(r.fees)}</td><td>{r.exposurePct?.toFixed(1) ?? '—'}%</td><td><button className="bt-inline-link" aria-label={`查看${r.name} ${r.timeframe} 单笔${r.stake}详情`} onClick={() => onSelect(r)}>查看详情<ChevronRight size={12} /></button></td></tr>)}{!rows.length && <tr><td colSpan={10} className="bt-empty">当前参考条件下没有方案。</td></tr>}</tbody></table></div><div className="bt-pagination"><span>当前区间与成本 · {rows.length} 个方案 · 第 {page + 1} / {Math.max(1, Math.ceil(rows.length / 21))} 页</span><button aria-label="跨周期上一页" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft size={15} /></button><button aria-label="跨周期下一页" disabled={(page + 1) * 21 >= rows.length} onClick={() => setPage(p => p + 1)}><ChevronRight size={15} /></button></div></>}
      <p className="bt-chart-caption bt-cross-note">使用上方区间与成本。仓位不同会改变风险；CAGR 为历史区间年化换算，回撤筛选不能保证未来上限。点击详情仅切换研究视图。</p>
    </>}
  </section>;
}
