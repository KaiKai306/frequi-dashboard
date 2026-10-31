import { useState } from 'react';
import { useOptionalWorkspace } from '@danfessler/trellis-react';
import { RefreshCw, Sun, Moon, LogOut, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { useBot } from '../context/BotContext';

export function HeaderBar() {
  const { activeBotId, isConnected, isConnecting, refreshData, theme, setTheme,
    refreshCountdown, refreshInterval, setRefreshInterval, deleteProfile,
    hideBalances, toggleHideBalances } = useBot();
  const workspace = useOptionalWorkspace();
  const [refreshing, setRefreshing] = useState(false);
  const [showViews, setShowViews] = useState(false);
  const views = [['frequi_dashboard','运行概览'],['chart','K 线图表'],['active_trades','当前持仓'],
    ['closed_trades','成交记录'],['equity_curve','资金曲线'],['signals','信号统计'],['bot_control','机器人状态'],['logs','运行日志']];
  const refresh = async () => {
    setRefreshing(true);
    try { await refreshData(undefined,true); } finally { setRefreshing(false); }
  };
  const reset = () => {
    if (!confirm('恢复默认桌面布局？')) return;
    localStorage.removeItem('happykai-terminal:layout:v1');
    window.location.reload();
  };
  return (
    <header className="terminal-header">
      <div className="terminal-brand"><strong>Happykai</strong><span>量化终端</span></div>
      <span className="terminal-connection"><i className={isConnected ? 'connected' : ''}/>{isConnecting ? '正在连接' : isConnected ? '日本节点已连接' : '连接中断'}</span>
      <div className="terminal-header-actions">
        <span className="terminal-muted terminal-countdown">{refreshInterval ? `${refreshCountdown}s 后更新` : '手动更新'}</span>
        <select aria-label="自动刷新间隔" value={refreshInterval} onChange={e=>setRefreshInterval(Number(e.target.value))}>
          <option value={6}>6 秒</option><option value={15}>15 秒</option><option value={30}>30 秒</option><option value={0}>手动</option>
        </select>
        <button disabled={refreshing} onClick={refresh} title="刷新数据"><RefreshCw size={13} className={refreshing ? 'animate-spin' : ''}/><span>刷新</span></button>
        <div className="terminal-view-menu">
          <button onClick={()=>setShowViews(!showViews)} aria-expanded={showViews}>添加视图</button>
          {showViews && <><button className="terminal-menu-dismiss" aria-label="关闭视图菜单" onClick={()=>setShowViews(false)} tabIndex={-1}/><div className="terminal-menu" role="menu">
            {views.map(([id,label])=><button key={id} role="menuitem" onClick={()=>{workspace?.open(id,{reuse:'type'});setShowViews(false);}}>{label}</button>)}
          </div></>}
        </div>
        <button title="恢复布局" aria-label="恢复布局" onClick={reset}><RotateCcw size={13}/></button>
        <button title={hideBalances ? '显示金额' : '隐藏金额'} aria-label={hideBalances ? '显示金额' : '隐藏金额'} onClick={toggleHideBalances}>{hideBalances ? <EyeOff size={13}/> : <Eye size={13}/>}</button>
        <button title={theme==='dark' ? '切换浅色' : '切换深色'} aria-label={theme==='dark' ? '切换浅色' : '切换深色'} onClick={()=>setTheme(theme==='dark' ? 'light' : 'dark')}>{theme==='dark' ? <Sun size={13}/> : <Moon size={13}/>}</button>
        <a className="terminal-original" href="/">原版面板 ↗</a>
        <button title="退出登录" aria-label="退出登录" onClick={()=>{if(activeBotId) deleteProfile(activeBotId);}}><LogOut size={13}/></button>
      </div>
    </header>
  );
}
