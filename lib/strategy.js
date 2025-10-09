// lib/strategy.js - Fixed Professional Trading Strategy with Position Validation
class ProfessionalTradingStrategy {
  constructor() {
    // More reasonable risk management parameters
    this.MAX_POSITION_SIZE = 0.03;
    this.PROFIT_TARGET_PCT = 3; // 3% profit target
    this.STOP_LOSS_PCT = 2.0; // Increased from 1.5% to 2% (less aggressive)
    this.TRAILING_STOP_PCT = 1.0; // Increased from 0.8% to 1%
    this.RSI_OVERSOLD = 30;
    this.RSI_OVERBOUGHT = 70;
    this.COOLDOWN_MINUTES = 5;
    
    // Position Management
    this.MAX_DAILY_TRADES = 10;
    this.MAX_CONSECUTIVE_LOSSES = 3;
    this.POSITION_SIZE_REDUCTION_ON_LOSS = 0.8;
    
    // Market Conditions
    this.MIN_VOLUME_THRESHOLD = 1000;
    this.MAX_SPREAD_PCT = 0.1;
    
    // Advanced Risk Controls
    this.MAX_DRAWDOWN_PCT = 5;
    this.VOLATILITY_MULTIPLIER = 1.2;
    
    // Minimum position value to consider (prevents tiny ghost positions)
    this.MIN_POSITION_VALUE = 10; // $10 minimum position value
  }

  analyze(technicalData, currentPosition, lastTrade = null, accountInfo = null) {
    console.log('=== PROFESSIONAL STRATEGY ANALYSIS START ===');
    
    const currentPrice = technicalData.currentPrice || 0;
    const signals = technicalData.signals || [];
    
    // Calculate advanced indicators
    const rsi = this.getLatestRSI(technicalData);
    const sma20 = this.getLatestSMA(technicalData);
    const volatility = this.calculateVolatility(technicalData);
    const volume = technicalData.volume || 0;
    const trend = this.determineTrend(technicalData);
    
    // Risk assessment
    const riskMetrics = this.assessRisk(currentPosition, accountInfo, lastTrade);
    
    console.log('Risk Assessment:', riskMetrics);
    
    // Enhanced position validation
    const hasValidPosition = this.validatePosition(currentPosition, currentPrice);
    
    console.log('Position Validation:', {
      hasPosition: !!currentPosition,
      quantity: currentPosition?.quantity || 0,
      positionValue: hasValidPosition ? (currentPosition.quantity * currentPrice).toFixed(2) : 0,
      isValid: hasValidPosition
    });
    
    if (hasValidPosition) {
      return this.manageExistingPosition(
        currentPosition, currentPrice, rsi, sma20, trend, signals, riskMetrics
      );
    } else {
      // No valid position - evaluate new entry
      return this.evaluateNewPosition(
        currentPrice, rsi, sma20, trend, signals, volatility, volume, riskMetrics
      );
    }
  }

  // Enhanced position validation
  validatePosition(position, currentPrice) {
    if (!position) return false;
    
    const quantity = parseFloat(position.quantity) || 0;
    const positionValue = quantity * currentPrice;
    
    // Position must have meaningful quantity and value
    const hasValidQuantity = quantity > 0.001; // At least 0.001 ETH
    const hasValidValue = positionValue >= this.MIN_POSITION_VALUE; // At least $10
    
    console.log('Position Validation Details:', {
      quantity,
      currentPrice,
      positionValue: positionValue.toFixed(2),
      hasValidQuantity,
      hasValidValue,
      minValue: this.MIN_POSITION_VALUE
    });
    
    return hasValidQuantity && hasValidValue;
  }

