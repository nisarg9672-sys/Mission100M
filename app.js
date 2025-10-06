// JavaScript for the Serverless Trading Automation Documentation App

class TradingAutomationApp {
  constructor() {
    this.currentTab = 'overview';
    this.currentFile = 'trading';
    this.init();
  }

  init() {
    this.bindEvents();
    this.loadCodeContent();
    this.updateTimestamp();
    this.setupCopyButtons();
    
    // Initialize Prism.js syntax highlighting
    if (typeof Prism !== 'undefined') {
      Prism.highlightAll();
    }
  }

  bindEvents() {
    // Tab navigation
    const tabButtons = document.querySelectorAll('.nav__item');
    tabButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const tabName = e.target.dataset.tab;
        this.switchTab(tabName);
      });
    });

    // Code file navigation
    const codeNavButtons = document.querySelectorAll('.code-nav__item');
    codeNavButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const fileName = e.target.dataset.file;
        this.switchCodeFile(fileName);
      });
    });

    // Test endpoint button
    const testButton = document.querySelector('.test-endpoint-btn');
    if (testButton) {
      testButton.addEventListener('click', () => {
        this.testEndpoint();
      });
    }
  }

  switchTab(tabName) {
    // Update nav buttons
    document.querySelectorAll('.nav__item').forEach(btn => {
      btn.classList.remove('nav__item--active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('nav__item--active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('tab-content--active');
    });
    document.querySelector(`#${tabName}`).classList.add('tab-content--active');

    this.currentTab = tabName;

    // Re-highlight code if switching to code tab
    if (tabName === 'code' && typeof Prism !== 'undefined') {
      setTimeout(() => {
        Prism.highlightAll();
      }, 100);
    }
  }

  switchCodeFile(fileName) {
    // Update code nav buttons
    document.querySelectorAll('.code-nav__item').forEach(btn => {
      btn.classList.remove('code-nav__item--active');
    });
    document.querySelector(`[data-file="${fileName}"]`).classList.add('code-nav__item--active');

    // Update file content
    document.querySelectorAll('.file-content').forEach(content => {
      content.classList.remove('file-content--active');
    });
    
    const fileContent = document.querySelector(`#file-${fileName}`);
    if (fileContent) {
      fileContent.classList.add('file-content--active');
    }

    this.currentFile = fileName;

    // Re-highlight code
    if (typeof Prism !== 'undefined') {
      setTimeout(() => {
        Prism.highlightAll();
      }, 100);
    }
  }

  setupCopyButtons() {
    const copyButtons = document.querySelectorAll('.copy-btn');
    copyButtons.forEach(button => {
      button.addEventListener('click', async (e) => {
        const targetId = e.target.dataset.clipboardTarget;
        const targetElement = document.querySelector(targetId);
        
        if (targetElement) {
          const text = targetElement.textContent;
          
          try {
            await navigator.clipboard.writeText(text);
            this.showCopySuccess(button);
          } catch (err) {
            // Fallback for older browsers
            this.fallbackCopyTextToClipboard(text, button);
          }
        }
      });
    });
  }

  async showCopySuccess(button) {
    const originalText = button.textContent;
    button.textContent = 'Copied!';
    button.classList.add('copy-btn--success');
    
    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove('copy-btn--success');
    }, 2000);
  }

  fallbackCopyTextToClipboard(text, button) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      document.execCommand('copy');
      this.showCopySuccess(button);
    } catch (err) {
      console.error('Fallback: Could not copy text: ', err);
      button.textContent = 'Copy failed';
      setTimeout(() => {
        button.textContent = 'Copy';
      }, 2000);
    }

    document.body.removeChild(textArea);
  }

  async testEndpoint() {
    const testButton = document.querySelector('.test-endpoint-btn');
    const testResult = document.querySelector('#test-result');
    
    // Update button state
    testButton.disabled = true;
    testButton.textContent = 'Testing...';
    
    // Show result container
    testResult.classList.add('test-result--visible');
    testResult.innerHTML = '<div style="color: var(--color-info);">⏳ Sending request to trading endpoint...</div>';

    try {
      // Simulate API call (replace with actual endpoint when deployed)
      const mockResponse = await this.simulateApiCall();
      
      testResult.innerHTML = `
        <div style="color: var(--color-success); margin-bottom: 8px;">✅ Test successful!</div>
        <pre style="margin: 0; font-size: 12px; color: var(--color-text);">${JSON.stringify(mockResponse, null, 2)}</pre>
      `;
    } catch (error) {
      testResult.innerHTML = `
        <div style="color: var(--color-error); margin-bottom: 8px;">❌ Test failed</div>
        <div style="color: var(--color-text-secondary); font-size: 12px;">${error.message}</div>
      `;
    }

    // Reset button
    testButton.disabled = false;
    testButton.textContent = 'Test Trading Endpoint';
  }

  simulateApiCall() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        action: 'HOLD',
        data: {
          symbol: 'BTC-USD',
          currentPrice: 67234.56,
          previousClose: 66789.12,
          technicalIndicators: {
            sma20: 65432.89,
            sma50: 63456.78,
            rsi: 52.3,
            macd: 127.45
          },
          decision: {
            action: 'HOLD',
            reason: 'No strong technical signals detected',
            confidence: 0.72
          }
        },
        timestamp: new Date().toISOString()
      });
    }, 2000);
  });
}

  updateTimestamp() {
    const timestampElement = document.querySelector('#last-execution');
    if (timestampElement) {
      const now = new Date();
      const timeString = now.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      timestampElement.textContent = timeString;
    }
  }

  loadCodeContent() {
    // Load additional code files content that wasn't included in HTML
    this.loadAlpacaCode();
    this.loadIndicatorsCode();
    this.loadStrategyCode();
    this.loadStorageCode();
    this.loadLoggerCode();
    this.loadVercelConfig();
  }

  loadAlpacaCode() {
    const alpacaContent = document.querySelector('#code-alpaca');
    if (alpacaContent) {
      alpacaContent.innerHTML = `const Alpaca = require('@alpacahq/alpaca-trade-api');

class AlpacaService {
  constructor() {
    this.alpaca = new Alpaca({
      keyId: process.env.ALPACA_API_KEY_ID,
      secretKey: process.env.ALPACA_SECRET_KEY,
      paper: process.env.ALPACA_PAPER === 'true',
      usePolygon: false
    });
  }

  async executeTrade({ symbol, action, quantity, takeProfitPercent, stopLossPercent }) {
    try {
      const currentPrice = await this.getCurrentPrice(symbol);
      
      if (!currentPrice) {
        throw new Error('Could not fetch current price');
      }

      // Calculate TP and SL prices
      const takeProfitPrice = action === 'BUY' 
        ? currentPrice * (1 + takeProfitPercent / 100)
        : currentPrice * (1 - takeProfitPercent / 100);
        
      const stopLossPrice = action === 'BUY'
        ? currentPrice * (1 - stopLossPercent / 100)
        : currentPrice * (1 + stopLossPercent / 100);

      // Place main order
      const mainOrder = await this.alpaca.createOrder({
        symbol,
        qty: quantity,
        side: action.toLowerCase(),
        type: 'market',
        time_in_force: 'day'
      });

      // Place bracket orders (TP and SL)
      if (mainOrder.id) {
        await this.placeBracketOrders(symbol, quantity, action, takeProfitPrice, stopLossPrice);
      }

      return {
        orderId: mainOrder.id,
        symbol,
        action,
        quantity,
        currentPrice,
        takeProfitPrice,
        stopLossPrice,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      throw new Error(\`Alpaca trade execution failed: \${error.message}\`);
    }
  }

  async getCurrentPrice(symbol) {
    try {
      const quote = await this.alpaca.getLatestTrade({ symbol });
      return quote.Price;
    } catch (error) {
      throw new Error(\`Failed to get current price for \${symbol}: \${error.message}\`);
    }
  }

  async placeBracketOrders(symbol, quantity, action, takeProfitPrice, stopLossPrice) {
    const oppositeSide = action === 'BUY' ? 'sell' : 'buy';

    try {
      // Take Profit Order
      await this.alpaca.createOrder({
        symbol,
        qty: quantity,
        side: oppositeSide,
        type: 'limit',
        limit_price: takeProfitPrice.toFixed(2),
        time_in_force: 'gtc'
      });

      // Stop Loss Order
      await this.alpaca.createOrder({
        symbol,
        qty: quantity,
        side: oppositeSide,
        type: 'stop',
        stop_price: stopLossPrice.toFixed(2),
        time_in_force: 'gtc'
      });

    } catch (error) {
      console.error('Failed to place bracket orders:', error);
    }
  }

  async getAccountInfo() {
    try {
      return await this.alpaca.getAccount();
    } catch (error) {
      throw new Error(\`Failed to get account info: \${error.message}\`);
    }
  }

  async getPositions() {
    try {
      return await this.alpaca.getPositions();
    } catch (error) {
      throw new Error(\`Failed to get positions: \${error.message}\`);
    }
  }
}

module.exports = new AlpacaService();`;
    }
  }

  loadIndicatorsCode() {
    const indicatorsContent = document.querySelector('#code-indicators');
    if (indicatorsContent) {
      indicatorsContent.innerHTML = `const { SMA, RSI, MACD, BollingerBands } = require('trading-signals');

class TechnicalIndicators {
  calculate(marketData) {
    try {
      const prices = marketData.historical.map(h => h.close);
      const volumes = marketData.historical.map(h => h.volume);
      
      // Simple Moving Averages
      const sma20 = this.calculateSMA(prices, 20);
      const sma50 = this.calculateSMA(prices, 50);
      const sma200 = this.calculateSMA(prices, 200);
      
      // RSI (Relative Strength Index)
      const rsi = this.calculateRSI(prices, 14);
      
      // MACD
      const macd = this.calculateMACD(prices);
      
      // Bollinger Bands
      const bollinger = this.calculateBollingerBands(prices, 20, 2);
      
      // Volume indicators
      const avgVolume = this.calculateAverageVolume(volumes, 20);
      const volumeRatio = marketData.volume / avgVolume;
      
      // Price momentum
      const momentum = this.calculateMomentum(prices, 10);
      
      return {
        currentPrice: marketData.currentPrice,
        previousClose: marketData.previousClose,
        priceChange: marketData.currentPrice - marketData.previousClose,
        priceChangePercent: ((marketData.currentPrice - marketData.previousClose) / marketData.previousClose) * 100,
        
        movingAverages: {
          sma20: sma20.length > 0 ? sma20[sma20.length - 1] : null,
          sma50: sma50.length > 0 ? sma50[sma50.length - 1] : null,
          sma200: sma200.length > 0 ? sma200[sma200.length - 1] : null
        },
        
        oscillators: {
          rsi: rsi.length > 0 ? rsi[rsi.length - 1] : null,
          macd: macd.macd.length > 0 ? {
            macd: macd.macd[macd.macd.length - 1],
            signal: macd.signal[macd.signal.length - 1],
            histogram: macd.histogram[macd.histogram.length - 1]
          } : null
        },
        
        bands: {
          bollinger: bollinger.upper.length > 0 ? {
            upper: bollinger.upper[bollinger.upper.length - 1],
            middle: bollinger.middle[bollinger.middle.length - 1],
            lower: bollinger.lower[bollinger.lower.length - 1]
          } : null
        },
        
        volume: {
          current: marketData.volume,
          average: avgVolume,
          ratio: volumeRatio
        },
        
        momentum: momentum.length > 0 ? momentum[momentum.length - 1] : null,
        
        trends: {
          shortTerm: this.determineTrend(sma20, 5),
          mediumTerm: this.determineTrend(sma50, 10),
          longTerm: this.determineTrend(sma200, 20)
        },
        
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      throw new Error(\`Technical indicators calculation failed: \${error.message}\`);
    }
  }

  calculateSMA(prices, period) {
    const sma = new SMA(period);
    const results = [];
    
    prices.forEach(price => {
      sma.update(price);
      if (sma.isStable) {
        results.push(sma.getResult());
      }
    });
    
    return results;
  }

  calculateRSI(prices, period) {
    const rsi = new RSI(period);
    const results = [];
    
    prices.forEach(price => {
      rsi.update(price);
      if (rsi.isStable) {
        results.push(rsi.getResult());
      }
    });
    
    return results;
  }

  calculateMACD(prices) {
    const macd = new MACD({ fast: 12, slow: 26, signal: 9 });
    const results = { macd: [], signal: [], histogram: [] };
    
    prices.forEach(price => {
      macd.update(price);
      if (macd.isStable) {
        const result = macd.getResult();
        results.macd.push(result.macd);
        results.signal.push(result.signal);
        results.histogram.push(result.histogram);
      }
    });
    
    return results;
  }

  calculateBollingerBands(prices, period, multiplier) {
    const bb = new BollingerBands(period, multiplier);
    const results = { upper: [], middle: [], lower: [] };
    
    prices.forEach(price => {
      bb.update(price);
      if (bb.isStable) {
        const result = bb.getResult();
        results.upper.push(result.upper);
        results.middle.push(result.middle);
        results.lower.push(result.lower);
      }
    });
    
    return results;
  }

  calculateAverageVolume(volumes, period) {
    if (volumes.length < period) return volumes.reduce((a, b) => a + b, 0) / volumes.length;
    
    const recentVolumes = volumes.slice(-period);
    return recentVolumes.reduce((a, b) => a + b, 0) / period;
  }

  calculateMomentum(prices, period) {
    const results = [];
    
    for (let i = period; i < prices.length; i++) {
      const momentum = prices[i] - prices[i - period];
      results.push(momentum);
    }
    
    return results;
  }

  determineTrend(smaValues, lookback) {
    if (smaValues.length < lookback + 1) return 'NEUTRAL';
    
    const recent = smaValues.slice(-lookback);
    let upCount = 0;
    let downCount = 0;
    
    for (let i = 1; i < recent.length; i++) {
      if (recent[i] > recent[i - 1]) upCount++;
      else if (recent[i] < recent[i - 1]) downCount++;
    }
    
    if (upCount > downCount * 1.5) return 'BULLISH';
    if (downCount > upCount * 1.5) return 'BEARISH';
    return 'NEUTRAL';
  }
}

module.exports = new TechnicalIndicators();`;
    }
  }

  loadStrategyCode() {
    const strategyContent = document.querySelector('#code-strategy');
    if (strategyContent) {
      strategyContent.innerHTML = `class TradingStrategy {
  analyze(technicalData, currentPosition) {
    try {
      const signals = this.generateSignals(technicalData);
      const risk = this.assessRisk(technicalData);
      const decision = this.makeDecision(signals, risk, currentPosition);
      
      return {
        action: decision.action,
        quantity: decision.quantity,
        confidence: decision.confidence,
        reason: decision.reason,
        signals: signals,
        risk: risk,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      throw new Error(\`Strategy analysis failed: \${error.message}\`);
    }
  }

  generateSignals(data) {
    const signals = {
      trend: this.analyzeTrend(data),
      momentum: this.analyzeMomentum(data),
      meanReversion: this.analyzeMeanReversion(data),
      volume: this.analyzeVolume(data),
      overall: 'NEUTRAL'
    };
    
    // Calculate overall signal strength
    const signalValues = Object.values(signals).filter(s => s !== 'NEUTRAL');
    const bullishCount = signalValues.filter(s => s === 'BULLISH').length;
    const bearishCount = signalValues.filter(s => s === 'BEARISH').length;
    
    if (bullishCount > bearishCount && bullishCount >= 2) {
      signals.overall = 'BULLISH';
    } else if (bearishCount > bullishCount && bearishCount >= 2) {
      signals.overall = 'BEARISH';
    }
    
    return signals;
  }

  analyzeTrend(data) {
    const { currentPrice, movingAverages, trends } = data;
    const { sma20, sma50, sma200 } = movingAverages;
    
    // Price above/below moving averages
    const aboveSMA20 = currentPrice > sma20;
    const aboveSMA50 = currentPrice > sma50;
    const aboveSMA200 = currentPrice > sma200;
    
    // Moving average alignment (golden cross / death cross)
    const goldenCross = sma20 > sma50 && sma50 > sma200;
    const deathCross = sma20 < sma50 && sma50 < sma200;
    
    // Trend analysis
    const shortTrendBullish = trends.shortTerm === 'BULLISH';
    const mediumTrendBullish = trends.mediumTerm === 'BULLISH';
    
    if (goldenCross && aboveSMA20 && aboveSMA50 && shortTrendBullish) {
      return 'BULLISH';
    }
    
    if (deathCross && !aboveSMA20 && !aboveSMA50 && !shortTrendBullish) {
      return 'BEARISH';
    }
    
    return 'NEUTRAL';
  }

  analyzeMomentum(data) {
    const { oscillators, momentum } = data;
    const { rsi, macd } = oscillators;
    
    // RSI analysis
    const rsiOversold = rsi < 30;
    const rsiOverbought = rsi > 70;
    const rsiNeutral = rsi >= 40 && rsi <= 60;
    
    // MACD analysis
    const macdBullish = macd && macd.macd > macd.signal && macd.histogram > 0;
    const macdBearish = macd && macd.macd < macd.signal && macd.histogram < 0;
    
    // Momentum analysis
    const positiveMomentum = momentum > 0;
    
    if (!rsiOverbought && macdBullish && positiveMomentum) {
      return 'BULLISH';
    }
    
    if (!rsiOversold && macdBearish && !positiveMomentum) {
      return 'BEARISH';
    }
    
    return 'NEUTRAL';
  }

  analyzeMeanReversion(data) {
    const { currentPrice, bands } = data;
    const { bollinger } = bands;
    
    if (!bollinger) return 'NEUTRAL';
    
    // Bollinger Bands analysis
    const nearLowerBand = currentPrice <= bollinger.lower * 1.02; // Within 2% of lower band
    const nearUpperBand = currentPrice >= bollinger.upper * 0.98; // Within 2% of upper band
    const nearMiddle = Math.abs(currentPrice - bollinger.middle) / bollinger.middle < 0.01;
    
    if (nearLowerBand) {
      return 'BULLISH'; // Potential bounce from oversold
    }
    
    if (nearUpperBand) {
      return 'BEARISH'; // Potential pullback from overbought
    }
    
    return 'NEUTRAL';
  }

  analyzeVolume(data) {
    const { volume } = data;
    const { ratio } = volume;
    
    // High volume confirmation
    if (ratio > 1.5) {
      return 'BULLISH'; // High volume can confirm moves
    }
    
    // Low volume (potential reversal)
    if (ratio < 0.5) {
      return 'BEARISH';
    }
    
    return 'NEUTRAL';
  }

  assessRisk(data) {
    const { priceChangePercent, oscillators, bands } = data;
    const { rsi } = oscillators;
    const { bollinger } = bands;
    
    let riskScore = 0;
    let riskFactors = [];
    
    // Price volatility risk
    if (Math.abs(priceChangePercent) > 5) {
      riskScore += 2;
      riskFactors.push('High price volatility');
    }
    
    // RSI extreme levels
    if (rsi > 80 || rsi < 20) {
      riskScore += 1;
      riskFactors.push('RSI at extreme levels');
    }
    
    // Bollinger Bands squeeze
    if (bollinger) {
      const bandWidth = (bollinger.upper - bollinger.lower) / bollinger.middle;
      if (bandWidth < 0.1) {
        riskScore += 1;
        riskFactors.push('Low volatility (potential breakout)');
      }
    }
    
    return {
      score: riskScore,
      level: riskScore <= 1 ? 'LOW' : riskScore <= 3 ? 'MEDIUM' : 'HIGH',
      factors: riskFactors
    };
  }

  makeDecision(signals, risk, currentPosition) {
    const hasPosition = currentPosition && currentPosition.quantity > 0;
    const { overall } = signals;
    
    // Risk management - don't trade in high risk conditions
    if (risk.level === 'HIGH') {
      return {
        action: 'HOLD',
        quantity: 0,
        confidence: 0.1,
        reason: \`High risk detected: \${risk.factors.join(', ')}\`
      };
    }
    
    // Buy signal
    if (overall === 'BULLISH' && !hasPosition) {
      const quantity = this.calculatePositionSize(risk);
      return {
        action: 'BUY',
        quantity: quantity,
        confidence: 0.75,
        reason: 'Bullish signals detected with acceptable risk'
      };
    }
    
    // Sell signal
    if (overall === 'BEARISH' && hasPosition) {
      return {
        action: 'SELL',
        quantity: currentPosition.quantity,
        confidence: 0.70,
        reason: 'Bearish signals detected, closing position'
      };
    }
    
    // Hold
    return {
      action: 'HOLD',
      quantity: 0,
      confidence: 0.60,
      reason: overall === 'NEUTRAL' ? 'No strong signals detected' : 
              hasPosition ? 'Maintaining current position' : 'Waiting for better entry'
    };
  }

  calculatePositionSize(risk) {
    // Base position size (can be made configurable)
    const baseSize = 10;
    
    // Adjust based on risk
    switch (risk.level) {
      case 'LOW':
        return baseSize;
      case 'MEDIUM':
        return Math.floor(baseSize * 0.7);
      case 'HIGH':
        return Math.floor(baseSize * 0.3);
      default:
        return baseSize;
    }
  }
}

module.exports = new TradingStrategy();`;
    }
  }

  loadStorageCode() {
    const storageContent = document.querySelector('#code-storage');
    if (storageContent) {
      storageContent.innerHTML = `const fs = require('fs').promises;
const path = require('path');

class StorageService {
  constructor() {
    this.dataDir = '/tmp'; // Vercel tmp directory
    this.positionsFile = path.join(this.dataDir, 'positions.json');
    this.tradesFile = path.join(this.dataDir, 'trades.json');
  }

  async getCurrentPosition(symbol) {
    try {
      const positions = await this.loadPositions();
      return positions[symbol] || null;
    } catch (error) {
      console.error('Error loading current position:', error);
      return null;
    }
  }

  async updatePosition(symbol, tradeResult) {
    try {
      const positions = await this.loadPositions();
      const trades = await this.loadTrades();
      
      // Update position
      if (tradeResult.action === 'BUY') {
        positions[symbol] = {
          symbol,
          quantity: tradeResult.quantity,
          entryPrice: tradeResult.currentPrice,
          entryDate: tradeResult.timestamp,
          takeProfitPrice: tradeResult.takeProfitPrice,
          stopLossPrice: tradeResult.stopLossPrice
        };
      } else if (tradeResult.action === 'SELL') {
        // Calculate P&L if closing position
        const currentPosition = positions[symbol];
        if (currentPosition) {
          const pnl = (tradeResult.currentPrice - currentPosition.entryPrice) * currentPosition.quantity;
          tradeResult.pnl = pnl;
          tradeResult.pnlPercent = (pnl / (currentPosition.entryPrice * currentPosition.quantity)) * 100;
        }
        
        // Remove position
        delete positions[symbol];
      }
      
      // Save trade record
      trades.push({
        id: this.generateTradeId(),
        ...tradeResult,
        timestamp: new Date().toISOString()
      });
      
      // Save to files
      await this.savePositions(positions);
      await this.saveTrades(trades);
      
      return true;
    } catch (error) {
      console.error('Error updating position:', error);
      throw new Error(\`Failed to update position: \${error.message}\`);
    }
  }

  async loadPositions() {
    try {
      const data = await fs.readFile(this.positionsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {}; // File doesn't exist, return empty positions
      }
      throw error;
    }
  }

  async savePositions(positions) {
    await fs.writeFile(this.positionsFile, JSON.stringify(positions, null, 2));
  }

  async loadTrades() {
    try {
      const data = await fs.readFile(this.tradesFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return []; // File doesn't exist, return empty trades
      }
      throw error;
    }
  }

  async saveTrades(trades) {
    // Keep only last 100 trades to prevent file from growing too large
    const recentTrades = trades.slice(-100);
    await fs.writeFile(this.tradesFile, JSON.stringify(recentTrades, null, 2));
  }

  async getTradeHistory(limit = 20) {
    try {
      const trades = await this.loadTrades();
      return trades.slice(-limit).reverse(); // Most recent first
    } catch (error) {
      console.error('Error loading trade history:', error);
      return [];
    }
  }

  async getPerformanceStats() {
    try {
      const trades = await this.loadTrades();
      const positions = await this.loadPositions();
      
      const completedTrades = trades.filter(t => t.pnl !== undefined);
      const totalTrades = completedTrades.length;
      const winningTrades = completedTrades.filter(t => t.pnl > 0).length;
      const losingTrades = completedTrades.filter(t => t.pnl < 0).length;
      
      const totalPnL = completedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
      const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
      
      const averageWin = winningTrades > 0 
        ? completedTrades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0) / winningTrades 
        : 0;
        
      const averageLoss = losingTrades > 0 
        ? Math.abs(completedTrades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0) / losingTrades)
        : 0;

      return {
        totalTrades,
        winningTrades,
        losingTrades,
        winRate: Math.round(winRate * 100) / 100,
        totalPnL: Math.round(totalPnL * 100) / 100,
        averageWin: Math.round(averageWin * 100) / 100,
        averageLoss: Math.round(averageLoss * 100) / 100,
        activePositions: Object.keys(positions).length,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error calculating performance stats:', error);
      return null;
    }
  }

  generateTradeId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Cleanup old files (optional, can be called periodically)
  async cleanup() {
    try {
      const trades = await this.loadTrades();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const recentTrades = trades.filter(trade => 
        new Date(trade.timestamp) > thirtyDaysAgo
      );
      
      await this.saveTrades(recentTrades);
      console.log(\`Cleaned up old trades, kept \${recentTrades.length} recent trades\`);
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}

module.exports = new StorageService();`;
    }
  }

  loadLoggerCode() {
    const loggerContent = document.querySelector('#code-logger');
    if (loggerContent) {
      loggerContent.innerHTML = `class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'info';
  }

  info(message, data = null) {
    if (this.shouldLog('info')) {
      this.log('INFO', message, data);
    }
  }

  error(message, error = null) {
    if (this.shouldLog('error')) {
      const errorData = error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error;
      
      this.log('ERROR', message, errorData);
    }
  }

  warn(message, data = null) {
    if (this.shouldLog('warn')) {
      this.log('WARN', message, data);
    }
  }

  debug(message, data = null) {
    if (this.shouldLog('debug')) {
      this.log('DEBUG', message, data);
    }
  }

  log(level, message, data) {
    const timestamp = new Date().toISOString();
    
    const logEntry = {
      timestamp,
      level,
      message,
      ...(data && { data })
    };

    // In serverless environment, log to console
    // These logs will appear in Vercel function logs
    console.log(JSON.stringify(logEntry));

    // Could also send to external logging service here
    // this.sendToExternalLogger(logEntry);
  }

  shouldLog(level) {
    const levels = ['error', 'warn', 'info', 'debug'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const requestedLevelIndex = levels.indexOf(level);
    
    return requestedLevelIndex <= currentLevelIndex;
  }

  // Optional: Send logs to external service
  async sendToExternalLogger(logEntry) {
    // Implementation for external logging service
    // Examples: DataDog, New Relic, CloudWatch, etc.
    
    /*
    try {
      await fetch('https://api.external-logger.com/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': \`Bearer \${process.env.LOGGER_API_KEY}\`
        },
        body: JSON.stringify(logEntry)
      });
    } catch (error) {
      console.error('Failed to send log to external service:', error);
    }
    */
  }

  // Trading-specific logging methods
  logTrade(action, symbol, data) {
    this.info(\`Trade executed: \${action} \${symbol}\`, {
      type: 'TRADE',
      action,
      symbol,
      ...data
    });
  }

  logMarketData(symbol, data) {
    this.debug(\`Market data fetched for \${symbol}\`, {
      type: 'MARKET_DATA',
      symbol,
      price: data.currentPrice,
      volume: data.volume
    });
  }

  logStrategy(decision) {
    this.info('Strategy decision made', {
      type: 'STRATEGY',
      action: decision.action,
      confidence: decision.confidence,
      reason: decision.reason
    });
  }

  logError(context, error) {
    this.error(\`Error in \${context}\`, {
      type: 'APPLICATION_ERROR',
      context,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack
      } : error
    });
  }

  logPerformance(operation, duration, success = true) {
    this.info(\`Performance: \${operation}\`, {
      type: 'PERFORMANCE',
      operation,
      duration,
      success
    });
  }
}

module.exports = new Logger();`;
    }
  }

  loadVercelConfig() {
    const vercelContent = document.querySelector('#code-vercel');
    if (vercelContent) {
      vercelContent.innerHTML = `{
  "version": 2,
  "functions": {
    "api/trading.js": {
      "maxDuration": 30
    }
  },
  "env": {
    "ALPACA_API_KEY_ID": "@alpaca-api-key-id",
    "ALPACA_SECRET_KEY": "@alpaca-secret-key",
    "ALPACA_PAPER": "@alpaca-paper",
    "WEBHOOK_SECRET": "@webhook-secret"
  },
  "build": {
    "env": {
      "NODE_ENV": "production"
    }
  },
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        {
          "key": "Access-Control-Allow-Origin",
          "value": "*"
        },
        {
          "key": "Access-Control-Allow-Methods",
          "value": "GET, POST, OPTIONS"
        },
        {
          "key": "Access-Control-Allow-Headers",
          "value": "Content-Type, Authorization"
        }
      ]
    }
  ]
}`;
    }
  }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new TradingAutomationApp();
});