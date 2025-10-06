
class TradingStrategy {
  analyze(technicalData, currentPosition) {
    const { rsi, trend, signals, currentPrice, sma20, volumeRatio } = technicalData;

    // Default decision
    let decision = {
      action: 'HOLD',
      quantity: 0,
      confidence: 0,
      reasoning: []
    };

    const bullishSignals = signals.filter(s => s.type.includes('BULLISH') || s.type === 'RSI_OVERSOLD');
    const bearishSignals = signals.filter(s => s.type.includes('BEARISH') || s.type === 'RSI_OVERBOUGHT');

    // Calculate position size (2% of account value)
    const baseQuantity = this.calculatePositionSize();

    // BUY CONDITIONS
    if (!currentPosition || currentPosition.quantity === 0) {
      // Only buy if we don't have a position
      if (this.shouldBuy(technicalData, bullishSignals, bearishSignals)) {
        decision = {
          action: 'BUY',
          quantity: baseQuantity,
          confidence: this.calculateConfidence(bullishSignals, bearishSignals, 'BUY'),
          reasoning: [
            `RSI: ${rsi.toFixed(2)}`,
            `Trend: ${trend}`,
            `Volume Ratio: ${volumeRatio.toFixed(2)}`,
            `Bullish signals: ${bullishSignals.length}`,
            `Price vs SMA20: ${currentPrice > sma20 ? 'Above' : 'Below'}`
          ]
        };
      }
    }

    // SELL CONDITIONS
    if (currentPosition && currentPosition.quantity > 0) {
      if (this.shouldSell(technicalData, bullishSignals, bearishSignals)) {
        decision = {
          action: 'SELL',
          quantity: Math.abs(currentPosition.quantity),
          confidence: this.calculateConfidence(bullishSignals, bearishSignals, 'SELL'),
          reasoning: [
            `RSI: ${rsi.toFixed(2)}`,
            `Trend: ${trend}`,
            `Volume Ratio: ${volumeRatio.toFixed(2)}`,
            `Bearish signals: ${bearishSignals.length}`,
            `Price vs SMA20: ${currentPrice > sma20 ? 'Above' : 'Below'}`
          ]
        };
      }
    }

    return decision;
  }

  shouldBuy(technicalData, bullishSignals, bearishSignals) {
    const { rsi, trend, volumeRatio, currentPrice, sma20 } = technicalData;

    // Conservative buy strategy
    const conditions = [
      rsi < 40,                           // RSI oversold or approaching
      trend === 'UPTREND',               // Upward trend
      currentPrice > sma20,               // Price above 20-day moving average
      bullishSignals.length >= 2,         // At least 2 bullish signals
      bearishSignals.length === 0,        // No bearish signals
      volumeRatio > 1.2                   // Above average volume
    ];

    const trueConditions = conditions.filter(Boolean).length;
    return trueConditions >= 4; // At least 4 out of 6 conditions must be true
  }

  shouldSell(technicalData, bullishSignals, bearishSignals) {
    const { rsi, trend, currentPrice, sma20 } = technicalData;

    // Conservative sell strategy
    const conditions = [
      rsi > 65,                           // RSI overbought or approaching
      trend === 'DOWNTREND',             // Downward trend
      currentPrice < sma20,               // Price below 20-day moving average
      bearishSignals.length >= 2,         // At least 2 bearish signals
      bullishSignals.length === 0         // No bullish signals
    ];

    const trueConditions = conditions.filter(Boolean).length;
    return trueConditions >= 3; // At least 3 out of 5 conditions must be true
  }

  calculateConfidence(bullishSignals, bearishSignals, action) {
    let confidence = 0;

    if (action === 'BUY') {
      confidence = Math.min(bullishSignals.length * 20, 100);
      confidence -= bearishSignals.length * 10;
    } else if (action === 'SELL') {
      confidence = Math.min(bearishSignals.length * 20, 100);
      confidence -= bullishSignals.length * 10;
    }

    return Math.max(0, Math.min(100, confidence));
  }

  calculatePositionSize() {
    // This should be calculated based on account size
    // For now, return a fixed small amount for safety
    return 1; // 1 share - adjust based on your risk management
  }
}

export default new TradingStrategy();
