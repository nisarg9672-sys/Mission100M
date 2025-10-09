// lib/strategy.js - Professional Trading Strategy with Active Position Management
class ProfessionalTradingStrategy {
  constructor() {
    // Risk Management Parameters (Professional Stock Broker Style)
    this.MAX_POSITION_SIZE = 0.03; // Conservative position sizing
    this.PROFIT_TARGET_PCT = 3; // Take profit at 3% (more realistic)
    this.STOP_LOSS_PCT = 1.5; // Tight stop loss at 1.5%
    this.TRAILING_STOP_PCT = 0.8; // Trailing stop at 0.8%
    this.RSI_OVERSOLD = 30; // Standard RSI oversold
    this.RSI_OVERBOUGHT = 70; // Standard RSI overbought
    this.COOLDOWN_MINUTES = 5; // Shorter cooldown for active trading
    
    // Position Management
    this.MAX_DAILY_TRADES = 10; // Limit daily trades
    this.MAX_CONSECUTIVE_LOSSES = 3; // Stop after 3 losses
    this.POSITION_SIZE_REDUCTION_ON_LOSS = 0.8; // Reduce size after loss
    
    // Market Conditions
    this.MIN_VOLUME_THRESHOLD = 1000; // Minimum volume for trades
    this.MAX_SPREAD_PCT = 0.1; // Maximum bid-ask spread %
    
    // Advanced Risk Controls
    this.MAX_DRAWDOWN_PCT = 5; // Maximum portfolio drawdown
    this.VOLATILITY_MULTIPLIER = 1.2; // Adjust position size based on volatility
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
    
    // Check if we have a position
    const hasPosition = currentPosition && currentPosition.quantity > 0;
    
    if (hasPosition) {
      return this.manageExistingPosition(
        currentPosition, currentPrice, rsi, sma20, trend, signals, riskMetrics
      );
    } else {
      return this.evaluateNewPosition(
        currentPrice, rsi, sma20, trend, signals, volatility, volume, riskMetrics
      );
    }
  }

