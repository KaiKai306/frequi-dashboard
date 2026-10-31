import { useBot } from '../context/BotContext';
import { useOptionalWorkspace } from '@danfessler/trellis-react';
import { formatUtc8 } from '../utils/dateUtils';

export function FreqUIDashboardView() {
  const { dailyRecords, closedTrades, profitSummary, formatCurrency, setSelectedPair } = useBot();
  const workspace=useOptionalWorkspace();
  const profitClass=(value:number)=>value<0 ? 'terminal-negative' : value>0 ? 'terminal-positive' : '';
  return <div className="terminal-overview terminal-scroll">
    <div className="terminal-overview-summary">
      <span>已平仓 <strong>{profitSummary?.closed_trade_count ?? 0}</strong></span>
      <span>胜率 <strong>{((profitSummary?.winrate ?? 0)*100).toFixed(1)}%</strong></span>
      <span>最大回撤 <strong>{(profitSummary?.max_drawdown_pct ?? 0).toFixed(2)}%</strong></span>
      <span>平均持仓 <strong>{profitSummary?.avg_duration || '—'}</strong></span>
    </div>
    <div className="terminal-overview-tables">
      <section><h2>每日已实现盈亏 <small>最近 10 日</small></h2>
        <table className="terminal-table"><thead><tr><th>日期</th><th className="number">盈亏 / USDT</th><th className="number">成交数</th></tr></thead>
          <tbody>{dailyRecords.slice(0,10).map(day=><tr key={day.date}><td>{day.date}</td><td className={`number ${profitClass(day.abs_profit)}`}>{formatCurrency(day.abs_profit,{showSign:true})}</td><td className="number">{day.trade_count}</td></tr>)}
          {!dailyRecords.length && <tr><td colSpan={3} className="terminal-table-empty">暂无已实现盈亏记录</td></tr>}</tbody>
        </table>
      </section>
      <section><h2>最近平仓 <small>最近 10 笔</small></h2>
        <table className="terminal-table"><thead><tr><th>交易对</th><th>平仓时间</th><th className="number">已实现盈亏</th></tr></thead>
          <tbody>{closedTrades.slice(0,10).map(trade=><tr key={trade.trade_id}><td><button className="terminal-text-button" onClick={()=>{setSelectedPair(trade.pair);workspace?.open('chart',{reuse:'type',params:{pair:trade.pair}});}}>{trade.pair}</button></td><td>{trade.close_timestamp || trade.close_date ? formatUtc8(trade.close_timestamp || trade.close_date!,'MM-DD HH:mm') : '—'}</td><td className={`number ${profitClass(trade.profit_ratio)}`}>{formatCurrency(trade.profit_abs ?? trade.stake_amount*trade.profit_ratio,{showSign:true})}</td></tr>)}
          {!closedTrades.length && <tr><td colSpan={3} className="terminal-table-empty">暂无平仓记录</td></tr>}</tbody>
        </table>
      </section>
    </div>
  </div>;
}
