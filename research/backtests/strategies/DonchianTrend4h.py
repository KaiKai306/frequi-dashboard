"""Fixed 20/10 breakout candidate; same risk rules as the deployed baseline."""
from pandas import DataFrame
from BaselineSmaTrend4h import BaselineSmaTrend4h


class DonchianTrend4h(BaselineSmaTrend4h):
    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe = super().populate_indicators(dataframe, metadata)
        dataframe['high20'] = dataframe['high'].rolling(20).max().shift(1)
        dataframe['low10'] = dataframe['low'].rolling(10).min().shift(1)
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe.loc[(dataframe['close'] > dataframe['high20']) &
                      (dataframe['close'] > dataframe['sma200']) &
                      (dataframe['volume'] > 0), ['enter_long', 'enter_tag']] = (1, 'breakout20_above_sma200')
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe.loc[(dataframe['close'] < dataframe['low10']) |
                      (dataframe['close'] < dataframe['sma200']), ['exit_long', 'exit_tag']] = (1, 'channel10_or_trend_exit')
        return dataframe