  manageExistingPosition(position, currentPrice, rsi, sma20, trend, signals, riskMetrics) {
    console.log('=== MANAGING EXISTING POSITION ===');
    
    const pnlPercentage = ((currentPrice - position.averagePrice) / position.averagePrice) * 100;
    const unrealizedPnL = (currentPrice - position.averagePrice) * position.quantity;
    const positionValue = position.quantity * currentPrice;
    
    console.log(`Position Analysis:`, {
      quantity: position.quantity,
      averagePrice: position.averagePrice.toFixed(4),
      currentPrice: currentPrice.toFixed(4),
      positionValue: positionValue.toFixed(2),
      pnlPercentage: pnlPercentage.toFixed(2) + '%',
      unrealizedPnL: '$' + unrealizedPnL.toFixed(2)
    });

    // 1. STOP LOSS - More conservative threshold
    if (pnlPercentage <= -this.STOP_LOSS_PCT) {
      console.log('🚨 STOP LOSS TRIGGERED');
      return {
        action: 'SELL',
        quantity: position.quantity,
        confidence: 0.98,
        urgency: 'IMMEDIATE',
        reasoning: [
          `STOP LOSS TRIGGERED: ${pnlPercentage.toFixed(2)}% loss`,
          `Stop loss threshold: -${this.STOP_LOSS_PCT}%`,
          `Position value: $${positionValue.toFixed(2)}`,
          `Protecting capital from further losses`,
          `Unrealized P&L: $${unrealizedPnL.toFixed(2)}`
        ]
      };
    }
    
    // 2. TAKE PROFIT
    if (pnlPercentage >= this.PROFIT_TARGET_PCT) {
      console.log('🎯 PROFIT TARGET REACHED');
      return {
        action: 'SELL',
        quantity: position.quantity,
        confidence: 0.95,
        urgency: 'HIGH',
        reasoning: [
          `PROFIT TARGET REACHED: ${pnlPercentage.toFixed(2)}% profit`,
          `Target: ${this.PROFIT_TARGET_PCT}%`,
          `Position value: $${positionValue.toFixed(2)}`,
          `Securing gains as planned`,
          `Realized profit: $${unrealizedPnL.toFixed(2)}`
        ]
      };
    }
    
    // 3. TRAILING STOP - More conservative
    if (position.highWaterMark && position.highWaterMark > position.averagePrice) {
      const trailingStopPrice = position.highWaterMark * (1 - this.TRAILING_STOP_PCT / 100);
      const trailingStopLoss = ((trailingStopPrice - position.averagePrice) / position.averagePrice) * 100;
      
      // Only trigger trailing stop if we're still in profit territory
      if (currentPrice <= trailingStopPrice && trailingStopLoss > 0) {
        console.log('📉 TRAILING STOP TRIGGERED');
        return {
          action: 'SELL',
          quantity: position.quantity,
          confidence: 0.90,
          urgency: 'HIGH',
          reasoning: [
            `TRAILING STOP ACTIVATED: Price fell below trailing stop`,
            `High water mark: $${position.highWaterMark.toFixed(4)}`,
            `Trailing stop price: $${trailingStopPrice.toFixed(4)}`,
            `Current price: $${currentPrice.toFixed(4)}`,
            `Protecting accumulated gains of ${trailingStopLoss.toFixed(2)}%`
          ]
        };
      }
    }
    
    // 4. TECHNICAL ANALYSIS SELLS - More selective
    const bearishSignals = this.getBearishSignals(signals);
    const technicalSellScore = this.calculateTechnicalSellScore(rsi, sma20, currentPrice, trend, bearishSignals);
    
    // Only sell on very strong technical signals and if we're not in a small loss
    if (technicalSellScore >= 8 && pnlPercentage > -1.0) { // Increased threshold and loss protection
      console.log('📈 STRONG TECHNICAL SELL SIGNAL');
      return {
        action: 'SELL',
        quantity: position.quantity,
        confidence: Math.min(0.85, technicalSellScore / 10),
        urgency: 'MEDIUM',
        reasoning: [
          `STRONG TECHNICAL SELL SIGNAL: Score ${technicalSellScore}/10`,
          `RSI: ${rsi} (Overbought threshold: >${this.RSI_OVERBOUGHT})`,
          `Price vs SMA20: ${((currentPrice - sma20) / sma20 * 100).toFixed(2)}%`,
          `Trend: ${trend}`,
          `Bearish signals: ${bearishSignals.length}`,
          `Current P&L: ${pnlPercentage.toFixed(2)}% (safe to sell)`
        ]
      };
    }
    
    // 5. WARNING ZONE - Monitor closely but don't sell yet
    if (pnlPercentage <= -1.5 && pnlPercentage > -this.STOP_LOSS_PCT) {
      console.log('⚠️ POSITION IN WARNING ZONE - MONITORING');
    }
    
    // 6. HOLD POSITION
    console.log('✋ HOLDING POSITION');
    return {
      action: 'HOLD',
      quantity: 0,
      confidence: 0.6,
      urgency: 'LOW',
      reasoning: [
        `HOLDING POSITION: ${position.quantity} ETH @ $${position.averagePrice.toFixed(4)}`,
        `Current value: $${positionValue.toFixed(2)}`,
        `Current P&L: ${pnlPercentage.toFixed(2)}% ($${unrealizedPnL.toFixed(2)})`,
        `Stop loss trigger: ${this.STOP_LOSS_PCT}% (${(this.STOP_LOSS_PCT - Math.abs(pnlPercentage)).toFixed(2)}% buffer)`,
        `Profit target: ${this.PROFIT_TARGET_PCT}% (${(this.PROFIT_TARGET_PCT + pnlPercentage).toFixed(2)}% to go)`,
        `Technical sell score: ${technicalSellScore}/10 (need 8+ for sell)`,
        `Position meets minimum criteria - continuing to monitor`
      ]
    };
  }

