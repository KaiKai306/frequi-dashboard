import { Activity, Coins, TrendingUp, Wallet } from 'lucide-react';
import { useBot } from '../context/BotContext';

export function CockpitMetrics() {
  const { botState, activeTrades, profitSummary, formatCurrency, isConnected } = useBot();
  const unrealized = activeTrades.reduce((sum, trade) => sum + (trade.profit_abs ?? trade.stake_amount * trade.profit_ratio), 0);
  const realized = profitSummary?.profit_closed_coin ?? 0;
  const metrics = [
    { label: '钱包总值', amount: botState.total_balance ?? botState.balance, icon: Wallet, detail: botState.dry_run ? '模拟资金 · USDT' : '账户估值 · USDT', tone: '' },
    { label: '可用余额', amount: botState.free_balance ?? botState.balance, icon: Coins, detail: '可用于策略开仓的资金', tone: '' },
    { label: '已实现盈亏', amount: realized, icon: TrendingUp, detail: `累计平仓 ${profitSummary?.closed_trade_count ?? 0} 笔`, tone: realized < 0 ? 'negative' : realized > 0 ? 'positive' : '' },
    { label: '持仓浮动盈亏', amount: unrealized, icon: Activity, detail: `当前持仓 ${activeTrades.length} / ${botState.max_open_trades}`, tone: unrealized < 0 ? 'negative' : unrealized > 0 ? 'positive' : '' },
  ];
  return <section className="cockpit-metrics" aria-label="账户摘要">
    {metrics.map(({ label, amount, icon: Icon, detail, tone }) => {
      const formatted = isConnected ? formatCurrency(amount) : '—';
      return <div className="cockpit-metric" key={label}>
        <div className="cockpit-metric-label"><span>{label}</span><Icon size={16} aria-hidden="true" /></div>
        <strong key={formatted} className={`cockpit-metric-value ${tone}`}>
          {formatted.endsWith(' USDT') ? <>{formatted.slice(0, -5)}<small> USDT</small></> : formatted}
        </strong>
        <span className="cockpit-metric-detail">{detail}</span>
      </div>;
    })}
  </section>;
}
