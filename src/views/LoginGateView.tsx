import { useState, type FormEvent } from 'react';
import { useBot } from '../context/BotContext';

export function LoginGateView() {
  const { addProfile } = useBot();
  const [username,setUsername]=useState('kai');
  const [password,setPassword]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const submit=async(event:FormEvent)=>{
    event.preventDefault();setLoading(true);setError('');
    try {
      const result=await addProfile({name:'Happykai 现货模拟',apiUrl:'/preview/bot',username:username.trim(),password});
      if(!result.success) setError('连接失败，请检查用户名和面板密码，稍后重试。');
    } catch {setError('暂时无法连接机器人，请稍后重试。');}
    finally {setLoading(false);}
  };
  return <main className="terminal-login">
    <div className="terminal-login-wordmark">Happykai <span>/ 量化终端</span></div>
    <section className="terminal-login-form">
      <header><h1>Happykai 量化工作台</h1><p>现货模拟 · 只读访问</p></header>
      <form onSubmit={submit}>
        <label htmlFor="dashboard-user">用户名</label>
        <input id="dashboard-user" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required/>
        <label htmlFor="dashboard-password">面板密码</label>
        <input id="dashboard-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/>
        {error && <p role="alert" className="terminal-login-error">{error}</p>}
        <button type="submit" disabled={loading}>{loading ? '正在连接…' : '进入工作台'}</button>
      </form>
      <p className="terminal-login-note">使用原有面板账号。登录信息仅保留在当前标签页。</p>
      <a href="/">原版面板 ↗</a>
    </section>
    <footer>Freqtrade / Binance Spot <span>简体中文</span></footer>
  </main>;
}