  manageExistingPosition(position, currentPrice, rsi, sma20, trend, signals, riskMetrics) {
    console.log('=== MANAGING EXISTING POSITION ===');
    
    const pnlPercentage = ((currentPrice - position.averagePrice) / position.averagePrice) * 100;
    const unrealizedPnL = (currentPrice - position.averagePrice) * position.quantity;
    
    console.log(`Position P&L: ${pnlPercentage.toFixed(2)}% ($${unrealizedPnL.toFixed(2)})`);
    
    // 1. IMMEDIATE RISK MANAGEMENT (Priority 1)
    
    // Stop Loss - Immediate execution
    if (pnlPercentage <= -this.STOP_LOSS_PCT) {
      return {
        action: 'SELL',
        quantity: position.quantity,
        confidence: 0.98,
        urgency: 'IMMEDIATE',
        reasoning: [
          `STOP LOSS TRIGGERED: ${pnlPercentage.toFixed(2)}% loss`,
          `Stop loss threshold: -${this.STOP_LOSS_PCT}%`,
          `Protecting capital from further losses`,
          `Unrealized P&L: $${unrealizedPnL.toFixed(2)}`
        ]
      };
    }
    
    // Take Profit - Secure gains
    if (pnlPercentage >= this.PROFIT_TARGET_PCT) {
      return {
        action: 'SELL',
        quantity: position.quantity,
        confidence: 0.95,
        urgency: 'HIGH',
        reasoning: [
          `PROFIT TARGET REACHED: ${pnlPercentage.toFixed(2)}% profit`,
          `Target: ${this.PROFIT_TARGET_PCT}%`,
          `Securing gains as planned`,
          `Realized profit: $${unrealizedPnL.toFixed(2)}`
        ]
      };
    }
    
    // 2. TRAILING STOP LOGIC
    const trailingStopPrice = position.highWaterMark ? 
      position.highWaterMark * (1 - this.TRAILING_STOP_PCT / 100) : 
      position.averagePrice * (1 + this.TRAILING_STOP_PCT / 100);
    
    if (currentPrice < trailingStopPrice) {
      return {
        action: 'SELL',
        quantity: position.quantity,
        confidence: 0.90,
        urgency: 'HIGH',
        reasoning: [
          `TRAILING STOP ACTIVATED: Price fell below trailing stop`,
          `Trailing stop price: $${trailingStopPrice.toFixed(2)}`,
          `Current price: $${currentPrice.toFixed(2)}`,
          `Protecting accumulated gains`
        ]
      };
    }
    
    // 3. TECHNICAL ANALYSIS SELLS
    const bearishSignals = this.getBearishSignals(signals);
    const technicalSellScore = this.calculateTechnicalSellScore(rsi, sma20, currentPrice, trend, bearishSignals);
    
    if (technicalSellScore >= 7) { // High confidence technical sell
      return {
        action: 'SELL',
        quantity: position.quantity,
        confidence: Math.min(0.85, technicalSellScore / 10),
        urgency: 'MEDIUM',
        reasoning: [
          `STRONG TECHNICAL SELL SIGNAL: Score ${technicalSellScore}/10`,
          `RSI: ${rsi} (Overbought: >${this.RSI_OVERBOUGHT})`,
          `Price vs SMA20: ${((currentPrice - sma20) / sma20 * 100).toFixed(2)}%`,
          `Trend: ${trend}`,
          `Bearish signals: ${bearishSignals.length}`,
          `Current P&L: ${pnlPercentage.toFixed(2)}%`
        ]
      };
    }
    
    // 4. PARTIAL PROFIT TAKING (Risk Management)
    if (pnlPercentage >= this.PROFIT_TARGET_PCT * 0.7) { // At 70% of profit target
      const partialSellQuantity = position.quantity * 0.5; // Sell 50%
      return {
        action: 'SELL',
        quantity: partialSellQuantity,
        confidence: 0.75,
        urgency: 'MEDIUM',
        reasoning: [
          `PARTIAL PROFIT TAKING: Securing 50% of position`,
          `Current profit: ${pnlPercentage.toFixed(2)}%`,
          `Reducing risk while maintaining upside exposure`,
          `Selling ${partialSellQuantity} of ${position.quantity} total`
        ]
      };
    }
    
    // 5. HOLD POSITION (Continue monitoring)
    return {
      action: 'HOLD',
      quantity: 0,
      confidence: 0.6,
      urgency: 'LOW',
      reasoning: [
        `HOLDING POSITION: ${position.quantity} @ $${position.averagePrice}`,
        `Current P&L: ${pnlPercentage.toFixed(2)}% ($${unrealizedPnL.toFixed(2)})`,
        `Stop loss: -${this.STOP_LOSS_PCT}% (${((position.averagePrice * (1 - this.STOP_LOSS_PCT/100)) - currentPrice).toFixed(2)} away)`,
        `Profit target: ${this.PROFIT_TARGET_PCT}% (${((position.averagePrice * (1 + this.PROFIT_TARGET_PCT/100)) - currentPrice).toFixed(2)} away)`,
        `Technical sell score: ${technicalSellScore}/10 (need 7+)`,
        `Monitoring for exit signals...`
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
    
    // Volume check (liquidity requirement)
    if (volume < this.MIN_VOLUME_THRESHOLD) {
      return {
        action: 'HOLD',
        quantity: 0,
        confidence: 0,
        urgency: 'LOW',
        reasoning: [`Insufficient volume: ${volume} < ${this.MIN_VOLUME_THRESHOLD}`]
      };
    }
    
    // Calculate buy signals and score
    const bullishSignals = this.getBullishSignals(signals);
    const buyScore = this.calculateBuyScore(rsi, sma20, currentPrice, trend, bullishSignals, volume);
    
    console.log(`Buy Score: ${buyScore}/10 (need 7+)`);
    
    if (buyScore >= 7) {
      // Calculate position size based on volatility and risk
      const baseSize = this.calculatePositionSize(currentPrice, volatility, riskMetrics);
      
      return {
        action: 'BUY',
        quantity: baseSize,
        confidence: Math.min(0.95, buyScore / 10),
        urgency: buyScore >= 9 ? 'HIGH' : 'MEDIUM',
        reasoning: [
          `STRONG BUY SIGNAL: Score ${buyScore}/10`,
          `RSI: ${rsi} (Oversold threshold: <${this.RSI_OVERSOLD})`,
          `Price vs SMA20: ${((currentPrice - sma20) / sma20 * 100).toFixed(2)}%`,
          `Trend: ${trend}`,
          `Bullish signals: ${bullishSignals.length}`,
          `Volume: ${volume.toLocaleString()}`,
          `Position size: ${baseSize} (volatility adjusted)`,
          `Risk-adjusted entry with tight stop loss at ${this.STOP_LOSS_PCT}%`
        ]
      };
    }
    
    // No clear signal - wait for better opportunity
    return {
      action: 'HOLD',
      quantity: 0,
      confidence: 0.3,
      urgency: 'LOW',
      reasoning: [
        `WAITING FOR CLEAR SIGNAL: Buy score ${buyScore}/10 (need 7+)`,
        `RSI: ${rsi} (need <${this.RSI_OVERSOLD} for oversold)`,
        `Price vs SMA20: ${((currentPrice - sma20) / sma20 * 100).toFixed(2)}%`,
        `Trend: ${trend}`,
        `Volume: ${volume.toLocaleString()}`,
        `Bullish signals: ${bullishSignals.length}`,
        `Professional trading requires high-probability setups`
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
    
    // Check daily trade limit
    if (this.exceedsDailyTradeLimit()) {
      risks.shouldPause = true;
      risks.pauseReasons.push(`Daily trade limit of ${this.MAX_DAILY_TRADES} reached`);
    }
    
    // Account drawdown check
    if (accountInfo && this.calculateDrawdown(accountInfo) > this.MAX_DRAWDOWN_PCT) {
      risks.shouldPause = true;
      risks.pauseReasons.push(`Portfolio drawdown exceeds ${this.MAX_DRAWDOWN_PCT}%`);
      risks.riskLevel = 'CRITICAL';
    }
    
    return risks;
  }

  // Calculate comprehensive buy score (0-10)
  calculateBuyScore(rsi, sma20, currentPrice, trend, bullishSignals, volume) {
    let score = 0;
    
    // RSI oversold (0-3 points)
    if (rsi < this.RSI_OVERSOLD) score += 3;
    else if (rsi < this.RSI_OVERSOLD + 10) score += 2;
    else if (rsi < 50) score += 1;
    
    // Price vs SMA (0-2 points)
    const smaDistance = (currentPrice - sma20) / sma20;
    if (smaDistance > 0.02) score += 2; // Strong above SMA
    else if (smaDistance > 0) score += 1; // Above SMA
    
    // Trend (0-2 points)
    if (trend === 'UPTREND') score += 2;
    else if (trend === 'NEUTRAL') score += 1;
    
    // Bullish signals (0-2 points)
    score += Math.min(2, bullishSignals.length);
    
    // Volume confirmation (0-1 point)
    if (volume > this.MIN_VOLUME_THRESHOLD * 2) score += 1;
    
    return Math.min(10, score);
  }

  // Calculate comprehensive technical sell score (0-10)
  calculateTechnicalSellScore(rsi, sma20, currentPrice, trend, bearishSignals) {
    let score = 0;
    
    // RSI overbought (0-3 points)
    if (rsi > this.RSI_OVERBOUGHT) score += 3;
    else if (rsi > this.RSI_OVERBOUGHT - 10) score += 2;
    else if (rsi > 50) score += 1;
    
    // Price vs SMA (0-2 points)
    const smaDistance = (currentPrice - sma20) / sma20;
    if (smaDistance < -0.02) score += 2; // Well below SMA
    else if (smaDistance < 0) score += 1; // Below SMA
    
    // Trend (0-2 points)
    if (trend === 'DOWNTREND') score += 2;
    else if (trend === 'NEUTRAL') score += 1;
    
    // Bearish signals (0-3 points)
    score += Math.min(3, bearishSignals.length);
    
    return Math.min(10, score);
  }

  // Professional position sizing with volatility adjustment
  calculatePositionSize(currentPrice, volatility = 0.02, riskMetrics) {
    let baseSize = this.MAX_POSITION_SIZE;
    
    // Adjust for volatility
    const volAdjustment = Math.max(0.5, Math.min(1.5, 1 / (volatility * this.VOLATILITY_MULTIPLIER)));
    baseSize *= volAdjustment;
    
    // Adjust for risk metrics
    baseSize *= riskMetrics.positionSizeMultiplier;
    
    // Price-based adjustment (smaller positions for higher prices)
    if (currentPrice > 4000) baseSize *= 0.8;
    else if (currentPrice > 3000) baseSize *= 0.9;
    
    return Math.max(0.01, Math.min(this.MAX_POSITION_SIZE, baseSize));
  }

  // Calculate volatility from historical data
  calculateVolatility(technicalData) {
    if (!technicalData.historical || technicalData.historical.length < 10) return 0.02;
    
    const returns = [];
    for (let i = 1; i < technicalData.historical.length; i++) {
      const curr = technicalData.historical[i].close;
      const prev = technicalData.historical[i-1].close;
      returns.push((curr - prev) / prev);
    }
    
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

  // Additional helper methods for risk management
  hasConsecutiveLosses(lastTrade, maxLosses) {
    // This would need to be implemented based on trade history
    // For now, return false - but should check last N trades
    return false;
  }

  exceedsDailyTradeLimit() {
    // This would need to be implemented based on daily trade count
    // For now, return false - but should track daily trades
    return false;
  }

  calculateDrawdown(accountInfo) {
    // This would calculate portfolio drawdown from peak
    // For now, return 0 - but should track account high water mark
    return 0;
  }
}

export default new ProfessionalTradingStrategy();