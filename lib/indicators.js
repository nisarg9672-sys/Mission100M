import { SMA, EMA, MACD, RSI } from 'trading-signals';

export class TechnicalIndicators {
  constructor() {
    this.sma = new SMA(20);
    this.ema = new EMA(12);
    this.rsi = new RSI(14);
    this.macd = null; // Initialize separately due to complex constructor
  }

  calculate(historicalData) {
    try {
      if (!Array.isArray(historicalData) || historicalData.length === 0) {
        throw new Error('Historical data is required and must be an array');
      }

      const results = {
        sma: this.calculateSMA(historicalData),
        ema: this.calculateEMA(historicalData),
        rsi: this.calculateRSI(historicalData),
        macd: this.calculateMACD(historicalData)
      };

      return results;
    } catch (error) {
      console.error('Technical indicators calculation error:', error);
      throw error;
    }
  }

  calculateSMA(data) {
    try {
      const sma = new SMA(20);
      const results = [];
      
      data.forEach((candle, index) => {
        sma.update(candle.close);
        if (sma.isStable) {
          results.push({
            date: candle.date,
            value: parseFloat(sma.getResult().toFixed(4))
          });
        }
      });
      
      return results;
    } catch (error) {
      console.error('SMA calculation error:', error);
      return [];
    }
  }

  calculateEMA(data) {
    try {
      const ema = new EMA(12);
      const results = [];
      
      data.forEach((candle, index) => {
        ema.update(candle.close);
        if (ema.isStable) {
          results.push({
            date: candle.date,
            value: parseFloat(ema.getResult().toFixed(4))
          });
        }
      });
      
      return results;
    } catch (error) {
      console.error('EMA calculation error:', error);
      return [];
    }
  }

  calculateRSI(data) {
    try {
      const rsi = new RSI(14);
      const results = [];
      
      data.forEach((candle, index) => {
        rsi.update(candle.close);
        if (rsi.isStable) {
          results.push({
            date: candle.date,
            value: parseFloat(rsi.getResult().toFixed(2))
          });
        }
      });
      
      return results;
    } catch (error) {
      console.error('RSI calculation error:', error);
      return [];
    }
  }

  calculateMACD(data) {
    try {
      // Fix: Proper MACD constructor with indicator instances
      const fastEMA = new EMA(12);
      const slowEMA = new EMA(26);
      const signalEMA = new EMA(9);
      
      const results = [];
      let macdValues = [];
      
      data.forEach((candle, index) => {
        const price = candle.close;
        
        fastEMA.update(price);
        slowEMA.update(price);
        
        // Calculate MACD line (fast EMA - slow EMA)
        if (fastEMA.isStable && slowEMA.isStable) {
          const macdLine = parseFloat(fastEMA.getResult().minus(slowEMA.getResult()).toFixed(4));
          macdValues.push(macdLine);
          
          // Calculate signal line (EMA of MACD line)
          signalEMA.update(macdLine);
          
          if (signalEMA.isStable) {
            const signalLine = parseFloat(signalEMA.getResult().toFixed(4));
            const histogram = parseFloat((macdLine - signalLine).toFixed(4));
            
            results.push({
              date: candle.date,
              macd: macdLine,
              signal: signalLine,
              histogram: histogram
            });
          }
        }
      });
      
      return results;
    } catch (error) {
      console.error('MACD calculation error:', error);
      return [];
    }
  }

  // Simple trading signals based on indicators
  generateSignals(indicators, currentPrice) {
    try {
      const signals = {
        sma: 'HOLD',
        rsi: 'HOLD',
        macd: 'HOLD',
        overall: 'HOLD'
      };

      // SMA signal
      if (indicators.sma && indicators.sma.length > 0) {
        const latestSMA = indicators.sma[indicators.sma.length - 1].value;
        signals.sma = currentPrice > latestSMA ? 'BUY' : 'SELL';
      }

      // RSI signal
      if (indicators.rsi && indicators.rsi.length > 0) {
        const latestRSI = indicators.rsi[indicators.rsi.length - 1].value;
        if (latestRSI > 70) signals.rsi = 'SELL';
        else if (latestRSI < 30) signals.rsi = 'BUY';
      }

      // MACD signal
      if (indicators.macd && indicators.macd.length > 1) {
        const latest = indicators.macd[indicators.macd.length - 1];
        const previous = indicators.macd[indicators.macd.length - 2];
        
        // MACD crossover
        if (previous.macd <= previous.signal && latest.macd > latest.signal) {
          signals.macd = 'BUY';
        } else if (previous.macd >= previous.signal && latest.macd < latest.signal) {
          signals.macd = 'SELL';
        }
      }

      // Overall signal (simple majority)
      const buyCount = Object.values(signals).filter(s => s === 'BUY').length;
      const sellCount = Object.values(signals).filter(s => s === 'SELL').length;
      
      if (buyCount > sellCount) signals.overall = 'BUY';
      else if (sellCount > buyCount) signals.overall = 'SELL';

      return signals;
    } catch (error) {
      console.error('Signal generation error:', error);
      return { sma: 'HOLD', rsi: 'HOLD', macd: 'HOLD', overall: 'HOLD' };
    }
  }
}

export default TechnicalIndicators;
