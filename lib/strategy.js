// lib/strategy.js - Enhanced trading strategy with safety controls
class TradingStrategy {
  constructor() {
    this.MIN_PRICE_CHANGE_PCT = 2; // Minimum 2% price movement to consider trades
    this.MAX_POSITION_SIZE = 0.02; // Maximum 0.02 ETH per trade
    this.PROFIT_TARGET_PCT = 4; // Take profit at 4%
    this.STOP_LOSS_PCT = 2.5; // Stop loss at 2.5%
    this.RSI_OVERSOLD = 35; // More conservative RSI levels
    this.RSI_OVERBOUGHT = 65;
    this.COOLDOWN_MINUTES = 15; // 15 minutes between trades
  }

  analyze(technicalData, currentPosition, lastTrade = null) {
    console.log('=== STRATEGY ANALYSIS START ===');
    console.log('Current position:', JSON.stringify(currentPosition, null, 2));
    console.log('Last trade:', JSON.stringify(lastTrade, null, 2));
    console.log('Technical data keys:', Object.keys(technicalData));
    
    // Extract data with safer defaults
    const currentPrice = technicalData.currentPrice || 0;
    const signals = technicalData.signals || [];
    
    // Calculate basic indicators from technical data
    const rsi = this.getLatestRSI(technicalData);
    const sma20 = this.getLatestSMA(technicalData);
    const trend = this.determineTrend(technicalData);
    
    console.log('Calculated indicators:', { rsi, sma20, trend, currentPrice });

    // Check if we have a position
    const hasPosition = currentPosition && currentPosition.quantity > 0;
    const positionValue = hasPosition ? currentPosition.quantity * currentPrice : 0;
    const unrealizedPnL = hasPosition ? (currentPrice - currentPosition.averagePrice) * currentPosition.quantity : 0;
    const pnlPercentage = hasPosition ? ((currentPrice - currentPosition.averagePrice) / currentPosition.averagePrice) * 100 : 0;
    
    console.log('Position analysis:', { 
      hasPosition, 
      quantity: currentPosition?.quantity || 0,
      averagePrice: currentPosition?.averagePrice || 0,
      currentValue: positionValue,
      unrealizedPnL,
      pnlPercentage: pnlPercentage.toFixed(2) + '%'
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

    // SAFETY CHECK: Cooldown period
    if (lastTrade) {
      const lastTradeTime = new Date(lastTrade.timestamp);
      const timeSinceLastTrade = (Date.now() - lastTradeTime.getTime()) / (1000 * 60); // minutes
      
      if (timeSinceLastTrade < this.COOLDOWN_MINUTES) {
        const remainingCooldown = this.COOLDOWN_MINUTES - timeSinceLastTrade;
        decision.reasoning.push(`In cooldown period: ${remainingCooldown.toFixed(1)} minutes remaining`);
        console.log('=== STRATEGY DECISION: COOLDOWN ===');
        return decision;
      }
    }

    // Calculate position size
    const baseQuantity = this.calculatePositionSize(currentPrice);

    // SELL CONDITIONS - Check these FIRST (priority)
    if (hasPosition) {
      console.log('Evaluating SELL conditions...');
      
      // 1. PROFIT TAKING
      if (pnlPercentage >= this.PROFIT_TARGET_PCT) {
        decision = {
          action: 'SELL',
          quantity: currentPosition.quantity,
          confidence: 0.95,
          reasoning: [
            `PROFIT TARGET HIT: ${pnlPercentage.toFixed(2)}% profit`,
            `Target: ${this.PROFIT_TARGET_PCT}%`,
            `Unrealized P&L: $${unrealizedPnL.toFixed(2)}`
          ]
        };
        console.log('=== STRATEGY DECISION: SELL (PROFIT) ===', decision);
        return decision;
      }

      // 2. STOP LOSS
      if (pnlPercentage <= -this.STOP_LOSS_PCT) {
        decision = {
          action: 'SELL',
          quantity: currentPosition.quantity,
          confidence: 0.90,
          reasoning: [
            `STOP LOSS TRIGGERED: ${pnlPercentage.toFixed(2)}% loss`,
            `Stop loss: -${this.STOP_LOSS_PCT}%`,
            `Unrealized P&L: $${unrealizedPnL.toFixed(2)}`
          ]
        };
        console.log('=== STRATEGY DECISION: SELL (STOP LOSS) ===', decision);
        return decision;
      }

      // 3. TECHNICAL SELL SIGNALS
      const shouldSellTechnical = this.shouldSellOnTechnicals(rsi, sma20, currentPrice, trend, bearishSignals);
      
      if (shouldSellTechnical) {
        decision = {
          action: 'SELL',
          quantity: currentPosition.quantity,
          confidence: 0.75,
          reasoning: [
            `Technical sell signal triggered`,
            `RSI: ${rsi}`,
            `Trend: ${trend}`,
            `Bearish signals: ${bearishSignals.length}`,
            `Current P&L: ${pnlPercentage.toFixed(2)}%`
          ]
        };
        console.log('=== STRATEGY DECISION: SELL (TECHNICAL) ===', decision);
        return decision;
      }

      // HOLD POSITION
      decision.reasoning = [
        `Holding position: ${currentPosition.quantity} @ $${currentPosition.averagePrice}`,
        `Current P&L: ${pnlPercentage.toFixed(2)}% ($${unrealizedPnL.toFixed(2)})`,
        `Profit target: ${this.PROFIT_TARGET_PCT}%`,
        `Stop loss: -${this.STOP_LOSS_PCT}%`,
        `RSI: ${rsi}`,
        `No sell signals triggered`
      ];
      console.log('=== STRATEGY DECISION: HOLD POSITION ===');
      return decision;
    }

    // BUY CONDITIONS - Only when NO position exists
    if (!hasPosition) {
      console.log('Evaluating BUY conditions...');
      
      if (this.shouldBuy(rsi, sma20, currentPrice, trend, bullishSignals, bearishSignals)) {
        decision = {
          action: 'BUY',
          quantity: baseQuantity,
          confidence: this.calculateConfidence(bullishSignals, bearishSignals, 'BUY'),
          reasoning: [
            `No current position - safe to buy`,
            `RSI: ${rsi} (target: < ${this.RSI_OVERSOLD})`,
            `Trend: ${trend}`,
            `Bullish signals: ${bullishSignals.length}`,
            `Price vs SMA20: ${currentPrice > sma20 ? 'Above' : 'Below'}`,
            `Current Price: $${currentPrice}`,
            `Position size: ${baseQuantity} ETH`
          ]
        };
        console.log('=== STRATEGY DECISION: BUY ===', decision);
        return decision;
      } else {
        decision.reasoning = [
          `No buy signal - waiting for better entry`,
          `RSI: ${rsi} (need < ${this.RSI_OVERSOLD})`,
          `Trend: ${trend}`,
          `Price vs SMA20: ${currentPrice > sma20 ? 'Above' : 'Below'}`,
          `Bullish: ${bullishSignals.length}, Bearish: ${bearishSignals.length}`,
          `Current Price: $${currentPrice}`
        ];
        console.log('=== STRATEGY DECISION: NO BUY SIGNAL ===');
        return decision;
      }
    }

    console.log('=== STRATEGY ANALYSIS END ===');
    return decision;
  }

  shouldBuy(rsi, sma20, currentPrice, trend, bullishSignals, bearishSignals) {
    // Very conservative buy conditions - ALL must be true
    const conditions = [
      rsi < this.RSI_OVERSOLD,           // RSI oversold
      trend !== 'DOWNTREND',            // Not in downtrend
      bullishSignals.length >= 1,       // At least 1 bullish signal
      bearishSignals.length <= 1,       // Not too many bearish signals
      currentPrice > (sma20 * 0.99)     // Price near or above SMA20
    ];

    const trueConditions = conditions.filter(Boolean).length;
    console.log('Buy conditions check:', {
      rsiOversold: rsi < this.RSI_OVERSOLD,
      notDowntrend: trend !== 'DOWNTREND',
      bullishSignals: bullishSignals.length >= 1,
      lowBearishSignals: bearishSignals.length <= 1,
      priceAboveSMA: currentPrice > (sma20 * 0.99),
      totalTrue: trueConditions,
      required: 5
    });
    
    return trueConditions >= 5; // ALL 5 conditions must be true
  }

  shouldSellOnTechnicals(rsi, sma20, currentPrice, trend, bearishSignals) {
    // Technical sell conditions - need at least 2
    const conditions = [
      rsi > this.RSI_OVERBOUGHT,        // RSI overbought
      currentPrice < sma20 * 0.98,     // Price below SMA20
      bearishSignals.length >= 2,      // Multiple bearish signals
      trend === 'DOWNTREND'            // Downtrend confirmed
    ];

    const trueConditions = conditions.filter(Boolean).length;
    console.log('Technical sell conditions:', {
      rsiOverbought: rsi > this.RSI_OVERBOUGHT,
      priceBelowSMA: currentPrice < sma20 * 0.98,
      multipleBearish: bearishSignals.length >= 2,
      downtrend: trend === 'DOWNTREND',
      totalTrue: trueConditions
    });
    
    return trueConditions >= 2;
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
      if (technicalData.sma && technicalData.sma.length >= 3) {
        const latest = technicalData.sma[technicalData.sma.length - 1].value;
        const previous = technicalData.sma[technicalData.sma.length - 2].value;
        const older = technicalData.sma[technicalData.sma.length - 3].value;
        
        if (latest > previous && previous > older) return 'UPTREND';
        if (latest < previous && previous < older) return 'DOWNTREND';
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
      confidence = Math.min(bullishSignals.length * 20 + 30, 100);
      confidence -= bearishSignals.length * 15;
    } else if (action === 'SELL') {
      confidence = Math.min(bearishSignals.length * 20 + 30, 100);
      confidence -= bullishSignals.length * 15;
    }
    
    return Math.max(20, Math.min(100, confidence));
  }

  calculatePositionSize(currentPrice = 3000) {
    // Conservative position size based on price
    if (currentPrice > 4000) return 0.01;      // $40+ per trade
    if (currentPrice > 3000) return 0.015;    // $45+ per trade  
    if (currentPrice > 2000) return 0.02;     // $40+ per trade
    return this.MAX_POSITION_SIZE;             // Default max
  }
}

export default new TradingStrategy();
