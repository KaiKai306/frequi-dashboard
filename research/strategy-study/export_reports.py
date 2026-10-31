"""Reconcile genuine Freqtrade runs and publish bounded, lazy-loaded report files."""
from pathlib import Path
from decimal import Decimal, ROUND_DOWN
from functools import lru_cache
import argparse, datetime, gzip, hashlib, json, zipfile
import numpy as np
import pandas as pd
from run_matrix import FAMILIES, TIMEFRAMES, STAKES, PERIODS, COSTS, task_id

DESCRIPTIONS = {
    'Sma': ('双均线趋势', 'SMA50>SMA200入场，反转退出；指标以当前周期bar数计算。', {'快线': 50, '慢线': 200}),
    'HorizonSma': ('双均线时间跨度对照', '保留原4h基线的200小时/800小时均线跨度，仅提高信号检查频率。', {'快线跨度': '200小时', '慢线跨度': '800小时'}),
    'Donchian': ('通道突破', '突破前20根高点且高于SMA200入场，前10根低点或趋势退出。', {'突破': 20, '退出': 10, '均线': 200}),
    'RsiBbands': ('RSI / 布林回归', '上升趋势中RSI14<30且跌破20根2σ下轨，均值回归或48小时退出。', {'RSI': 14, '超卖': 30, '布林': 20, '标准差': 2}),
    'AdxMomentum': ('ADX 动量', 'ADX>25、正DI>25并强于负DI且动量为正；1%ROI或反向动量退出。', {'ADX': 14, 'DI': 25, '阈值': 25, 'ROI': '1%'}),
    'Supertrend': ('Supertrend 趋势', '固定ATR10×3趋势向上且高于SMA200入场，反转或趋势退出。', {'ATR': 10, '倍数': 3, '均线': 200}),
    'EmaPullback': ('EMA 趋势回调', 'EMA50>EMA200，回踩后收回EMA20且RSI在40—65；跌破EMA50或RSI>75退出。', {'回调均线': 20, '快趋势': 50, '慢趋势': 200, 'RSI范围': '40—65'}),
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')
    path.write_bytes(gzip.compress(raw, compresslevel=6, mtime=0) if path.suffix == '.gz' else raw)
    return {'sha256': sha(path), 'bytes': path.stat().st_size}


@lru_cache(maxsize=16)
def curve_time_axis(start, end, step):
    """Immutable time labels shared by runs on the same regular valuation grid."""
    stamps = np.arange(start, end + 1, step, dtype=np.int64)
    index = pd.to_datetime(stamps, unit='ms', utc=True)
    labels = pd.to_datetime(np.minimum(stamps, end - 1), unit='ms', utc=True).strftime('%Y-%m')
    return index, labels


def curve_summary(stamps, equity, gross, initial):
    assert np.isfinite(equity).all() and (equity > 0).all()
    peak = np.maximum.accumulate(np.maximum(equity, initial))
    drawdown = (1 - equity / peak) * 100
    days = stamps // 86400000
    keep = {0, len(stamps) - 1, int(drawdown.argmax()), int(equity.argmax())}
    keep.update(np.where(np.r_[days[:-1] != days[1:], True])[0].tolist())
    path = [[int(stamps[i]), round(float(equity[i]), 6), round(float(drawdown[i]), 6)] for i in sorted(keep)]
    # Chart starts at pre-trade capital; all fees still contribute to risk/monthly metrics.
    if path[0][1] != initial:
        path.insert(0, [int(stamps[0]) - 1, initial, 0])
    step = int(stamps[1] - stamps[0]); assert np.all(np.diff(stamps) == step)
    index, month_labels = curve_time_axis(int(stamps[0]), int(stamps[-1]), step)
    assert len(index) == len(stamps)
    values = pd.Series(equity, index=index)
    last = values.groupby(month_labels).last()
    monthly = []; previous = initial
    for month, value in last.items():
        monthly.append({'month': month, 'returnPct': (float(value) / previous - 1) * 100, 'profit': float(value) - previous})
        previous = float(value)
    return path, float(drawdown.max()), monthly, float(np.mean(gross / equity) * 100), float(np.max(gross / equity) * 100)


def reconstruct(trades, frames, start, end, initial, final):
    stamps = np.arange(start, end + 1, 300000, dtype=np.int64)
    assert stamps[-1] == end
    flows = np.zeros(len(stamps)); positions = {pair: np.zeros(len(stamps)) for pair in frames}
    for trade in trades:
        assert trade['open_timestamp'] <= trade['close_timestamp'], 'Native trade has reversed timestamps'
        opened = int(np.searchsorted(stamps, trade['open_timestamp']))
        closed = int(np.searchsorted(stamps, trade['close_timestamp']))
        assert opened < len(stamps) and closed < len(stamps)
        assert stamps[opened] == trade['open_timestamp'] and stamps[closed] == trade['close_timestamp']
        amount = trade['amount']; pair = trade['pair']
        flows[opened] -= amount * trade['open_rate'] * (1 + trade['fee_open'])
        flows[closed] += amount * trade['close_rate'] * (1 - trade['fee_close'])
        positions[pair][opened] += amount; positions[pair][closed] -= amount
    equity = initial + np.cumsum(flows); gross = np.zeros(len(stamps))
    index = pd.to_datetime(stamps, unit='ms', utc=True)
    for pair, changes in positions.items():
        held = np.cumsum(changes); held[np.abs(held) < 1e-10] = 0
        assert held.min() >= -1e-8 and abs(held[-1]) < 1e-8
        frame = frames[pair]
        # Missing 5m marks use the preceding observed close, with no future fill.
        marks = frame['open'].reindex(index).fillna(frame['close'].reindex(index).ffill()).to_numpy()
        assert np.isfinite(marks).all()
        value = held * marks; equity += value; gross += value
    assert abs(float(equity[-1]) - final) < 1e-4
    return stamps, equity, gross


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--work', type=Path, default=Path('/work')); args = parser.parse_args(); work = args.work
    matrix = json.loads((work / 'matrix.json').read_text()); causal = json.loads((work / 'causal-check.json').read_text()); ahead = json.loads((work / 'lookahead-check.json').read_text())
    assert len(matrix['tasks']) == 54 and all(t['state'] == 'completed' for t in matrix['tasks']) and causal['passed'] and ahead['status'] == 'passed'
    root_output = work / 'published' / 'study'; root_output.mkdir(parents=True, exist_ok=True)
    frozen = json.loads((work / 'frozen.json').read_text()); audit = json.loads((work / 'data/audit.json').read_text()); markets = json.loads((work / 'markets.json').read_text())
    for name, expected in frozen['sources'].items(): assert sha(Path(__file__).parent / name) == expected
    frames = {pair + '/USDT': pd.read_feather(work / f'data/{pair}_USDT-5m.feather').set_index('date') for pair in ['BTC', 'ETH']}
    source_sha = sha(Path(__file__).parent / 'strategies/StudyStrategies.py'); audit_sha = sha(work / 'data/audit.json')
    archives_manifest = {str(path.relative_to(work)): sha(path) for path in sorted((work / 'results').glob('*/*.zip'))}
    assert len(archives_manifest) == 54
    export_sha = sha(Path(__file__))
    identity = json.dumps({'audit': audit_sha, 'exporter': export_sha, 'archives': archives_manifest}, sort_keys=True).encode()
    batch = source_sha[:10] + '-' + hashlib.sha256(identity).hexdigest()[:10]; output = root_output / batch; output.mkdir(exist_ok=True)
    prefix = '/preview/backtests/study/' + batch + '/'
    created = max(datetime.datetime.fromisoformat(task['started_at']) + datetime.timedelta(seconds=task['duration_seconds']) for task in matrix['tasks']).isoformat()
    files = {}; reports = []; summaries = []; checks = []
    # One candle file per period/pair/timeframe, shared by all three stake variants.
    candle_files = {}
    for timeframe in TIMEFRAMES:
        candle_files[timeframe] = {}
        for period in PERIODS:
            candle_files[timeframe][period['id']] = {}
            for pair in ['BTC', 'ETH']:
                data = pd.read_feather(work / f'data/{pair}_USDT-{timeframe}.feather')
                data = data.loc[(data['date'] >= pd.Timestamp(period['start'], tz='UTC')) & (data['date'] < pd.Timestamp(period['end'], tz='UTC'))]
                candles = [[int(row.date.timestamp() * 1000), row.open, row.high, row.low, row.close] for row in data.itertuples()]
                name = f'candles/{timeframe}-{period["id"]}-{pair}.json.gz'; files[name] = write_json(output / name, candles)
                candle_files[timeframe][period['id']][pair + '/USDT'] = prefix + name
    notes = [
        '固定规则历史比较，全部378项均保留；这些历史区间此前已参与研究，不是未见样本外验证。',
        '累计收益按1000USDT总账户计算；两年/九个月收益不等于一年收益。CAGR只是区间年化换算，不预测未来。',
        '单笔100/250/450USDT为固定投入三方案，最多两仓；提高仓位会同时放大风险，资金不足还可能改变后续成交。',
        '三周期全部使用5m细分撮合、8%止损、8小时冷却；ADX保留独立1%ROI退出，其余无固定ROI。没有杠杆或摊平加仓。',
        '除时间跨度对照外，指标采用相同bar数，缩短周期也缩短指标记忆。原4h基线以1h撮合，本轮以5m撮合，不能当成完全相同实验。',
        '手续费和滑点是研究假设，滑点仅以额外费用近似，未模拟盘口、跳空或挂单排队。当前市场精度用于全部历史，未复原历史规则。',
        '净值由成交现金流和两个币种的5m开盘价独立重建，缺失时用先前收盘价；以引擎成交时间记账，无法复原5m内真实路径，回撤并非盘中最坏风险。',
        '基准用相同每币预算买入BTC/ETH，其余现金；策略和基准的持仓时间不同。各历史区间重新从1000USDT开始，不可相加。',
        '全部区间补齐研究截止时刻的原生强平价格；2026段额外校验6份官方日度归档，仅追加截止时刻K线，开仓窗口不延长。原生引擎在缺少此边界时出现的两项倒序强平已完整归档，2026全部126项统一重跑，非按收益挑选修正。',
        '21个变体共210次前缀一致性检查及框架每变体10个信号抽查通过，不构成未来盈利保证。现有模拟账户不因页面选择而改变。',
    ]
    for timeframe in TIMEFRAMES:
        strategies = [{'id': family + 'Study' + timeframe, 'name': DESCRIPTIONS[family][0], 'description': DESCRIPTIONS[family][1], 'parameters': dict(DESCRIPTIONS[family][2], **{'止损': '8%', '冷却': '8小时'}), 'sourceSha256': source_sha} for family in FAMILIES]
        for stake in STAKES:
            runs = []; benchmarks = []
            for period in PERIODS:
                for cost in COSTS:
                    ident = task_id(timeframe, stake, period, cost); archives = list((work / 'results' / ident).glob('*.zip')); assert len(archives) == 1
                    archive_sha = sha(archives[0])
                    with zipfile.ZipFile(archives[0]) as native:
                        name = next(n for n in native.namelist() if n.startswith('backtest-result-') and n.endswith('.json') and not n.endswith('_config.json') and not any(s['id'] in n for s in strategies))
                        engine = json.loads(native.read(name))
                    for strategy in strategies:
                        result = engine['strategy'][strategy['id']]; initial = result['starting_balance']; final = result['final_balance']; start = result['backtest_start_ts']; end = result['backtest_end_ts']
                        assert initial == 1000 and result['max_open_trades'] == 2 and result['timeframe_detail'] == '5m' and result['enable_protections']
                        trades = []
                        for trade in result['trades']:
                            fee = trade['amount'] * (trade['open_rate'] * trade['fee_open'] + trade['close_rate'] * trade['fee_close'])
                            pnl = trade['amount'] * (trade['close_rate'] - trade['open_rate']) - fee
                            assert abs(pnl - trade['profit_abs']) < 1e-5
                            trades.append({'pair': trade['pair'], 'openTime': trade['open_timestamp'], 'closeTime': trade['close_timestamp'], 'openRate': trade['open_rate'], 'closeRate': trade['close_rate'], 'amount': trade['amount'], 'stake': trade['stake_amount'], 'profit': trade['profit_abs'], 'returnPct': trade['profit_ratio'] * 100, 'durationMinutes': trade['trade_duration'], 'reason': trade['exit_reason'], 'enterTag': trade.get('enter_tag', ''), 'fees': fee})
                        assert abs(sum(t['profit'] for t in trades) - (final - initial)) < 1e-4
                        stamps, equity, gross = reconstruct(result['trades'], frames, start, end, initial, final)
                        path, drawdown, monthly, exposure, max_exposure = curve_summary(stamps, equity, gross, initial)
                        years = (end - start) / 86400000 / 365.25
                        metrics = {'initial': initial, 'final': final, 'profit': final - initial, 'returnPct': (final / initial - 1) * 100, 'drawdownPct': drawdown, 'closedDrawdownPct': result['max_drawdown_account'] * 100, 'trades': len(trades), 'winRate': result['winrate'] * 100, 'profitFactor': result['profit_factor'] if result['losses'] else None, 'fees': sum(t['fees'] for t in trades), 'cagrPct': ((final / initial) ** (1 / years) - 1) * 100, 'exposurePct': exposure, 'maxExposurePct': max_exposure, 'tradesPerYear': len(trades) / years, 'meanDurationMinutes': float(np.mean([t['durationMinutes'] for t in trades])) if trades else 0, 'turnover': sum(t['amount'] * (t['openRate'] + t['closeRate']) for t in trades) / initial, 'rejectedSignals': result.get('rejected_signals', 0)}
                        run_id = ident + '-' + strategy['id']; name = 'trades/' + run_id + '.json.gz'
                        files[name] = write_json(output / name, sorted(trades, key=lambda t: t['closeTime'], reverse=True))
                        runs.append({'id': run_id, 'taskId': ident, 'strategyId': strategy['id'], 'periodId': period['id'], 'costId': cost['id'], 'start': start, 'end': end, 'metrics': metrics, 'series': path, 'monthly': monthly, 'trades': [], 'tradesPath': prefix + name, 'sourceArchiveSha256': archive_sha})
                        summaries.append({'id': run_id, 'family': strategy['id'].split('Study')[0], 'name': strategy['name'], 'timeframe': timeframe, 'stake': stake, 'period': period['id'], 'cost': cost['id'], **metrics})
                        checks.append({'id': run_id, 'trades': len(trades), 'trade_pnl_reconciled': True, 'cashflow_wallet_reconciled': True, 'archive_sha256': archive_sha})
                    # Match each period's actual engine time bounds, amount precision and capital budget.
                    index = pd.to_datetime(stamps, unit='ms', utc=True); cash = 1000; gross = np.zeros(len(stamps))
                    for pair, frame in frames.items():
                        marks = frame['open'].reindex(index).fillna(frame['close'].reindex(index).ffill()).to_numpy(); opening = float(marks[0])
                        market = next(m for m in markets['markets'] if m['symbol'] == pair); step = Decimal(str(market['precision']['amount']))
                        qty = float((Decimal(str(stake / (opening * (1 + cost['effective_fee'])))) / step).to_integral_value(rounding=ROUND_DOWN) * step)
                        cash -= qty * opening * (1 + cost['effective_fee']); gross += qty * marks
                    values = cash + gross; values[-1] = cash + gross[-1] * (1 - cost['effective_fee'])
                    bpath, bdd, _, _, _ = curve_summary(stamps, values, gross, 1000)
                    benchmarks.append({'periodId': period['id'], 'costId': cost['id'], 'name': f'买入持有 · 每币{stake}USDT预算，其余现金', 'series': bpath, 'returnPct': (float(values[-1]) / 1000 - 1) * 100, 'drawdownPct': bdd})
            report_name = f'reports/{timeframe}-s{stake}.json.gz'
            report = {'schemaVersion': 1, 'createdAt': created, 'reportId': f'shorter-{timeframe}-s{stake}-{source_sha[:10]}', 'engine': 'Freqtrade 2026.10', 'dataset': {'start': '2021-11-01', 'end': '2026-09-30', 'terminalBoundary': '2026-10-01T00:00:00Z', 'archives': 360, 'hourlyRowsPerPair': 43080, 'source': 'Binance Data Vision 官方月度归档及期末边界日度归档', 'sha256': audit_sha, 'knownGap': '2023-03-24 停牌窗口等官方缺口：每币5m缺16根、15m缺5根；引擎按默认规则补齐，估值用前收盘。'}, 'settings': {'initial': 1000, 'stake': stake, 'maxOpenTrades': 2, 'stoplossPct': 8, 'cooldownHours': 8, 'timeframe': timeframe, 'detailTimeframe': '5m', 'valuationTimeframe': '5m', 'reviewedHistory': True}, 'strategies': strategies, 'periods': PERIODS, 'costs': COSTS, 'tasks': [t for t in matrix['tasks'] if t['timeframe'] == timeframe and t['stake'] == stake], 'runs': runs, 'benchmarks': benchmarks, 'candles': {'BTC/USDT': [], 'ETH/USDT': []}, 'candleFiles': candle_files[timeframe], 'checks': {'archiveChecksums': True, 'causalPrefix': True, 'frameworkLookahead': 'passed', 'accountingReconciled': True}, 'notes': notes}
            assert len(runs) == 42
            files[report_name] = write_json(output / report_name, report)
            reports.append({'id': f'{timeframe}-s{stake}', 'timeframe': timeframe, 'stake': stake, 'label': f'{timeframe} / 单笔{stake} USDT', 'path': prefix + report_name, 'runs': len(runs)})
    assert len(summaries) == 378 and len(reports) == 9
    files['summary.json.gz'] = write_json(output / 'summary.json.gz', {'createdAt': created, 'runs': summaries, 'periods': PERIODS, 'costs': COSTS, 'notes': notes})
    files = {batch + '/' + name: info for name, info in files.items()}
    files['index.json'] = write_json(root_output / 'index.json', {'schemaVersion': 1, 'createdAt': created, 'totalRuns': len(summaries), 'reports': reports, 'summaryPath': prefix + 'summary.json.gz'})
    write_json(work / 'accounting-checks.json', checks)
    write_json(work / 'export-manifest.json', {'files': files, 'source_sha256': source_sha, 'exporter_sha256': export_sha, 'source_archives': archives_manifest, 'total_runs': len(summaries), 'trade_records': sum(r['trades'] for r in summaries), 'max_file_bytes': max(x['bytes'] for x in files.values())})
    print(json.dumps({'reports': len(reports), 'runs': len(summaries), 'trades': sum(r['trades'] for r in summaries), 'files': len(files), 'bytes': sum(x['bytes'] for x in files.values()), 'max_file_bytes': max(x['bytes'] for x in files.values())}), flush=True)


if __name__ == '__main__': main()
