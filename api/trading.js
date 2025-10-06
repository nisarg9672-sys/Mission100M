
import yahooFinance from './lib/yahooFinance.js';
import alpaca from './lib/alpaca.js';
import indicators from './lib/indicators.js';
import strategy from './lib/strategy.js';
import storage from './lib/storage.js';
import logger from './lib/logger.js';

export default async function handler(req, res) {
  try {
    logger.info('Trading function triggered');

    // Verify request (optional webhook validation)
    if (process.env.WEBHOOK_SECRET) {
      const receivedSecret = req.headers['x-webhook-secret'];
      if (receivedSecret !== process.env.WEBHOOK_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    // Fetch market data for ZSP ETF
    const symbol = 'ZSP.TO';
    const marketData = await yahooFinance.getMarketData(symbol);

    if (!marketData) {
      throw new Error('Failed to fetch market data');
    }

    // Calculate technical indicators
    const technicalData = await indicators.calculate(marketData);

    // Get current position
    const currentPosition = await storage.getCurrentPosition(symbol);

    // Execute trading strategy
    const decision = strategy.analyze(technicalData, currentPosition);

    if (decision.action !== 'HOLD') {
      // Execute trade via Alpaca
      const tradeResult = await alpaca.executeTrade({
        symbol: 'ZSP', // Use the base symbol for Alpaca
        action: decision.action,
        quantity: decision.quantity,
        takeProfitPercent: 10,
        stopLossPercent: 5
      });

      // Update position tracking
      await storage.updatePosition(symbol, tradeResult);

      logger.info('Trade executed', { decision, tradeResult });

      return res.status(200).json({
        success: true,
        action: decision.action,
        trade: tradeResult,
        indicators: technicalData,
        timestamp: new Date().toISOString()
      });
    }

    logger.info('No action taken - HOLD');
    return res.status(200).json({
      success: true,
      action: 'HOLD',
      data: technicalData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Trading function error', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
