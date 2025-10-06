// Simple test file for the trading function
import yahooFinance from '../lib/yahooFinance.js';
import indicators from '../lib/indicators.js';
import strategy from '../lib/strategy.js';

async function testTradingLogic() {
  console.log('🧪 Testing trading logic...');

  try {
    // Test Yahoo Finance data fetch
    console.log('📈 Fetching market data for ZSP.TO...');
    const marketData = await yahooFinance.getMarketData('ZSP.TO');

    if (!marketData) {
      throw new Error('Failed to fetch market data');
    }

    console.log(`✅ Market data fetched: $${marketData.currentPrice}`);

    // Test technical indicators
    console.log('📊 Calculating technical indicators...');
    const technicalData = indicators.calculate(marketData);

    console.log('✅ Technical indicators:');
    console.log(`  - RSI: ${technicalData.rsi.toFixed(2)}`);
    console.log(`  - SMA20: $${technicalData.sma20.toFixed(2)}`);
    console.log(`  - SMA50: $${technicalData.sma50.toFixed(2)}`);
    console.log(`  - Trend: ${technicalData.trend}`);
    console.log(`  - Signals: ${technicalData.signals.length}`);

    // Test strategy
    console.log('🤖 Testing trading strategy...');
    const decision = strategy.analyze(technicalData, { quantity: 0 });

    console.log('✅ Trading decision:');
    console.log(`  - Action: ${decision.action}`);
    console.log(`  - Quantity: ${decision.quantity}`);
    console.log(`  - Confidence: ${decision.confidence}%`);
    console.log(`  - Reasoning: ${decision.reasoning.join(', ')}`);

    console.log('\n🎉 All tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testTradingLogic();
