// lib/logger.js - Enhanced logger with Google Sheets integration status
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

  // Trading specific logging with Google Sheets context
  logTrade(tradeResult) {
    this.info('✅ Trade executed and logged to Google Sheets', {
      symbol: tradeResult.symbol,
      action: tradeResult.action,
      quantity: tradeResult.quantity,
      price: tradeResult.price,
      orderId: tradeResult.orderId,
      timestamp: tradeResult.timestamp
    });
  }

  logMarketData(symbol, data) {
    this.debug('📊 Market data fetched', {
      symbol,
      price: data.currentPrice || data.price,
      volume: data.volume,
      historicalPoints: data.historical ? data.historical.length : 'N/A'
    });
  }

  logIndicators(indicators) {
    this.debug('📈 Technical indicators calculated', {
      rsi: indicators.rsi,
      sma20: indicators.sma20,
      sma50: indicators.sma50,
      trend: indicators.trend,
      signals: indicators.signals ? indicators.signals.length : 0
    });
  }

  logDecision(decision) {
    this.info('🎯 Trading decision made', {
      action: decision.action,
      quantity: decision.quantity,
      confidence: decision.confidence,
      reasoning: decision.reasoning || decision.reason
    });
  }

  logGoogleSheetsOperation(operation, success, data = null) {
    const emoji = success ? '✅' : '❌';
    const level = success ? 'info' : 'error';
    
    this[level](`${emoji} Google Sheets ${operation}`, {
      success,
      operation,
      ...(data && { data })
    });
  }

  logPosition(symbol, position) {
    this.info('📊 Position status', {
      symbol,
      hasPosition: position ? true : false,
      quantity: position?.quantity || 0,
      averagePrice: position?.averagePrice || 0,
      value: position ? (position.quantity * position.averagePrice).toFixed(2) : 0
    });
  }

  logStorageHealth(healthStatus) {
    const emoji = healthStatus.status === 'healthy' ? '💚' : '❤️';
    const level = healthStatus.status === 'healthy' ? 'info' : 'error';
    
    this[level](`${emoji} Google Sheets Storage Health Check`, healthStatus);
  }

  // Environment validation logging
  logEnvironmentValidation(missingVars = []) {
    if (missingVars.length === 0) {
      this.info('✅ All required environment variables are present');
    } else {
      this.error('❌ Missing required environment variables', {
        missingVariables: missingVars,
        note: 'Google Sheets logging will not work without these variables'
      });
    }
  }

  // Request tracking
  logRequest(requestId, method, url, duration = null) {
    const data = { requestId, method, url };
    if (duration !== null) {
      data.durationMs = duration;
    }
    
    this.info('🔄 API Request', data);
  }

  // Cooldown status
  logCooldown(inCooldown, remainingMinutes = null) {
    if (inCooldown) {
      this.warn('⏳ System in cooldown period', {
        remainingMinutes,
        message: 'Trading is paused - waiting for cooldown to expire'
      });
    } else {
      this.info('🟢 System ready for trading - no cooldown active');
    }
  }

  // Performance logging
  logPerformance(operation, startTime, additionalData = {}) {
    const duration = Date.now() - startTime;
    this.info(`⚡ Performance: ${operation}`, {
      operation,
      durationMs: duration,
      ...additionalData
    });
  }
}

// Export both named and default for flexibility
export { Logger };
export default new Logger();