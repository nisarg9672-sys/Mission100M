class TradingStrategy {
  analyze(technicalData, currentPosition) {
    console.log('Strategy analyzing data:', JSON.stringify(technicalData, null, 2));
    console.log('Current position:', JSON.stringify(currentPosition, null, 2));
    
    // Extract data with safer defaults
    const currentPrice = technicalData.currentPrice || 0;
    const signals = technicalData.signals || [];
    
    // Calculate basic indicators from technical data
    const rsi = this.getLatestRSI(technicalData);
    const sma20 = this.getLatestSMA(technicalData);
    const trend = this.determineTrend(technicalData);
    const volumeRatio = 1.0; // Default volume ratio
    
    console.log('Calculated values:', { rsi, sma20, trend, currentPrice, signalsCount: signals.length });

    // Check if we have a position
    const hasPosition = currentPosition && currentPosition.quantity > 0;
    const positionValue = hasPosition ? currentPosition.quantity * currentPrice : 0;
    const unrealizedPnL = hasPosition ? (currentPrice - currentPosition.averagePrice) * currentPosition.quantity : 0;
    
    console.log('Position analysis:', { 
      hasPosition, 
      quantity: currentPosition?.quantity || 0,
      averagePrice: currentPosition?.averagePrice || 0,
      currentValue: positionValue,
      unrealizedPnL 
    });

    // Default decision
    let decision = {
      action: 'HOLD',
      quantity: 0,
      confidence: 0,
      reasoning: []
    };

    // Convert signals to bullish/bearish arrays
    const bullishSignals = this.getBullishSignals(signals);
    const bearishSignals = this.getBearishSignals(signals);
    
    console.log('Signal analysis:', { bullishCount: bullishSignals.length, bearishCount: bearishSignals.length });

    // Calculate position size
    const baseQuantity = this.calculatePositionSize();

    // BUY CONDITIONS - Only when we DON'T have a position
    if (!hasPosition) {
      if (this.shouldBuy(rsi, sma20, currentPrice, trend, bullishSignals, bearishSignals)) {
        decision = {
          action: 'BUY',
          quantity: baseQuantity,
          confidence: this.calculateConfidence(bullishSignals, bearishSignals, 'BUY'),
          reasoning: [
            `No current position - safe to buy`,
            `RSI: ${rsi}`,
            `Trend: ${trend}`,
            `Volume Ratio: ${volumeRatio}`,
            `Bullish signals: ${bullishSignals.length}`,
            `Price vs SMA20: ${currentPrice > sma20 ? 'Above' : 'Below'}`,
            `Current Price: ${currentPrice}`
          ]
        };
      } else {
        decision.reasoning = [
          `No buy signal - Position: None`,
          `RSI: ${rsi}`,
          `Trend: ${trend}`,
          `Price vs SMA20: ${currentPrice > sma20 ? 'Above' : 'Below'}`,
          `Bullish: ${bullishSignals.length}, Bearish: ${bearishSignals.length}`
        ];
      }
    }

    // SELL CONDITIONS - Only when we HAVE a position
    if (hasPosition) {
      const shouldSellForProfit = this.shouldSellForProfit(currentPosition, currentPrice, unrealizedPnL);
      const shouldSellForLoss = this.shouldSellForLoss(currentPosition, currentPrice, unrealizedPnL);
      const shouldSellTechnical = this.shouldSell(rsi, sma20, currentPrice, trend, bullishSignals, bearishSignals);
      
      if (shouldSellForProfit || shouldSellForLoss || shouldSellTechnical) {
        decision = {
          action: 'SELL',
          quantity: Math.abs(currentPosition.quantity),
          confidence: this.calculateConfidence(bullishSignals, bearishSignals, 'SELL'),
          reasoning: [
            `Current position: ${currentPosition.quantity} @ $${currentPosition.averagePrice}`,
            `Current price: $${currentPrice}`,
            `Unrealized P&L: $${unrealizedPnL.toFixed(2)}`,
            `Profit sell: ${shouldSellForProfit}`,
            `Stop loss: ${shouldSellForLoss}`,
            `Technical sell: ${shouldSellTechnical}`,
            `RSI: ${rsi}`,
            `Trend: ${trend}`,
            `Bearish signals: ${bearishSignals.length}`
          ]
        };
      } else {
        decision.reasoning = [
          `Holding position: ${currentPosition.quantity} @ $${currentPosition.averagePrice}`,
          `Current price: $${currentPrice}`,
          `Unrealized P&L: $${unrealizedPnL.toFixed(2)}`,
          `No sell signals triggered`,
          `RSI: ${rsi}`,
          `Trend: ${trend}`
        ];
      }
    }

    console.log('Final decision:', decision);
    return decision;
  }

  shouldBuy(rsi, sma20, currentPrice, trend, bullishSignals, bearishSignals) {
    // More conservative buy conditions - need 3 out of 6 conditions
    const conditions = [
      rsi < 45,                             // RSI below 45 (oversold territory)
      currentPrice > (sma20 * 0.98),       // Price near or above SMA20 (with 2% tolerance)
      bullishSignals.length >= 1,          // At least 1 bullish signal
      bearishSignals.length <= 1,          // Not too many bearish signals
      trend !== 'DOWNTREND',               // Not in strong downtrend
      Math.abs(currentPrice - sma20) / sma20 < 0.05  // Price within 5% of SMA20
    ];

    const trueConditions = conditions.filter(Boolean).length;
    console.log('Buy conditions check:', conditions, 'True conditions:', trueConditions);
    
    return trueConditions >= 3; // Need 3 out of 6 conditions (more conservative)
  }

  shouldSell(rsi, sma20, currentPrice, trend, bullishSignals, bearishSignals) {
    // Technical sell conditions
    const conditions = [
      rsi > 70,                           // RSI overbought
      currentPrice < sma20 * 0.98,       // Price significantly below SMA20
      bearishSignals.length >= 2,        // At least 2 bearish signals
      trend === 'DOWNTREND'              // Downward trend
    ];

    const trueConditions = conditions.filter(Boolean).length;
    return trueConditions >= 2; // At least 2 out of 4 conditions
  }

  shouldSellForProfit(currentPosition, currentPrice, unrealizedPnL) {
    if (!currentPosition || currentPosition.quantity <= 0) return false;
    
    const profitPercent = (currentPrice - currentPosition.averagePrice) / currentPosition.averagePrice * 100;
    
    // Take profit at 5% gain or $50 profit (whichever comes first)
    return profitPercent >= 5 || unrealizedPnL >= 50;
  }

  shouldSellForLoss(currentPosition, currentPrice, unrealizedPnL) {
    if (!currentPosition || currentPosition.quantity <= 0) return false;
    
    const lossPercent = (currentPosition.averagePrice - currentPrice) / currentPosition.averagePrice * 100;
    
    // Stop loss at 3% loss or $25 loss (whichever comes first)
    return lossPercent >= 3 || unrealizedPnL <= -25;
  }

  getLatestRSI(technicalData) {
    try {
      if (technicalData.rsi && Array.isArray(technicalData.rsi) && technicalData.rsi.length > 0) {
        return technicalData.rsi[technicalData.rsi.length - 1].value || 50;
      }
      return 50; // Default neutral RSI
    } catch (error) {
      console.log('Error getting RSI:', error);
      return 50;
    }
  }

  getLatestSMA(technicalData) {
    try {
      if (technicalData.sma && Array.isArray(technicalData.sma) && technicalData.sma.length > 0) {
        return technicalData.sma[technicalData.sma.length - 1].value || technicalData.currentPrice;
      }
      return technicalData.currentPrice || 0;
    } catch (error) {
      console.log('Error getting SMA:', error);
      return technicalData.currentPrice || 0;
    }
  }

  determineTrend(technicalData) {
    try {
      // Simple trend determination based on SMA
      if (technicalData.sma && technicalData.sma.length >= 2) {
        const latest = technicalData.sma[technicalData.sma.length - 1].value;
        const previous = technicalData.sma[technicalData.sma.length - 2].value;
        
        if (latest > previous * 1.01) return 'UPTREND';
        if (latest < previous * 0.99) return 'DOWNTREND';
      }
      return 'NEUTRAL';
    } catch (error) {
      console.log('Error determining trend:', error);
      return 'NEUTRAL';
    }
  }

  getBullishSignals(signals) {
    if (!Array.isArray(signals)) return [];
    return signals.filter(s => 
      s && (
        (typeof s === 'string' && s.includes('BUY')) ||
        (typeof s === 'object' && s.type && s.type.includes('BUY'))
      )
    );
  }

  getBearishSignals(signals) {
    if (!Array.isArray(signals)) return [];
    return signals.filter(s => 
      s && (
        (typeof s === 'string' && s.includes('SELL')) ||
        (typeof s === 'object' && s.type && s.type.includes('SELL'))
      )
    );
  }

  calculateConfidence(bullishSignals, bearishSignals, action) {
    let confidence = 0;
    
    if (action === 'BUY') {
      confidence = Math.min(bullishSignals.length * 25 + 25, 100); // Base 25% + 25% per signal
      confidence -= bearishSignals.length * 10;
    } else if (action === 'SELL') {
      confidence = Math.min(bearishSignals.length * 25 + 25, 100);
      confidence -= bullishSignals.length * 10;
    }
    
    return Math.max(10, Math.min(100, confidence)); // Min 10%, max 100%
  }

  calculatePositionSize() {
    // Conservative position size - you can adjust this based on your capital
    return 0.01; // Start with 0.01 ETH (about $30-40)
  }
}

export default new TradingStrategy();
