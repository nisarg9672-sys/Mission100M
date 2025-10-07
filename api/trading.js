// api/trading.js – Enhanced with comprehensive safety checks
import { getYahooPrice, getHistoricalData } from '../lib/yahooFinance.js';
import { getAlpacaQuote, placeAlpacaOrder } from '../lib/alpaca.js';
import TechnicalIndicators from '../lib/indicators.js';
import strategy from '../lib/strategy.js';
import logger from '../lib/logger.js';
import storage from '../lib/storage.js';
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
      autoTrade = true,
      forceAction = false  // New parameter for manual override
    } = req.method === 'GET' ? req.query : req.body;

    // SAFETY CHECK: Cooldown period
    const inCooldown = await storage.isInCooldown();
    if (inCooldown && !forceAction) {
      logger.info('System in cooldown period', { requestId });
      return res.json({
        success: true,
        requestId,
        message: 'System in cooldown period',
        data: {
          status: 'COOLDOWN',
          message: 'Trading paused - cooldown period active',
          autoTrade: 'disabled'
        }
      });
    }

    // Fetch current position and last trade from storage
    const currentPosition = await storage.getCurrentPosition(alpacaTicker);
    const lastTrade = await storage.getLastTrade(alpacaTicker);
    const allPositions = await storage.getAllPositions();
    
    logger.info('Position data loaded', { 
      requestId, 
      currentPosition, 
      lastTrade,
      allPositions: Object.keys(allPositions)
    });

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

    // Use strategy to make trading decision with enhanced data
    const decision = strategy.analyze(
      {
        ...technicals,
        currentPrice: yahooData.price,
        signals: Object.values(signals).map(signal => ({ type: signal }))
      },
      currentPosition,
      lastTrade
    );

    logger.info('=== COMPLETE TRADING ANALYSIS ===');
    logger.info('currentPosition:', JSON.stringify(currentPosition, null, 2));
    logger.info('lastTrade:', JSON.stringify(lastTrade, null, 2));
    logger.info('technicals summary:', {
      rsi: technicals.rsi?.[technicals.rsi.length - 1]?.value,
      sma: technicals.sma?.[technicals.sma.length - 1]?.value,
      priceChange: ((yahooData.price - yahooData.price) / yahooData.price * 100).toFixed(2) + '%'
    });
    logger.info('signals:', JSON.stringify(signals, null, 2));
    logger.info('decision:', JSON.stringify(decision, null, 2));
    logger.info('=== END ANALYSIS ===');

    // Auto-execute trades if enabled
    let orderResult = null;
    if (
      autoTrade &&
      decision &&
      (decision.action === 'BUY' || decision.action === 'SELL') &&
      decision.confidence > 70
    ) {
      try {
        const orderParams = {
          symbol: alpacaTicker,
          side: decision.action.toLowerCase(),
          qty: decision.quantity || 0.01,
          type: 'market',
          tif: 'gtc',
          confirm: req.headers.confirm === 'true' || req.query.confirm === 'true'
        };
        
        logger.info('Auto-executing trade based on strategy', { requestId, orderParams, decision });
        orderResult = await placeAlpacaOrder(orderParams);
        
        // Update position in storage after successful trade
        if (orderResult && orderResult.status !== 'simulated') {
          await storage.updatePosition(alpacaTicker, {
            symbol: alpacaTicker,
            action: decision.action,
            quantity: decision.quantity || 0.01,
            price: yahooData.price,
            orderId: orderResult.orderId
          });
          logger.info('Position updated in storage after trade', { requestId, orderResult });
        }
        
        logger.info('Auto-trade result', { requestId, orderResult });
      } catch (tradeError) {
        logger.error('Auto-trade execution failed', { requestId, error: tradeError.message });
        // Continue with analysis response even if trade fails
      }
    }

    // Analysis response
    if (action === 'analyze') {
      const duration = Date.now() - startTime;
      logger.info('Responding to analysis request', { requestId, durationMs: duration });
      
      const responseData = {
        success: true,
        requestId,
        durationMs: duration,
        data: {
          yahoo: yahooData,
          position: currentPosition,
          lastTrade,
          allPositions,
          technicals: {
            rsi: technicals.rsi?.[technicals.rsi.length - 1]?.value || null,
            sma20: technicals.sma?.[technicals.sma.length - 1]?.value || null,
            trend: 'NEUTRAL'  // Simplified for response
          },
          signals,
          decision,
          trading: {
            autoTrade: autoTrade ? 
              (orderResult ? 'executed' : 
               decision.action === 'HOLD' ? 'holding' : 
               'no_confirmation') : 'disabled',
            inCooldown,
            confidence: decision.confidence
          },
          order: orderResult,
          safety: {
            hasPosition: currentPosition ? true : false,
            positionSize: currentPosition?.quantity || 0,
            lastTradeTime: lastTrade?.timestamp || null,
            cooldownActive: inCooldown
          }
        }
      };

      return res.json(responseData);
    }

    // Manual trade action
    if (action === 'trade' && req.method === 'POST') {
      const { side = 'buy', qty = 0.01, type = 'market', tif = 'gtc' } = req.body;
      
      if (!['buy', 'sell'].includes(side.toLowerCase())) {
        logger.warn('Invalid trade side', { requestId, side });
        return res.status(400).json({ success: false, requestId, error: 'Invalid side' });
      }
      
      const orderParams = {
        symbol: alpacaTicker,
        side: side.toLowerCase(),
        qty: parseFloat(qty),
        type: type.toLowerCase(),
        tif: tif.toLowerCase(),
        confirm: req.headers.confirm === 'true'
      };
      
      logger.info('Placing manual order', { requestId, orderParams });
      const manualOrderResult = await placeAlpacaOrder(orderParams);
      
      // Update position after manual trade
      if (manualOrderResult && manualOrderResult.status !== 'simulated') {
        await storage.updatePosition(alpacaTicker, {
          symbol: alpacaTicker,
          action: side.toUpperCase(),
          quantity: parseFloat(qty),
          price: yahooData.price,
          orderId: manualOrderResult.orderId
        });
      }
      
      logger.info('Manual order result', { requestId, orderResult: manualOrderResult });
      const duration = Date.now() - startTime;
      
      return res.json({
        success: true,
        requestId,
        durationMs: duration,
        data: { 
          yahoo: yahooData, 
          position: await storage.getCurrentPosition(alpacaTicker),
          signals, 
          decision, 
          order: manualOrderResult 
        }
      });
    }

    // Default analysis response
    logger.warn('Unrecognized action, defaulting to analyze', { requestId, action });
    const duration = Date.now() - startTime;
    return res.json({
      success: true,
      requestId,
      durationMs: duration,
      data: { 
        yahoo: yahooData, 
        position: currentPosition, 
        technicals, 
        signals, 
        decision,
        safety: {
          cooldownActive: inCooldown,
          hasPosition: currentPosition ? true : false
        }
      }
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
      error: error.message,
      debug: {
        message: 'Check Vercel logs for detailed error information',
        timestamp: new Date().toISOString()
      }
    });
  }
}
