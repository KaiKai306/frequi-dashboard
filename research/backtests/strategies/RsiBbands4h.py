"""Fixed mean-reversion candidate with a 200-bar trend filter and 48h timeout."""
from datetime import datetime
from pandas import DataFrame
import talib.abstract as ta
from freqtrade.persistence import Trade
from BaselineSmaTrend4h import BaselineSmaTrend4h


class RsiBbands4h(BaselineSmaTrend4h):
    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe = super().populate_indicators(dataframe, metadata)
        dataframe['sma20'] = dataframe['close'].rolling(20).mean()
        dataframe['lower_band'] = dataframe['sma20'] - 2 * dataframe['close'].rolling(20).std(ddof=0)
        dataframe['rsi14'] = ta.RSI(dataframe, timeperiod=14)
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe.loc[(dataframe['close'] < dataframe['lower_band']) &
                      (dataframe['rsi14'] < 30) & (dataframe['close'] > dataframe['sma200']) &
                      (dataframe['volume'] > 0), ['enter_long', 'enter_tag']] = (1, 'rsi30_lower_band_uptrend')
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe.loc[(dataframe['close'] >= dataframe['sma20']) |
                      (dataframe['rsi14'] > 50), ['exit_long', 'exit_tag']] = (1, 'mean_reversion_exit')
        return dataframe

    def custom_exit(self, pair: str, trade: Trade, current_time: datetime,
                    current_rate: float, current_profit: float, **kwargs):
        if (current_time - trade.open_date_utc).total_seconds() >= 48 * 3600:
            return 'timeout_48h'
        return None
