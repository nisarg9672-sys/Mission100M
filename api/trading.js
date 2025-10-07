// api/trading.js – using strategy.js version

import { getYahooPrice, getHistoricalData } from '../lib/yahooFinance.js';
import { getAlpacaQuote, placeAlpacaOrder } from '../lib/alpaca.js';
import TechnicalIndicators from '../lib/indicators.js';
import strategy from '../lib/strategy.js';
import logger from '../lib/logger.js';
import { randomUUID } from 'crypto';
import symbols from '../config/symbols.js';

const yahooTicker = symbols.yahoo;
const alpacaTicker = symbols.alpaca;

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

    const {
      ticker = yahooTicker,
      symbol = alpacaTicker,
      action = 'analyze',
      autoTrade = true
    } = req.method === 'GET' ? req.query : req.body;

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

    // Use strategy to make trading decision
    const currentPosition = null; // You could fetch this from storage if needed
    const decision = strategy.analyze(
      {
        ...technicals,
        currentPrice: yahooData.price,
        signals: Object.values(signals).map(signal => ({ type: signal }))
      },
      currentPosition
    );

    logger.info('=== DEBUG: Raw technical data ===');
    logger.info('technicals:', JSON.stringify(technicals, null, 2));
    logger.info('signals:', JSON.stringify(signals, null, 2));
    logger.info('yahooData.price:', yahooData.price);
    logger.info('=== END DEBUG ===');
    logger.info('Strategy decision made', { requestId, decision });

    // Auto-execute trades if enabled
    let orderResult = null;
    if (
      autoTrade &&
      decision &&
      (decision.action === 'BUY' || decision.action === 'SELL')
    ) {
      try {
        const orderParams = {
          symbol: alpacaTicker,
          side: decision.action.toLowerCase(),
          qty: decision.quantity || 1,
          type: 'market',
          tif: 'day',
          confirm: req.headers.confirm === 'true' || req.query.confirm === 'true'
        };
        logger.info('Auto-executing trade based on strategy', { requestId, orderParams, decision });
        orderResult = await placeAlpacaOrder(orderParams);
        logger.info('Auto-trade result', { requestId, orderResult });
      } catch (tradeError) {
        logger.error('Auto-trade execution failed', { requestId, error: tradeError.message });
        // Continue with analysis response even if trade fails
      }
    }

    // Analysis-only response (or analysis + trade result)
    if (action === 'analyze') {
      const duration = Date.now() - startTime;
      logger.info('Responding to analysis request', { requestId, durationMs: duration });
      return res.json({
        success: true,
        requestId,
        durationMs: duration,
        data: {
          yahoo: yahooData,
          technicals,
          signals,
          decision,
          autoTrade: autoTrade
            ? orderResult
              ? 'executed'
              : decision.action === 'HOLD'
              ? 'hold_signal'
              : 'no_confirmation'
            : 'disabled',
          order: orderResult
        }
      });
    }

    // Manual trade action
    if (action === 'trade' && req.method === 'POST') {
      const { side = 'buy', qty = 1, type = 'market', tif = 'day' } = req.body;
      if (!['buy', 'sell'].includes(side.toLowerCase())) {
        logger.warn('Invalid trade side', { requestId, side });
        return res.status(400).json({ success: false, requestId, error: 'Invalid side' });
      }
      const orderParams = {
        symbol: alpacaTicker,
        side: side.toLowerCase(),
        qty: parseInt(qty, 10),
        type: type.toLowerCase(),
        tif: tif.toLowerCase(),
        confirm: req.headers.confirm === 'true'
      };
      logger.info('Placing manual order', { requestId, orderParams });
      const manualOrderResult = await placeAlpacaOrder(orderParams);
      logger.info('Manual order result', { requestId, orderResult: manualOrderResult });
      const duration = Date.now() - startTime;
      return res.json({
        success: true,
        requestId,
        durationMs: duration,
        data: { yahoo: yahooData, signals, decision, order: manualOrderResult }
      });
    }

    // Default analysis if action unrecognized
    logger.warn('Unrecognized action, defaulting to analyze', { requestId, action });
    const duration = Date.now() - startTime;
    return res.json({
      success: true,
      requestId,
      durationMs: duration,
      data: { yahoo: yahooData, technicals, signals, decision }
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
