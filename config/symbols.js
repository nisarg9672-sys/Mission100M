// config/symbols.js - Enhanced configuration with lenient settings
export default {
  // Symbol for Yahoo Finance APIs (e.g., Yahoo's ETH ticker)
  yahoo: 'ETH-USD',

  // Symbol for Alpaca APIs (no hyphen)
  alpaca: 'ETHUSD',

  // Trading configuration - More lenient settings
  trading: {
    maxPositionSize: 0.05,        // Maximum ETH per trade (increased from 0.02)
    profitTargetPercent: 4,       // Take profit at 4%
    stopLossPercent: 2.5,         // Stop loss at 2.5%
    cooldownMinutes: 15,          // Minutes between trades
    minConfidence: 60,            // Minimum confidence to execute (decreased from 70)
    rsiOversold: 40,             // RSI oversold threshold (increased from 35)
    rsiOverbought: 60,           // RSI overbought threshold (decreased from 65)
    buyConditionsRequired: 3      // Conditions needed for buy (decreased from 5)
  }
};
