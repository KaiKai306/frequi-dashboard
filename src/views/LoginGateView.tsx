import { useState, type FormEvent } from 'react';
import { ArrowRight, Loader2, LockKeyhole, CandlestickChart } from 'lucide-react';
import { useBot } from '../context/BotContext';

export function LoginGateView() {
  const { addProfile } = useBot();
  const [username, setUsername] = useState('kai');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError('');
    try {
      const result = await addProfile({ name: 'Happykai 现货模拟', apiUrl: '/preview/bot', username: username.trim(), password });
      if (!result.success) setError('连接失败，请检查用户名和面板密码，稍后重试。');
    } catch { setError('暂时无法连接机器人，请稍后重试。'); }
    finally { setLoading(false); }
  };
  return (
    <main className="min-h-screen bg-[#0b1120] text-slate-100 flex items-center justify-center px-6 font-sans">
      <section className="w-full max-w-md rounded-2xl border border-slate-700/60 bg-[#111c30] p-9 shadow-2xl">
        <div className="flex items-center gap-3 mb-7">
          <div className="rounded-xl p-3 bg-emerald-400/10 text-emerald-400"><CandlestickChart size={26} /></div>
          <div><h1 className="text-xl font-semibold">Happykai 量化工作台</h1><p className="text-sm text-slate-400 mt-1">简体中文 · 现货模拟 · 只读预览</p></div>
        </div>
        <p className="text-sm text-slate-400 leading-6 mb-6">查看行情、持仓、成交和收益。使用你已经设置的面板账号登录。</p>
        <form onSubmit={submit} className="space-y-5">
          <div><label htmlFor="dashboard-user" className="block text-sm mb-2">用户名</label>
            <input id="dashboard-user" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required className="w-full rounded-lg border border-slate-600 bg-[#0b1120] px-3 py-2.5 outline-none focus:border-emerald-400" />
          </div>
          <div><label htmlFor="dashboard-password" className="block text-sm mb-2">面板密码</label>
            <input id="dashboard-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full rounded-lg border border-slate-600 bg-[#0b1120] px-3 py-2.5 outline-none focus:border-emerald-400" />
          </div>
          {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
          <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-400 text-slate-950 font-semibold py-3 disabled:opacity-50 cursor-pointer">
            {loading ? <Loader2 className="animate-spin" size={18} /> : <ArrowRight size={18} />}{loading ? '正在连接…' : '进入工作台'}
          </button>
        </form>
        <p className="mt-5 text-xs text-slate-500 flex items-center gap-2"><LockKeyhole size={14} />连接信息仅保留在当前标签页会话中。</p>
        <a href="/" className="block mt-6 text-sm text-slate-400 hover:text-emerald-300">打开原版研究面板 →</a>
      </section>
    </main>
  );
}
