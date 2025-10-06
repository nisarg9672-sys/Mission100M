// /api/trading.js
import { getYahooPrice, getHistoricalData } from '../lib/yahooFinance.js';
import { getAlpacaQuote, placeAlpacaOrder } from '../lib/alpaca.js';
import TechnicalIndicators from '../lib/indicators.js';
import { createLogger } from '../lib/logger.js';
import { randomUUID } from 'crypto';

const logger = createLogger('Trading');

export default async function handler(req, res) {
  const requestId = randomUUID();
  const startTime = Date.now();
  logger.info('Request received', { requestId, method: req.method, url: req.url });

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Confirm, X-Request-Id');

  if (req.method === 'OPTIONS') {
    logger.info('Preflight request', { requestId });
    return res.status(204).end();
  }

  try {
    logger.info('Trading function triggered', { requestId });

    const { ticker = 'ZSP.TO', symbol = 'ZSP', action = 'analyze' } =
      req.method === 'GET' ? req.query : req.body;

    // Fetch Yahoo price
    const yahooData = await getYahooPrice(ticker);
    logger.info('Yahoo price fetched', { requestId, ticker: yahooData.ticker, price: yahooData.price });

    // Fetch historical data
    const historicalData = await getHistoricalData(ticker, '1mo');
    logger.info('Historical data fetched', { requestId, count: historicalData.length });

    // Indicators & signals
    const indicators = new TechnicalIndicators();
    const technicals = indicators.calculate(historicalData);
    const signals = indicators.generateSignals(technicals, yahooData.price);
    logger.info('Technical analysis complete', { requestId, signals });

    // Analysis-only response
    if (action === 'analyze') {
      const duration = Date.now() - startTime;
      logger.info('Responding to analysis request', { requestId, durationMs: duration });
      return res.json({
        success: true,
        requestId,
        durationMs: duration,
        data: { yahoo: yahooData, technicals, signals }
      });
    }

    // Trade action
    if (action === 'trade' && req.method === 'POST') {
      const { side = 'buy', qty = 1, type = 'market', tif = 'day' } = req.body;
      if (!['buy', 'sell'].includes(side.toLowerCase())) {
        logger.warn('Invalid trade side', { requestId, side });
        return res.status(400).json({ success: false, requestId, error: 'Invalid side' });
      }

      const orderParams = {
        symbol: symbol.toUpperCase(),
        side: side.toLowerCase(),
        qty: parseInt(qty, 10),
        type: type.toLowerCase(),
        tif: tif.toLowerCase(),
        confirm: req.headers.confirm === 'true'
      };
      logger.info('Placing order', { requestId, orderParams });

      const orderResult = await placeAlpacaOrder(orderParams);
      logger.info('Order result', { requestId, orderResult });

      const duration = Date.now() - startTime;
      return res.json({
        success: true,
        requestId,
        durationMs: duration,
        data: { yahoo: yahooData, signals, order: orderResult }
      });
    }

    // Default analysis if action unrecognized
    logger.warn('Unrecognized action, defaulting to analyze', { requestId, action });
    const duration = Date.now() - startTime;
    return res.json({
      success: true,
      requestId,
      durationMs: duration,
      data: { yahoo: yahooData, technicals, signals }
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Trading function error', {
      requestId,
      message: error.message,
      stack: error.stack,
      durationMs: duration
    });
    return res.status(500).json({
      success: false,
      requestId,
      error: error.message
    });
  }
}