  evaluateNewPosition(currentPrice, rsi, sma20, trend, signals, volatility, volume, riskMetrics) {
    console.log('=== EVALUATING NEW POSITION ENTRY ===');
    
    // Pre-flight checks
    if (riskMetrics.shouldPause) {
      return {
        action: 'HOLD',
        quantity: 0,
        confidence: 0,
        urgency: 'LOW',
        reasoning: riskMetrics.pauseReasons
      };
    }
    
    // Volume check
    if (volume < this.MIN_VOLUME_THRESHOLD) {
      return {
        action: 'HOLD',
        quantity: 0,
        confidence: 0,
        urgency: 'LOW',
        reasoning: [`Insufficient trading volume: ${volume.toLocaleString()} < ${this.MIN_VOLUME_THRESHOLD.toLocaleString()}`]
      };
    }
    
    // Calculate buy signals and score
    const bullishSignals = this.getBullishSignals(signals);
    const buyScore = this.calculateBuyScore(rsi, sma20, currentPrice, trend, bullishSignals, volume);
    
    console.log(`Buy Score Assessment: ${buyScore}/10 (need 7+ for entry)`);
    
    if (buyScore >= 7) {
      const baseSize = this.calculatePositionSize(currentPrice, volatility, riskMetrics);
      
      return {
        action: 'BUY',
        quantity: baseSize,
        confidence: Math.min(0.95, buyScore / 10),
        urgency: buyScore >= 9 ? 'HIGH' : 'MEDIUM',
        reasoning: [
          `STRONG BUY SIGNAL: Score ${buyScore}/10`,
          `Entry price: $${currentPrice.toFixed(4)}`,
          `Position size: ${baseSize} ETH (~$${(baseSize * currentPrice).toFixed(2)})`,
          `RSI: ${rsi} (Oversold threshold: <${this.RSI_OVERSOLD})`,
          `Price vs SMA20: ${((currentPrice - sma20) / sma20 * 100).toFixed(2)}%`,
          `Trend: ${trend}`,
          `Bullish signals: ${bullishSignals.length}`,
          `Volume: ${volume.toLocaleString()}`,
          `Stop loss will be set at ${this.STOP_LOSS_PCT}% ($${(currentPrice * (1 - this.STOP_LOSS_PCT/100)).toFixed(4)})`,
          `Profit target at ${this.PROFIT_TARGET_PCT}% ($${(currentPrice * (1 + this.PROFIT_TARGET_PCT/100)).toFixed(4)})`
        ]
      };
    }
    
    // No clear signal
    return {
      action: 'HOLD',
      quantity: 0,
      confidence: 0.3,
      urgency: 'LOW',
      reasoning: [
        `WAITING FOR CLEAR ENTRY SIGNAL: Buy score ${buyScore}/10 (need 7+)`,
        `Current price: $${currentPrice.toFixed(4)}`,
        `RSI: ${rsi} (need <${this.RSI_OVERSOLD} for oversold signal)`,
        `Price vs SMA20: ${((currentPrice - sma20) / sma20 * 100).toFixed(2)}%`,
        `Trend: ${trend}`,
        `Volume: ${volume.toLocaleString()}`,
        `Bullish signals: ${bullishSignals.length}`,
        `Waiting for higher probability setup`
      ]
    };
  }

