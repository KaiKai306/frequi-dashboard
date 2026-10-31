import { useBot } from '../context/BotContext';

export function AccountStrip() {
  const { botState, activeTrades, profitSummary, formatCurrency, isConnected } = useBot();
  const unrealized = activeTrades.reduce((sum,trade)=>sum+(trade.profit_abs ?? trade.stake_amount * trade.profit_ratio),0);
  const value = (amount:number) => isConnected ? formatCurrency(amount) : '—';
  return <div className="terminal-account" aria-label="账户摘要">
    <div><span>钱包总值 <small>USDT</small></span><strong>{value(botState.total_balance ?? botState.balance)}</strong></div>
    <div><span>可用余额</span><strong>{value(botState.free_balance ?? botState.balance)}</strong></div>
    <div><span>已实现盈亏</span><strong className={(profitSummary?.profit_closed_coin ?? 0)<0 ? 'terminal-negative' : (profitSummary?.profit_closed_coin ?? 0)>0 ? 'terminal-positive' : ''}>{value(profitSummary?.profit_closed_coin ?? 0)}</strong></div>
    <div><span>持仓浮动盈亏</span><strong className={unrealized<0 ? 'terminal-negative' : unrealized>0 ? 'terminal-positive' : ''}>{value(unrealized)}</strong></div>
    <div><span>当前持仓 / 上限</span><strong>{isConnected ? `${activeTrades.length} / ${botState.max_open_trades}` : '—'}</strong></div>
  </div>;
}
