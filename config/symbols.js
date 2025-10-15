// config/symbols.js - Enhanced configuration with NVDA stock trading
export default {
  // Symbol for Yahoo Finance APIs (NVDA stock)
  yahoo: 'NVDA',
  
  // Symbols for Alpaca APIs (no hyphen)
  alpaca: {
    primary: 'NVDA',    // For data fetching and analysis
    buySignal: 'NVDL',  // Buy this when buy signal is generated
    sellSignal: 'NVD'   // Buy this when sell signal is generated
  },
  
  // Trading configuration - Updated for stock trading
  trading: {
    maxPositionSize: 10,     // Maximum shares per trade
    profitTargetPercent: 4,  // Take profit at 4%
    stopLossPercent: 2.5,    // Stop loss at 2.5%
    cooldownMinutes: 15,     // Minutes between trades
    minConfidence: 60,       // Minimum confidence to execute
    rsiOversold: 40,         // RSI oversold threshold
    rsiOverbought: 60,       // RSI overbought threshold
    buyConditionsRequired: 3 // Conditions needed for buy
  }
};