  // Professional risk assessment
  assessRisk(currentPosition, accountInfo, lastTrade) {
    const risks = {
      shouldPause: false,
      pauseReasons: [],
      positionSizeMultiplier: 1.0,
      riskLevel: 'LOW'
    };
    
    // Check for consecutive losses
    if (this.hasConsecutiveLosses(lastTrade, this.MAX_CONSECUTIVE_LOSSES)) {
      risks.shouldPause = true;
      risks.pauseReasons.push(`${this.MAX_CONSECUTIVE_LOSSES} consecutive losses - pausing to reassess`);
      risks.riskLevel = 'HIGH';
    }
    
    return risks;
  }

  // Calculate buy score (0-10) - more selective
  calculateBuyScore(rsi, sma20, currentPrice, trend, bullishSignals, volume) {
    let score = 0;
    
    // RSI oversold (0-3 points)
    if (rsi < this.RSI_OVERSOLD) score += 3;
    else if (rsi < this.RSI_OVERSOLD + 10) score += 2;
    else if (rsi < 50) score += 1;
    
    // Price vs SMA (0-2 points)
    const smaDistance = (currentPrice - sma20) / sma20;
    if (smaDistance > 0.02) score += 2;
    else if (smaDistance > 0) score += 1;
    
    // Trend (0-2 points)
    if (trend === 'UPTREND') score += 2;
    else if (trend === 'NEUTRAL') score += 1;
    
    // Bullish signals (0-2 points)
    score += Math.min(2, bullishSignals.length);
    
    // Volume confirmation (0-1 point)
    if (volume > this.MIN_VOLUME_THRESHOLD * 2) score += 1;
    
    return Math.min(10, score);
  }

  // Calculate technical sell score (0-10) - more selective
  calculateTechnicalSellScore(rsi, sma20, currentPrice, trend, bearishSignals) {
    let score = 0;
    
    // RSI overbought (0-3 points)
    if (rsi > this.RSI_OVERBOUGHT + 10) score += 3; // Very overbought
    else if (rsi > this.RSI_OVERBOUGHT) score += 2;
    else if (rsi > 60) score += 1;
    
    // Price vs SMA (0-2 points)
    const smaDistance = (currentPrice - sma20) / sma20;
    if (smaDistance < -0.03) score += 2; // Well below SMA
    else if (smaDistance < -0.01) score += 1;
    
    // Trend (0-3 points) - Increased weight
    if (trend === 'DOWNTREND') score += 3;
    else if (trend === 'NEUTRAL') score += 1;
    
    // Bearish signals (0-2 points)
    score += Math.min(2, bearishSignals.length);
    
    return Math.min(10, score);
  }

  // Professional position sizing
  calculatePositionSize(currentPrice, volatility = 0.02, riskMetrics) {
    let baseSize = this.MAX_POSITION_SIZE;
    
    // Adjust for volatility
    const volAdjustment = Math.max(0.5, Math.min(1.5, 1 / (volatility * this.VOLATILITY_MULTIPLIER)));
    baseSize *= volAdjustment;
    
    // Adjust for risk metrics
    baseSize *= riskMetrics.positionSizeMultiplier;
    
    // Price-based adjustment
    if (currentPrice > 4000) baseSize *= 0.8;
    else if (currentPrice > 3000) baseSize *= 0.9;
    
    return Math.max(0.01, Math.min(this.MAX_POSITION_SIZE, baseSize));
  }

  // Calculate volatility from historical data
  calculateVolatility(technicalData) {
    if (!technicalData.historical || technicalData.historical.length < 10) return 0.02;
    
    const returns = [];
    for (let i = 1; i < Math.min(technicalData.historical.length, 20); i++) {
      const curr = technicalData.historical[i].close;
      const prev = technicalData.historical[i-1].close;
      if (prev > 0) {
        returns.push((curr - prev) / prev);
      }
    }
    
    if (returns.length < 2) return 0.02;
    
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance);
  }

  // Helper methods
  getLatestRSI(technicalData) {
    try {
      if (technicalData.rsi && Array.isArray(technicalData.rsi) && technicalData.rsi.length > 0) {
        return technicalData.rsi[technicalData.rsi.length - 1].value || 50;
      }
      return 50;
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

  // Helper methods for risk management
  hasConsecutiveLosses(lastTrade, maxLosses) {
    return false; // Implement based on trade history
  }

  exceedsDailyTradeLimit() {
    return false; // Implement based on daily trade count
  }

  calculateDrawdown(accountInfo) {
    return 0; // Implement based on account high water mark
  }
}

export default new ProfessionalTradingStrategy();