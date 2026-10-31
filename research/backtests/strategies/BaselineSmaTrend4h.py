"""Paper-trading baseline only; no validated live-profit claim.

The 50/200 trend rule is a research candidate. The protective stop and cooldown
make this deployment differ from the previous standalone historical experiment.
"""
from pandas import DataFrame
from freqtrade.strategy import IStrategy


class BaselineSmaTrend4h(IStrategy):
    INTERFACE_VERSION = 3
    can_short = False
    timeframe = "4h"
    startup_candle_count = 240
    process_only_new_candles = True
    minimal_roi = {}
    stoploss = -0.08
    trailing_stop = False
    use_exit_signal = True
    exit_profit_only = False

    plot_config = {
        "main_plot": {"sma50": {"color": "#3b82f6"}, "sma200": {"color": "#f59e0b"}},
        "subplots": {},
    }

    @property
    def protections(self):
        return [{"method": "CooldownPeriod", "stop_duration_candles": 2}]

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe["sma50"] = dataframe["close"].rolling(50).mean()
        dataframe["sma200"] = dataframe["close"].rolling(200).mean()
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe.loc[
            (dataframe["sma50"] > dataframe["sma200"]) & (dataframe["volume"] > 0),
            ["enter_long", "enter_tag"],
        ] = (1, "sma50_above_sma200")
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe.loc[
            (dataframe["sma50"] < dataframe["sma200"]) & (dataframe["volume"] > 0),
            ["exit_long", "exit_tag"],
        ] = (1, "sma50_below_sma200")
        return dataframe
