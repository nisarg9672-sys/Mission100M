class Logger {
  constructor() {
    this.logLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...(data && { data })
    };
    return JSON.stringify(logEntry);
  }

  debug(message, data = null) {
    if (this.logLevel === 'debug') {
      console.log(this.formatMessage('debug', message, data));
    }
  }

  info(message, data = null) {
    console.log(this.formatMessage('info', message, data));
  }

  warn(message, data = null) {
    console.warn(this.formatMessage('warn', message, data));
  }

  error(message, error = null) {
    const errorData = error ? {
      message: error.message,
      stack: error.stack,
      name: error.name
    } : null;
    console.error(this.formatMessage('error', message, errorData));
  }

  // Trading specific logging
  logTrade(tradeResult) {
    this.info('Trade executed', {
      symbol: tradeResult.symbol,
      action: tradeResult.action,
      quantity: tradeResult.quantity,
      price: tradeResult.price,
      orderId: tradeResult.orderId
    });
  }

  logMarketData(symbol, data) {
    this.debug('Market data fetched', {
      symbol,
      price: data.currentPrice,
      volume: data.volume,
      historicalPoints: data.historical.length
    });
  }

  logIndicators(indicators) {
    this.debug('Technical indicators calculated', {
      rsi: indicators.rsi,
      sma20: indicators.sma20,
      sma50: indicators.sma50,
      trend: indicators.trend,
      signals: indicators.signals.length
    });
  }

  logDecision(decision) {
    this.info('Trading decision made', {
      action: decision.action,
      quantity: decision.quantity,
      confidence: decision.confidence,
      reasoning: decision.reasoning
    });
  }
}

// Export both named and default for flexibility
export { Logger };
export default new Logger();