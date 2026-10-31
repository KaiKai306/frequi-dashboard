"""Describe every completed experiment; select one 1h observation without tuning."""
from pathlib import Path
import argparse,datetime,gzip,json


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--work',type=Path,required=True);args=parser.parse_args();work=args.work
    index=json.loads((work/'published/study/index.json').read_text());summary_path=index['summaryPath'].split('/study/')[1]
    summary=json.loads(gzip.decompress((work/'published/study'/summary_path).read_bytes()));runs=summary['runs'];assert len(runs)==378
    def rows(tf,stake,cost='stress'):
        return [r for r in runs if r['timeframe']==tf and r['stake']==stake and r['cost']==cost]
    groups=[]
    for tf in ['4h','1h','15m']:
        for stake in [100,250,450]:
            for family in ['Sma','HorizonSma','Donchian','RsiBbands','AdxMomentum','Supertrend','EmaPullback']:
                stress=sorted([r for r in rows(tf,stake) if r['family']==family],key=lambda r:r['period']);recent=next(r for r in stress if r['period']=='2026-q1-q3')
                assert len(stress)==3
                baselines={r['period']:r for r in rows('4h',stake) if r['family']=='Sma'}
                gates=all(r['returnPct']>0 for r in stress) and recent['trades']>=30
                dominates=all(r['returnPct']>=baselines[r['period']]['returnPct'] and r['drawdownPct']<=baselines[r['period']]['drawdownPct'] for r in stress) and any(r['returnPct']>baselines[r['period']]['returnPct'] for r in stress)
                groups.append({'family':family,'timeframe':tf,'stake':stake,'name':recent['name'],'positive_all_three_stress_periods':all(r['returnPct']>0 for r in stress),'recent_trade_count':recent['trades'],'basic_gates_passed':gates,'strictly_dominates_4h_sma_all_periods':dominates,'min_stress_cagr':min(r['cagrPct'] for r in stress),'stress_returns':{r['period']:r['returnPct'] for r in stress}})
    choices=[g for g in groups if g['timeframe']=='1h' and g['stake']==100 and g['recent_trade_count']>=30]
    assert choices,'No sufficiently active 1h observation variant; review manually.'
    # Post-study observation selection, not a pre-registered significance test.
    choices.sort(key=lambda g:(g['basic_gates_passed'] and g['strictly_dominates_4h_sma_all_periods'],g['basic_gates_passed'],g['min_stress_cagr']),reverse=True)
    chosen=choices[0]
    selection={'timeframe':'1h','sourceClass':chosen['family']+'Study1h','name':chosen['name']+' · 1h 观察','startingCapital':1000,'stake':100,'basicGatesPassed':chosen['basic_gates_passed'],'strictDominance':chosen['strictly_dominates_4h_sma_all_periods'],'selectionType':'post-study exploratory forward observation','historicalEvidence':chosen,'reason':'在1h、单笔100、2026压力成本至少30笔的固定变体中，优先满足三段压力收益为正与严格收益/回撤对照，再按最差区间历史CAGR排序。此排序在结果后用于挑选观察对象，未做显著性验证或新样本外测试。'}
    (work/'selection.json').write_text(json.dumps(selection,ensure_ascii=False,indent=2)+'\n');(work/'candidate-gates.json').write_text(json.dumps(groups,ensure_ascii=False,indent=2)+'\n')
    pct=lambda n:f'{n:+.2f}%'
    out=['# 七类策略、周期与投入的完整历史比较','',f'生成时间：{datetime.datetime.now(datetime.timezone.utc).isoformat()}。正式比较含54组、378项结果；规则/参数/费用在原结果前冻结。完整导出发现期末边界异常后，新增终端输入在126项统一补充重跑前冻结，原始结果与修正结果均保留，合计执行504项。边界原因与口径见 [TERMINAL-CORRECTION.md](TERMINAL-CORRECTION.md)。','', '## 结论口径','',f'三段压力成本均正且2026段至少30笔的组合共{sum(g["basic_gates_passed"] for g in groups)}/63个；再要求各段收益不低于、5m净值回撤不高于同仓位4h均线（至少一段收益严格提高），共{sum(g["basic_gates_passed"] and g["strictly_dominates_4h_sma_all_periods"] for g in groups)}/63个。后一个严格支配口径是结果解释，不能冒充预注册的统计显著性测试。','',f'日本第二个模拟账户采用 **{selection["sourceClass"]}**，单笔100USDT，命名“{selection["name"]}”。基础历史门槛：{"通过" if selection["basicGatesPassed"] else "未通过"}；严格收益/回撤支配对照：{"通过" if selection["strictDominance"] else "未通过"}。它只是冻结后的独立前向观察对象，不能称为已证明更优。原4h基线和历史不变。','',selection['reason'],'', '## 2026年前九个月，单笔100USDT','', '以下均为1000USDT总账户的九个月累计收益，不是年收益；另外列出CAGR。回撤按共同5m开盘价和成交现金流重建，费用包含滑点费用近似。','', '| 规则 | 信号 | 基准累计 | 压力累计 | 历史CAGR（基准） | 5m净值回撤 | 成交 | 成本USDT | 平均持仓占比 |','| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
    for family in ['Sma','HorizonSma','Donchian','RsiBbands','AdxMomentum','Supertrend','EmaPullback']:
        for tf in ['4h','1h','15m']:
            base=next(r for r in runs if r['family']==family and r['timeframe']==tf and r['stake']==100 and r['period']=='2026-q1-q3' and r['cost']=='base');stress=next(r for r in runs if r['family']==family and r['timeframe']==tf and r['stake']==100 and r['period']=='2026-q1-q3' and r['cost']=='stress')
            out.append(f'| {base["name"]} | {tf} | {pct(base["returnPct"])} | {pct(stress["returnPct"])} | {pct(base["cagrPct"])} | {base["drawdownPct"]:.2f}% | {base["trades"]} | {base["fees"]:.2f} | {base["exposurePct"]:.1f}% |')
    out += ['', '## 三段压力成本，单笔100USDT','', '| 规则 | 信号 | 2022—2023累计 | 2024—2025累计 | 2026年1—9月累计 | 2026成交 | 基础门槛 |','| --- | --- | ---: | ---: | ---: | ---: | --- |']
    for group in [g for g in groups if g['stake']==100]:
        out.append('| '+group['name']+' | '+group['timeframe']+' | '+' | '.join(pct(group['stress_returns'][p]) for p in ['2022-2023','2024-2025','2026-q1-q3'])+f' | {group["recent_trade_count"]} | {"通过" if group["basic_gates_passed"] else "未通过"} |')
    out += ['', '## 仓位放大需要真实重跑','', '| 4h规则 | 单笔USDT | 2026年1—9月累计（基准） | 5m净值回撤 | 成交 | 平均持仓占比 |','| --- | ---: | ---: | ---: | ---: | ---: |']
    for family in ['Sma','Donchian']:
        for stake in [100,250,450]:
            r=next(r for r in runs if r['family']==family and r['timeframe']=='4h' and r['stake']==stake and r['period']=='2026-q1-q3' and r['cost']=='base')
            out.append(f'| {r["name"]} | {stake} | {pct(r["returnPct"])} | {r["drawdownPct"]:.2f}% | {r["trades"]} | {r["exposurePct"]:.1f}% |')
    out += ['', '## 使用与限制','', '- 打开工作台“策略回测”，实验切到“策略与短周期 · 378项”；选周期、投入、区间和成本，查看曲线/回撤、完整指标、月度、成交/K线及下载。“跨周期与仓位比较”可同时比较21/63个当前区间方案。','- 顶部“查看模拟策略”切换独立实时账户；研究行选择不会改变运行策略。两个模拟账户各自1000USDT、单笔100、最多两仓、8%止损和8小时冷却。信号每1h/4h检查，不代表每小时都成交。','- 三段历史都已参与研究，没有未见样本外成绩。三段正收益和10/20/30%回撤筛选不能证明统计显著性，也不能保证未来回撤上限。','- 原4h模拟保留其手续费0.10%和真实公开盘口的模拟成交约定，新账户沿用相同约定。历史基准成本每边0.12%、压力0.25%，滑点仅近似为费用；与实时模拟不是同一撮合模型，不能直接混用收益。','- 期末强平、当前市场精度、官方缺口填补和5m估值的限制详见协议与报告；5m开盘回撤不是盘中最坏回撤。','- 不运行Hyperopt/ML、不扩大到股票或合约、不改变现有币安密钥权限。公开复杂策略只作为资料，不把作者宣传收益当成复现成绩。','', '来源与规则变体见 [SOURCES.md](SOURCES.md)，协议见 [PROTOCOL.md](PROTOCOL.md)，运行/数据/记账/偏差证据在 `evidence/` 和研究工作目录。前向模拟需积累独立的新数据再评估，不把本轮最优历史排名作为实盘承诺。','']
    (Path(__file__).parent/'RESULTS.md').write_text('\n'.join(out))
    print(json.dumps({'groups':len(groups),'basic_gates_passed':sum(g['basic_gates_passed'] for g in groups),'selection':selection},ensure_ascii=False))


if __name__=='__main__':main()
