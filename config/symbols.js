// config/symbols.js - Enhanced configuration
export default {
  // Symbol for Yahoo Finance APIs (e.g., Yahoo's ETH ticker)
  yahoo: 'ETH-USD',

  // Symbol for Alpaca APIs (no hyphen)
  alpaca: 'ETHUSD',

  // Trading configuration
  trading: {
    maxPositionSize: 0.02,        // Maximum ETH per trade
    profitTargetPercent: 4,       // Take profit at 4%
    stopLossPercent: 2.5,         // Stop loss at 2.5%
    cooldownMinutes: 15,          // Minutes between trades
    minConfidence: 70,            // Minimum confidence to execute
    rsiOversold: 35,             // RSI oversold threshold
    rsiOverbought: 65            // RSI overbought threshold
  }
};
