
import { SMA, RSI, MACD } from 'trading-signals';

class TechnicalIndicators {
  calculate(marketData) {
    const prices = marketData.historical.map(h => h.close);
    const volumes = marketData.historical.map(h => h.volume);

    if (prices.length < 50) {
      throw new Error('Not enough historical data for technical analysis');
    }

    // Simple Moving Averages
    const sma20 = this.calculateSMA(prices, 20);
    const sma50 = this.calculateSMA(prices, 50);

    // RSI (Relative Strength Index)
    const rsi = this.calculateRSI(prices, 14);

    // MACD
    const macd = this.calculateMACD(prices);

    // Momentum
    const momentum = this.calculateMomentum(prices, 10);

    // Volume analysis
    const avgVolume = volumes.slice(-20).reduce((sum, v) => sum + v, 0) / 20;
    const volumeRatio = marketData.volume / avgVolume;

    return {
      currentPrice: marketData.currentPrice,
      sma20: sma20[sma20.length - 1],
      sma50: sma50[sma50.length - 1],
      rsi: rsi[rsi.length - 1],
      macd: macd[macd.length - 1],
      momentum: momentum[momentum.length - 1],
      volumeRatio,
      trend: this.determineTrend(sma20, sma50, prices),
      signals: this.generateSignals(prices, sma20, sma50, rsi, macd)
    };
  }

  calculateSMA(prices, period) {
    const sma = new SMA(period);
    const results = [];

    prices.forEach(price => {
      sma.update(price);
      if (sma.isStable) {
        results.push(sma.getResult().toNumber());
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
        results.push(rsi.getResult().toNumber());
      }
    });

    return results;
  }

  calculateMACD(prices) {
    const macd = new MACD({ fast: 12, slow: 26, signal: 9 });
    const results = [];

    prices.forEach(price => {
      macd.update(price);
      if (macd.isStable) {
        const result = macd.getResult();
        results.push({
          macd: result.macd.toNumber(),
          signal: result.signal.toNumber(),
          histogram: result.histogram.toNumber()
        });
      }
    });

    return results;
  }

  calculateMomentum(prices, period) {
    const results = [];

    for (let i = period; i < prices.length; i++) {
      const momentum = prices[i] - prices[i - period];
      results.push(momentum);
    }

    return results;
  }

  determineTrend(sma20, sma50, prices) {
    const currentPrice = prices[prices.length - 1];
    const currentSMA20 = sma20[sma20.length - 1];
    const currentSMA50 = sma50[sma50.length - 1];

    if (currentPrice > currentSMA20 && currentSMA20 > currentSMA50) {
      return 'UPTREND';
    } else if (currentPrice < currentSMA20 && currentSMA20 < currentSMA50) {
      return 'DOWNTREND';
    } else {
      return 'SIDEWAYS';
    }
  }

  generateSignals(prices, sma20, sma50, rsi, macd) {
    const currentPrice = prices[prices.length - 1];
    const currentSMA20 = sma20[sma20.length - 1];
    const currentSMA50 = sma50[sma50.length - 1];
    const currentRSI = rsi[rsi.length - 1];
    const currentMACD = macd[macd.length - 1];

    const signals = [];

    // RSI signals
    if (currentRSI < 30) {
      signals.push({ type: 'RSI_OVERSOLD', strength: 'STRONG' });
    } else if (currentRSI > 70) {
      signals.push({ type: 'RSI_OVERBOUGHT', strength: 'STRONG' });
    }

    // Moving average crossover
    if (currentSMA20 > currentSMA50) {
      signals.push({ type: 'SMA_BULLISH', strength: 'MEDIUM' });
    } else if (currentSMA20 < currentSMA50) {
      signals.push({ type: 'SMA_BEARISH', strength: 'MEDIUM' });
    }

    // MACD signals
    if (currentMACD.macd > currentMACD.signal) {
      signals.push({ type: 'MACD_BULLISH', strength: 'MEDIUM' });
    } else if (currentMACD.macd < currentMACD.signal) {
      signals.push({ type: 'MACD_BEARISH', strength: 'MEDIUM' });
    }

    return signals;
  }
}

export default new TechnicalIndicators();
