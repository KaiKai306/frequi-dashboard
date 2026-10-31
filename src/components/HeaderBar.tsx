import { useState } from 'react';
import { useOptionalWorkspace } from '@danfessler/trellis-react';
import { RefreshCw, Sun, Moon, LogOut, RotateCcw, PanelsTopLeft } from 'lucide-react';
import { useBot } from '../context/BotContext';
import { useLocale } from '../i18n/LocaleContext';

export function HeaderBar() {
  const { activeBotId, activeProfile, isConnected, isConnecting, refreshData, theme, setTheme,
    refreshCountdown, refreshInterval, setRefreshInterval, deleteProfile } = useBot();
  const { locale, toggleLocale } = useLocale();
  const ws = useOptionalWorkspace();
  const [refreshing, setRefreshing] = useState(false);
  const [showViews, setShowViews] = useState(false);
  const dark = theme === 'dark';
  const views = [['frequi_dashboard','总览'],['chart','K 线图表'],['active_trades','当前持仓'],
    ['closed_trades','成交记录'],['equity_curve','资金曲线'],['signals','信号统计'],['bot_control','机器人状态'],['logs','运行日志']];
  const button = `px-3 py-1.5 rounded-lg border flex items-center gap-2 cursor-pointer transition-colors ${dark
    ? 'border-slate-700 bg-slate-800/60 hover:bg-slate-700 text-slate-200'
    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'}`;
  const refresh = async () => { setRefreshing(true); try { await refreshData(undefined,true); } finally { setRefreshing(false); } };
  const reset = () => {
    if (!confirm('恢复默认桌面布局？')) return;
    for(let i=1;i<=20;i++) { localStorage.removeItem(`frequi-trellis:layout:v${i}`); }
    window.location.reload();
  };
  return (
    <header className={`h-16 shrink-0 px-5 flex items-center justify-between gap-4 border-b text-xs ${dark ? 'bg-[#121a2b] border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}`}>
      <div className="flex items-center gap-4 min-w-0">
        <strong className="text-base tracking-wide">Happykai <span className="text-emerald-500">量化</span></strong>
        <span className="w-px h-6 bg-slate-500/30" />
        <div><p className="font-semibold">{activeProfile?.name}</p>
          <p className="mt-1 text-slate-500 flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />{isConnecting ? '正在连接' : isConnected ? '日本节点已连接' : '连接中断，请刷新重试'} · USDT</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-slate-500 mr-1">{refreshInterval ? `${refreshCountdown} 秒后更新` : '手动更新'}</span>
        <select aria-label="自动刷新间隔" value={refreshInterval} onChange={e=>setRefreshInterval(Number(e.target.value))} className={button}>
          <option value={6}>6 秒刷新</option><option value={15}>15 秒刷新</option><option value={30}>30 秒刷新</option><option value={0}>手动刷新</option>
        </select>
        <button className={button} disabled={refreshing} onClick={refresh} title="刷新数据"><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''}/><span>刷新</span></button>
        <div className="relative">
          <button className={button} onClick={()=>setShowViews(!showViews)} aria-expanded={showViews}><PanelsTopLeft size={14}/>添加视图</button>
          {showViews && <div className={`absolute right-0 top-full mt-2 p-2 w-40 z-50 rounded-xl border shadow-xl ${dark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
            {views.map(([id,label])=><button key={id} className="block w-full text-left px-3 py-2 rounded hover:bg-emerald-500/15 cursor-pointer" onClick={()=>{ws?.open(id,{reuse:'type'});setShowViews(false);}}>{label}</button>)}
          </div>}
        </div>
        <button className={button} title="恢复布局" onClick={reset}><RotateCcw size={14}/></button>
        <button className={button} title={dark ? '切换浅色' : '切换深色'} onClick={()=>setTheme(dark ? 'light' : 'dark')}>{dark ? <Sun size={14}/> : <Moon size={14}/>}</button>
        <button className={button} title="切换语言" onClick={toggleLocale}>{locale==='zh' ? '简中' : 'EN'}</button>
        <button className={button} title="退出登录" onClick={()=>{if(activeBotId) deleteProfile(activeBotId);}}><LogOut size={14}/></button>
      </div>
    </header>
  );
}
