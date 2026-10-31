import { useMemo, useState } from 'react';
import type { BacktestPoint } from '../types/backtests';

export interface ComparisonLine { id: string; name: string; color: string; points: BacktestPoint[]; dashed?: boolean; }
const day = (stamp: number) => new Date(stamp).toISOString().slice(0, 10);
export function BacktestEquityChart({ lines, drawdown = false }: { lines: ComparisonLine[]; drawdown?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000, H = 300, L = 12, R = 65, T = 23, B = 31;
  const facts = useMemo(() => {
    const times = [...new Set(lines.flatMap(l => l.points.map(p => p[0])))].sort((a, b) => a - b);
    const values = lines.flatMap(l => l.points.map(p => drawdown ? -p[2] : (p[1] / l.points[0][1] - 1) * 100));
    const lower = Math.min(0, ...values), upper = Math.max(0, ...values), pad = Math.max(.3, (upper - lower) * .12);
    return { times, min: lower - pad, max: upper + pad, start: times[0] ?? 0, end: times.at(-1) ?? 1 };
  }, [lines, drawdown]);
  const x = (t: number) => L + (t - facts.start) / Math.max(1, facts.end - facts.start) * (W - L - R);
  const y = (v: number) => T + (facts.max - v) / (facts.max - facts.min) * (H - T - B);
  const value = (p: BacktestPoint, initial: number) => drawdown ? -p[2] : (p[1] / initial - 1) * 100;
  const selected = hover == null ? null : facts.times[Math.min(hover, facts.times.length - 1)];
  const inspect = selected == null ? [] : lines.map(l => { let lo = 0, hi = l.points.length - 1; while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (l.points[mid][0] <= selected) lo = mid; else hi = mid - 1; } return { ...l, point: l.points[lo] }; });
  if (!facts.times.length) return <div className="bt-empty">选择至少一条曲线查看对比。</div>;
  return <div className="bt-equity" onPointerLeave={() => setHover(null)}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={drawdown ? '策略回撤对比，可用方向键查看' : '策略收益曲线对比，可用方向键查看'} tabIndex={0}
      onBlur={() => setHover(null)} onKeyDown={e => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return; e.preventDefault(); setHover(e.key === 'Home' ? 0 : e.key === 'End' ? facts.times.length - 1 : Math.max(0, Math.min(facts.times.length - 1, (hover ?? 0) + (e.key === 'ArrowRight' ? 1 : -1)))); }}
      onPointerMove={e => { const rect = e.currentTarget.getBoundingClientRect(); const t = facts.start + Math.max(0, Math.min(1, ((e.clientX - rect.left) * W / rect.width - L) / (W - L - R))) * (facts.end - facts.start); let i = 0; while (i < facts.times.length - 1 && facts.times[i] < t) i++; setHover(i); }}>
      {[0, .25, .5, .75, 1].map(k => { const v = facts.max - (facts.max - facts.min) * k; return <g key={k}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="studio-grid-line" /><text x={W - R + 11} y={y(v) + 4} className="studio-axis">{v.toFixed(1)}%</text></g>; })}
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--studio-muted)" opacity=".3" strokeDasharray="3 4" />
      {lines.map(l => <path key={l.id} d={l.points.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(2)},${y(value(p, l.points[0][1])).toFixed(2)}`).join(' ')} fill="none" stroke={l.color} strokeWidth={l.dashed ? 1.6 : 2} strokeDasharray={l.dashed ? '6 5' : undefined} strokeLinejoin="round" />)}
      {[0, .25, .5, .75, 1].map(k => { const t = facts.start + (facts.end - facts.start) * k; return <text key={k} x={x(t)} y={H - 5} textAnchor={k === 0 ? 'start' : k === 1 ? 'end' : 'middle'} className="studio-axis">{day(t)}</text>; })}
      {selected != null && <line x1={x(selected)} x2={x(selected)} y1={T} y2={H - B} className="studio-crosshair" />}
    </svg>
    {selected != null && <div className="bt-tooltip"><strong>{day(selected)}</strong>{inspect.map(l => <div key={l.id}><span><i style={{ background: l.color }} />{l.name}</span><b>{value(l.point, l.points[0][1]).toFixed(2)}%</b></div>)}</div>}
  </div>;
}
