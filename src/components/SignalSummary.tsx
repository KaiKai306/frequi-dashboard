import { lazy, Suspense, useState } from 'react';
import { ArrowUpRight, Activity } from 'lucide-react';
import { useBot } from '../context/BotContext';
import { parseNfiSignal, isNfiStrategy } from '../utils/nfiSignals';
import { StudioDialog } from './StudioPrimitives';
const Reference = lazy(() => import('../views/SignalsView').then(m => ({ default: m.SignalsView })));

export function SignalSummary() {
  const { signals, botState } = useBot();
  const [reference, setReference] = useState(false);
  const nfi = isNfiStrategy(botState.strategy);
  return <div className="studio-signal-summary"><div className="studio-signal-strategy"><Activity size={18} /><div><span>当前策略</span><strong>{botState.strategy}</strong></div></div>
    <p className="studio-signal-caption">按真实入场标签汇总交易表现</p>
    {!signals.length && <div className="studio-empty"><div><strong>等待首笔完成的交易</strong><p>平仓后展示对应信号的统计结果</p></div></div>}
    {signals.map((signal, index) => { const info = parseNfiSignal(signal.tag, true); return <article key={signal.tag} className="studio-signal-item"><header><span className="studio-signal-rank">{String(index + 1).padStart(2, '0')}</span><strong title={info.description}>{signal.tag}</strong>{nfi && <small>{info.category}</small>}</header><div className="studio-signal-contribution"><span>交易收益率合计</span><strong className={signal.total_profit_pct < 0 ? 'studio-negative' : 'studio-positive'}>{signal.total_profit_pct >= 0 ? '+' : ''}{signal.total_profit_pct.toFixed(2)}<small>%</small></strong></div><div className="studio-signal-meter" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, signal.win_rate * 100))}%` }} /></div><dl><div><dt>胜率</dt><dd>{(signal.win_rate * 100).toFixed(1)}%</dd></div><div><dt>累计成交</dt><dd>{signal.total_trades} 笔</dd></div><div><dt>盈利 / 亏损</dt><dd>{signal.win_trades} / {signal.loss_trades}</dd></div><div><dt>平均单笔收益</dt><dd>{signal.avg_profit_pct >= 0 ? '+' : ''}{signal.avg_profit_pct.toFixed(2)}%</dd></div></dl></article>; })}
    {nfi && <button className="studio-card-footer" onClick={() => setReference(true)}>信号分类与说明<ArrowUpRight size={14} /></button>}
    {reference && <StudioDialog title="信号分类与说明" wide onClose={() => setReference(false)}><Suspense fallback={<p>正在加载…</p>}><Reference /></Suspense></StudioDialog>}
  </div>;
}
