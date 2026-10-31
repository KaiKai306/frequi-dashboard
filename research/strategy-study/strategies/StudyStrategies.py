"""Frozen spot-long research prototypes, not production strategy replacements.

Signals use only completed candles. Period variants are explicit subclasses so
Freqtrade records and exports an unambiguous class for every experiment.
"""
from datetime import datetime
import numpy as np
from pandas import DataFrame, Series
import talib.abstract as ta
from technical.indicators import supertrend
from freqtrade.persistence import Trade
from freqtrade.strategy import IStrategy, timeframe_to_minutes


class StudyBase(IStrategy):
    INTERFACE_VERSION = 3
    can_short = False
    timeframe = '4h'
    startup_candle_count = 240
    process_only_new_candles = True
    minimal_roi = {}
    stoploss = -0.08
    trailing_stop = False
    use_exit_signal = True
    exit_profit_only = False
    position_adjustment_enable = False

    @property
    def protections(self):
        # Hold physical cooldown constant while comparing candle frequencies.
        return [{'method': 'CooldownPeriod',
                 'stop_duration_candles': 480 // timeframe_to_minutes(self.timeframe)}]

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe['sma50'] = dataframe['close'].rolling(50).mean()
        dataframe['sma200'] = dataframe['close'].rolling(200).mean()
        return dataframe


class SmaRule(StudyBase):
    def populate_entry_trend(self, dataframe, metadata):
        dataframe.loc[(dataframe['sma50'] > dataframe['sma200']) &
                      (dataframe['volume'] > 0), ['enter_long', 'enter_tag']] = (1, 'sma50_above_sma200')
        return dataframe

    def populate_exit_trend(self, dataframe, metadata):
        dataframe.loc[(dataframe['sma50'] < dataframe['sma200']) &
                      (dataframe['volume'] > 0), ['exit_long', 'exit_tag']] = (1, 'sma50_below_sma200')
        return dataframe


class HorizonSmaRule(SmaRule):
    def populate_indicators(self, dataframe, metadata):
        factor = 240 // timeframe_to_minutes(self.timeframe)
        dataframe['sma50'] = dataframe['close'].rolling(50 * factor).mean()
        dataframe['sma200'] = dataframe['close'].rolling(200 * factor).mean()
        return dataframe


class DonchianRule(StudyBase):
    def populate_indicators(self, dataframe, metadata):
        dataframe = super().populate_indicators(dataframe, metadata)
        dataframe['high20'] = dataframe['high'].rolling(20).max().shift(1)
        dataframe['low10'] = dataframe['low'].rolling(10).min().shift(1)
        return dataframe

    def populate_entry_trend(self, dataframe, metadata):
        dataframe.loc[(dataframe['close'] > dataframe['high20']) &
                      (dataframe['close'] > dataframe['sma200']) &
                      (dataframe['volume'] > 0), ['enter_long', 'enter_tag']] = (1, 'breakout20_trend200')
        return dataframe

    def populate_exit_trend(self, dataframe, metadata):
        dataframe.loc[(dataframe['close'] < dataframe['low10']) |
                      (dataframe['close'] < dataframe['sma200']), ['exit_long', 'exit_tag']] = (1, 'channel10_or_trend')
        return dataframe


class RsiBbandsRule(StudyBase):
    def populate_indicators(self, dataframe, metadata):
        dataframe = super().populate_indicators(dataframe, metadata)
        dataframe['sma20'] = dataframe['close'].rolling(20).mean()
        dataframe['lower_band'] = dataframe['sma20'] - 2 * dataframe['close'].rolling(20).std(ddof=0)
        dataframe['rsi14'] = ta.RSI(dataframe, timeperiod=14)
        return dataframe

    def populate_entry_trend(self, dataframe, metadata):
        dataframe.loc[(dataframe['close'] < dataframe['lower_band']) &
                      (dataframe['rsi14'] < 30) & (dataframe['close'] > dataframe['sma200']) &
                      (dataframe['volume'] > 0), ['enter_long', 'enter_tag']] = (1, 'rsi30_lower_band_uptrend')
        return dataframe

    def populate_exit_trend(self, dataframe, metadata):
        dataframe.loc[(dataframe['close'] >= dataframe['sma20']) |
                      (dataframe['rsi14'] > 50), ['exit_long', 'exit_tag']] = (1, 'mean_reversion')
        return dataframe

    def custom_exit(self, pair: str, trade: Trade, current_time: datetime,
                    current_rate: float, current_profit: float, **kwargs):
        return 'timeout_48h' if (current_time - trade.open_date_utc).total_seconds() >= 48 * 3600 else None


class AdxMomentumRule(StudyBase):
    """ADXMomentum signal rules, normalized stop/cooldown; original 1% ROI exit."""
    minimal_roi = {'0': 0.01}

    def populate_indicators(self, dataframe, metadata):
        dataframe['adx'] = ta.ADX(dataframe, timeperiod=14)
        dataframe['plus_di'] = ta.PLUS_DI(dataframe, timeperiod=25)
        dataframe['minus_di'] = ta.MINUS_DI(dataframe, timeperiod=25)
        dataframe['mom'] = ta.MOM(dataframe, timeperiod=14)
        return dataframe

    def populate_entry_trend(self, dataframe, metadata):
        dataframe.loc[(dataframe['adx'] > 25) & (dataframe['mom'] > 0) &
                      (dataframe['plus_di'] > 25) & (dataframe['plus_di'] > dataframe['minus_di']) &
                      (dataframe['volume'] > 0), ['enter_long', 'enter_tag']] = (1, 'adx25_di_momentum')
        return dataframe

    def populate_exit_trend(self, dataframe, metadata):
        dataframe.loc[(dataframe['adx'] > 25) & (dataframe['mom'] < 0) &
                      (dataframe['minus_di'] > 25) & (dataframe['plus_di'] < dataframe['minus_di']),
                      ['exit_long', 'exit_tag']] = (1, 'adx_bear_momentum')
        return dataframe


class SupertrendRule(StudyBase):
    """Single fixed ATR(10)*3 trend, not the upstream six optimized bands."""
    def populate_indicators(self, dataframe, metadata):
        dataframe = super().populate_indicators(dataframe, metadata)
        line, direction = supertrend(dataframe, period=10, multiplier=3)
        dataframe['supertrend'] = line
        dataframe['supertrend_up'] = Series(direction, index=dataframe.index).eq('up').astype(int)
        dataframe.loc[dataframe['supertrend'] <= 0, 'supertrend_up'] = np.nan
        return dataframe

    def populate_entry_trend(self, dataframe, metadata):
        dataframe.loc[(dataframe['supertrend_up'] == 1) &
                      (dataframe['close'] > dataframe['sma200']) &
                      (dataframe['volume'] > 0), ['enter_long', 'enter_tag']] = (1, 'st10x3_uptrend200')
        return dataframe

    def populate_exit_trend(self, dataframe, metadata):
        dataframe.loc[(dataframe['supertrend_up'] == 0) |
                      (dataframe['close'] < dataframe['sma200']), ['exit_long', 'exit_tag']] = (1, 'st_or_trend_exit')
        return dataframe


class EmaPullbackRule(StudyBase):
    """Own fixed trend-pullback prototype; no claim of reproducing TrendRider."""
    def populate_indicators(self, dataframe, metadata):
        dataframe['ema20'] = ta.EMA(dataframe, timeperiod=20)
        dataframe['ema50'] = ta.EMA(dataframe, timeperiod=50)
        dataframe['ema200'] = ta.EMA(dataframe, timeperiod=200)
        dataframe['rsi14'] = ta.RSI(dataframe, timeperiod=14)
        return dataframe

    def populate_entry_trend(self, dataframe, metadata):
        dataframe.loc[(dataframe['ema50'] > dataframe['ema200']) &
                      (dataframe['low'] < dataframe['ema20']) &
                      (dataframe['close'] > dataframe['ema20']) &
                      (dataframe['rsi14'] > 40) & (dataframe['rsi14'] < 65) &
                      (dataframe['volume'] > 0), ['enter_long', 'enter_tag']] = (1, 'ema20_pullback_uptrend')
        return dataframe

    def populate_exit_trend(self, dataframe, metadata):
        dataframe.loc[(dataframe['close'] < dataframe['ema50']) |
                      (dataframe['rsi14'] > 75), ['exit_long', 'exit_tag']] = (1, 'ema50_or_rsi75')
        return dataframe


class SmaStudy4h(SmaRule):
    timeframe = '4h'
    startup_candle_count = 240


class SmaStudy1h(SmaRule):
    timeframe = '1h'
    startup_candle_count = 240


class SmaStudy15m(SmaRule):
    timeframe = '15m'
    startup_candle_count = 240


class HorizonSmaStudy4h(HorizonSmaRule):
    timeframe = '4h'
    startup_candle_count = 240


class HorizonSmaStudy1h(HorizonSmaRule):
    timeframe = '1h'
    startup_candle_count = 900


class HorizonSmaStudy15m(HorizonSmaRule):
    timeframe = '15m'
    startup_candle_count = 3300


class DonchianStudy4h(DonchianRule):
    timeframe = '4h'
    startup_candle_count = 240


class DonchianStudy1h(DonchianRule):
    timeframe = '1h'
    startup_candle_count = 240


class DonchianStudy15m(DonchianRule):
    timeframe = '15m'
    startup_candle_count = 240


class RsiBbandsStudy4h(RsiBbandsRule):
    timeframe = '4h'
    startup_candle_count = 240


class RsiBbandsStudy1h(RsiBbandsRule):
    timeframe = '1h'
    startup_candle_count = 240


class RsiBbandsStudy15m(RsiBbandsRule):
    timeframe = '15m'
    startup_candle_count = 240


class AdxMomentumStudy4h(AdxMomentumRule):
    timeframe = '4h'
    startup_candle_count = 240


class AdxMomentumStudy1h(AdxMomentumRule):
    timeframe = '1h'
    startup_candle_count = 240


class AdxMomentumStudy15m(AdxMomentumRule):
    timeframe = '15m'
    startup_candle_count = 240


class SupertrendStudy4h(SupertrendRule):
    timeframe = '4h'
    startup_candle_count = 240


class SupertrendStudy1h(SupertrendRule):
    timeframe = '1h'
    startup_candle_count = 240


class SupertrendStudy15m(SupertrendRule):
    timeframe = '15m'
    startup_candle_count = 240


class EmaPullbackStudy4h(EmaPullbackRule):
    timeframe = '4h'
    startup_candle_count = 240


class EmaPullbackStudy1h(EmaPullbackRule):
    timeframe = '1h'
    startup_candle_count = 240


class EmaPullbackStudy15m(EmaPullbackRule):
    timeframe = '15m'
    startup_candle_count = 240
