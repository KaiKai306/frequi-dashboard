import { useBot } from '../context/BotContext';
import { useOptionalWorkspace } from '@danfessler/trellis-react';
import { formatUtc8 } from '../utils/dateUtils';

export function ActiveTradesView() {
  const { activeTrades, setSelectedPair, formatCurrency } = useBot();
  const workspace = useOptionalWorkspace();
  const number = (value:number|undefined) => value==null ? '—' : value.toLocaleString('en-US',{maximumFractionDigits:8});
  return <div className="terminal-table-scroll">
    <table className="terminal-table terminal-positions" aria-label="当前持仓">
      <thead><tr><th>交易对 / 开仓时间</th><th className="number">数量</th><th className="number">投入金额</th><th className="number">开仓价</th><th className="number">当前价</th><th className="number">浮动盈亏</th><th className="number">止损价</th><th>入场信号</th><th/></tr></thead>
      <tbody>{activeTrades.map(trade=><tr key={trade.trade_id}>
        <td><strong>{trade.pair}</strong><small>{formatUtc8(trade.open_timestamp || trade.open_date,'MM-DD HH:mm')}</small></td>
        <td className="number">{number(trade.amount)}</td><td className="number">{formatCurrency(trade.stake_amount)}</td>
        <td className="number">{number(trade.open_rate)}</td><td className="number">{number(trade.current_rate)}</td>
        <td className={`number ${trade.profit_ratio<0 ? 'terminal-negative' : trade.profit_ratio>0 ? 'terminal-positive' : ''}`}>
          {formatCurrency(trade.profit_abs ?? trade.stake_amount*trade.profit_ratio,{showSign:true})}<small>{trade.profit_pct.toFixed(2)}%</small>
        </td>
        <td className="number">{number(trade.stop_loss_abs)}</td><td>{trade.enter_tag || '—'}</td>
        <td><button onClick={()=>{setSelectedPair(trade.pair);workspace?.open('chart',{reuse:'type',params:{pair:trade.pair}});}}>图表</button></td>
      </tr>)}{activeTrades.length===0 && <tr><td colSpan={9} className="terminal-table-empty">暂无持仓 · 策略正在等待入场信号</td></tr>}</tbody>
    </table>
  </div>;
}
