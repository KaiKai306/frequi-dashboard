import { useOptionalWorkspace } from '@danfessler/trellis-react';
import { useBot } from '../context/BotContext';

export function BotControlView() {
  const { botState, isConnected, selectedPair, setSelectedPair, formatCurrency } = useBot();
  const workspace = useOptionalWorkspace();
  const openChart = (pair:string) => {setSelectedPair(pair);workspace?.open('chart',{reuse:'type',params:{pair}});};
  return <div className="terminal-status terminal-scroll">
    <section>
      <h2>交易对 <span>{botState.whitelist.length}</span></h2>
      <div className="terminal-markets">
        {botState.whitelist.map(pair=><button key={pair} className={selectedPair===pair ? 'selected' : ''} onClick={()=>openChart(pair)}>
          <strong>{pair}</strong><span>现货</span><span aria-hidden="true">↗</span>
        </button>)}
        {!botState.whitelist.length && <p className="terminal-empty">等待交易对数据</p>}
      </div>
    </section>
    <section>
      <h2>策略状态</h2>
      <dl className="terminal-details">
        <div><dt>运行状态</dt><dd>{isConnected ? (botState.state==='running' ? '运行中' : botState.state==='stopped' ? '已停止' : '重载中') : '连接中断'}</dd></div>
        <div><dt>策略</dt><dd className="terminal-mono" title={botState.strategy}>{botState.strategy}</dd></div>
        <div><dt>策略周期</dt><dd>{botState.timeframe}</dd></div>
        <div><dt>运行模式</dt><dd>{botState.dry_run ? '现货模拟' : '实盘数据'}</dd></div>
        <div><dt>Freqtrade</dt><dd>{botState.version}</dd></div>
      </dl>
    </section>
    <section>
      <h2>资金配置</h2>
      <dl className="terminal-details">
        <div><dt>单笔投入</dt><dd>{typeof botState.stake_amount==='number' ? formatCurrency(botState.stake_amount) : Number.isFinite(Number(botState.stake_amount)) ? formatCurrency(Number(botState.stake_amount)) : botState.stake_amount}</dd></div>
        <div><dt>持仓上限</dt><dd>{botState.max_open_trades} 笔</dd></div>
        <div><dt>计价币种</dt><dd>{botState.stake_currency}</dd></div>
      </dl>
    </section>
    <p className="terminal-status-note">当前页面只读。交易控制与配置请使用<a href="/">原版面板 ↗</a></p>
  </div>;
}
