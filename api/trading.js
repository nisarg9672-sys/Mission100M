// api/trading.js – Enhanced with proper Google Sheets logging integration
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
  
  logger.logRequest(requestId, req.method, req.url);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Confirm, X-Request-Id');

  if (req.method === 'OPTIONS') {
    logger.info('Preflight request', { requestId });
    return res.status(204).end();
  }

  try {
    // Validate Google Sheets configuration first
    await validateGoogleSheetsConfig();
    
    const {
      ticker = yahooTicker,
      symbol = alpacaTicker,
      action = 'analyze',
      autoTrade = true,
      forceAction = false
    } = req.method === 'GET' ? req.query : req.body;

    // Check Google Sheets storage health
    const storageHealth = await storage.healthCheck();
    logger.logStorageHealth(storageHealth);

    if (storageHealth.status !== 'healthy') {
      return res.status(500).json({
        success: false,
        requestId,
        error: 'Google Sheets storage is not available',
        details: storageHealth,
        message: 'Check your Google Sheets configuration and environment variables'
      });
    }

    // SAFETY CHECK: Cooldown period
    const inCooldown = await storage.isInCooldown();
    logger.logCooldown(inCooldown);
    
    if (inCooldown && !forceAction) {
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

    // Fetch current position and last trade from Google Sheets
    const currentPosition = await storage.getCurrentPosition(alpacaTicker);
    const lastTrade = await storage.getLastTrade(alpacaTicker);
    const allPositions = await storage.getAllPositions();
    
    logger.logPosition(alpacaTicker, currentPosition);
    logger.info('Storage data loaded from Google Sheets', {   
      requestId,   
      hasCurrentPosition: currentPosition ? true : false,
      hasLastTrade: lastTrade ? true : false,
      totalPositions: Object.keys(allPositions).length
    });

    // Fetch Yahoo price
    const yahooData = await getYahooPrice(ticker);
    logger.logMarketData(ticker, yahooData);

    // Fetch historical data
    const historicalData = await getHistoricalData(ticker, '1mo');
    logger.info('Historical data fetched', { requestId, count: historicalData.length });

    // Calculate indicators & signals
    const indicators = new TechnicalIndicators();
    const technicals = indicators.calculate(historicalData);
    const signals = indicators.generateSignals(technicals, yahooData.price);
    
    logger.logIndicators({
      rsi: technicals.rsi?.[technicals.rsi.length - 1]?.value,
      sma20: technicals.sma?.[technicals.sma.length - 1]?.value,
      signals: Object.values(signals)
    });

    // Use strategy to make trading decision
    const decision = strategy.analyze(
      {
        ...technicals,
        currentPrice: yahooData.price,
        signals: Object.values(signals).map(signal => ({ type: signal }))
      },
      currentPosition,
      lastTrade
    );

    logger.logDecision(decision);

    // Auto-execute trades if enabled
    let orderResult = null;
    if (
      autoTrade &&
      decision &&
      (decision.action === 'BUY' || decision.action === 'SELL') &&
      decision.confidence > 60
    ) {
      try {
        const orderParams = {
          symbol: alpacaTicker,
          side: decision.action.toLowerCase(),
          qty: decision.quantity || 0.02,
          type: 'market',
          tif: 'gtc',
          confirm: req.headers.confirm === 'true' || req.query.confirm === 'true'
        };

        logger.info('Auto-executing trade based on strategy', { requestId, orderParams, decision });
        orderResult = await placeAlpacaOrder(orderParams);

        // Update position in Google Sheets after successful trade
        if (orderResult && orderResult.status !== 'simulated') {
          const tradeResult = {
            id: `trade_${Date.now()}`,
            symbol: alpacaTicker,
            action: decision.action,
            quantity: decision.quantity || 0.02,
            price: yahooData.price,
            orderId: orderResult.orderId,
            timestamp: new Date().toISOString()
          };

          await storage.updatePosition(alpacaTicker, tradeResult);
          logger.logTrade(tradeResult);
        }

      } catch (tradeError) {
        logger.error('Auto-trade execution failed', tradeError);
        // Continue with analysis response even if trade fails
      }
    }

    // Analysis response
    if (action === 'analyze') {
      const duration = Date.now() - startTime;
      logger.logPerformance('Trading analysis', startTime, { requestId });

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
            trend: 'NEUTRAL'
          },
          signals,
          decision,
          trading: {
            autoTrade: autoTrade ? 
              (orderResult ? 'executed' : 
              decision.action === 'HOLD' ? 'holding' : 
              'confidence_too_low') : 'disabled',
            inCooldown,
            confidence: decision.confidence,
            minConfidenceRequired: 60
          },
          order: orderResult,
          storage: {
            status: storageHealth.status,
            googleSheets: {
              connected: storageHealth.status === 'healthy',
              spreadsheetTitle: storageHealth.spreadsheetTitle || 'Unknown',
              lastChecked: storageHealth.lastChecked
            }
          },
          safety: {
            hasPosition: currentPosition ? true : false,
            positionSize: currentPosition?.quantity || 0,
            maxPositionSize: 0.05,
            lastTradeTime: lastTrade?.timestamp || null,
            cooldownActive: inCooldown
          }
        }
      };

      return res.json(responseData);
    }

    // Manual trade action
    if (action === 'trade' && req.method === 'POST') {
      const { side = 'buy', qty = 0.02, type = 'market', tif = 'gtc' } = req.body;

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

      // Update position in Google Sheets after manual trade
      if (manualOrderResult && manualOrderResult.status !== 'simulated') {
        const tradeResult = {
          id: `manual_${Date.now()}`,
          symbol: alpacaTicker,
          action: side.toUpperCase(),
          quantity: parseFloat(qty),
          price: yahooData.price,
          orderId: manualOrderResult.orderId,
          timestamp: new Date().toISOString()
        };

        await storage.updatePosition(alpacaTicker, tradeResult);
        logger.logTrade(tradeResult);
      }

      const duration = Date.now() - startTime;
      logger.logPerformance('Manual trade', startTime, { requestId });

      return res.json({
        success: true,
        requestId,
        durationMs: duration,
        data: {   
          yahoo: yahooData,   
          position: await storage.getCurrentPosition(alpacaTicker),
          signals,   
          decision,   
          order: manualOrderResult,
          storage: {
            status: 'healthy',
            updated: true
          }
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
        storage: {
          status: storageHealth.status,
          googleSheets: {
            connected: storageHealth.status === 'healthy'
          }
        },
        safety: {
          cooldownActive: inCooldown,
          hasPosition: currentPosition ? true : false,
          minConfidenceRequired: 60,
          maxPositionSize: 0.05
        }
      }
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Trading function error', error);
    
    return res.status(500).json({
      success: false,
      requestId,
      error: error.message,
      debug: {
        message: 'Check Vercel logs for detailed error information',
        timestamp: new Date().toISOString(),
        possibleCause: 'Google Sheets configuration or network connectivity issue'
      }
    });
  }
}

// Helper function to validate Google Sheets configuration
async function validateGoogleSheetsConfig() {
  const requiredEnvVars = [
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_PRIVATE_KEY', 
    'GOOGLE_SPREADSHEET_ID'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    logger.logEnvironmentValidation(missingVars);
    throw new Error(`Missing Google Sheets environment variables: ${missingVars.join(', ')}`);
  }

  logger.logEnvironmentValidation();
}