import { BarChart3 } from 'lucide-react';
import { useBot } from '../context/BotContext';

export function PerformanceSummary() {
  const { dailyRecords, profitSummary, formatCurrency, hideBalances } = useBot();
  const days = [...dailyRecords].sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
  const scale = Math.max(...days.map(day => Math.abs(day.abs_profit)), 1e-8);
  return <div className="cockpit-performance">
    <div className="cockpit-performance-stats">
      <div><span>胜率</span><strong>{((profitSummary?.winrate ?? 0) * 100).toFixed(1)}<small>%</small></strong></div>
      <div><span>最大回撤</span><strong>{(profitSummary?.max_drawdown_pct ?? 0).toFixed(2)}<small>%</small></strong></div>
    </div>
    {days.length > 0 && !hideBalances ? <div className="cockpit-daily-bars" aria-label="每日已实现盈亏">
      <svg viewBox="0 0 280 86" role="img" aria-label="最近日记录盈亏柱状图">
        <line x1="0" x2="280" y1="40" y2="40" className="cockpit-zero-line" />
        {days.map((day, index) => {
          const height = Math.abs(day.abs_profit) / scale * 31;
          const width = 280 / days.length;
          return <g key={day.date}>
            <rect x={width * index + width / 2 - 9} y={day.abs_profit >= 0 ? 40 - height : 40} width="18" height={height} rx="2" className={day.abs_profit < 0 ? 'bar-negative' : 'bar-positive'}>
              <title>{day.date}：{formatCurrency(day.abs_profit, { showSign: true })}</title>
            </rect>
            <text x={width * index + width / 2} y="83" textAnchor="middle">{day.date.slice(5)}</text>
          </g>;
        })}
      </svg>
    </div> : <div className="cockpit-performance-empty"><BarChart3 size={21} /><span>{hideBalances ? '金额已隐藏' : '暂无已实现盈亏记录'}</span></div>}
  </div>;
}
