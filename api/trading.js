// api/trading.js – Fixed version with proper Google Sheets integration
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
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Confirm, X-Request-Id');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    logger.info('🚀 Trading API request started', { requestId, method: req.method });

    // First, validate environment setup
    const envCheck = validateEnvironment();
    if (!envCheck.valid) {
      return res.status(500).json({
        success: false,
        requestId,
        error: 'Environment configuration error',
        details: envCheck.errors,
        message: 'Please check your environment variables setup'
      });
    }

    const {
      ticker = yahooTicker,
      symbol = alpacaTicker,
      action = 'analyze',
      autoTrade = true,
      forceAction = false
    } = req.method === 'GET' ? req.query : req.body;

    // Test Google Sheets connection
    logger.info('🔍 Checking Google Sheets connection...');
    const storageHealth = await storage.healthCheck();
    
    if (storageHealth.status !== 'healthy') {
      logger.error('❌ Google Sheets not available', storageHealth);
      return res.status(500).json({
        success: false,
        requestId,
        error: 'Google Sheets storage unavailable',
        details: storageHealth,
        message: 'Check Google Sheets configuration and permissions'
      });
    }

    logger.info('✅ Google Sheets connection verified', {
      title: storageHealth.spreadsheetTitle
    });

    // Check cooldown
    const inCooldown = await storage.isInCooldown();
    if (inCooldown && !forceAction) {
      logger.info('⏳ System in cooldown - skipping trade');
      return res.json({
        success: true,
        requestId,
        message: 'System in cooldown period',
        data: { status: 'COOLDOWN', autoTrade: 'disabled' }
      });
    }

    // Load current positions from Google Sheets
    logger.info('📊 Loading positions from Google Sheets...');
    const currentPosition = await storage.getCurrentPosition(alpacaTicker);
    const lastTrade = await storage.getLastTrade(alpacaTicker);
    const allPositions = await storage.getAllPositions();
    
    logger.info('📋 Position data loaded', {
      hasCurrentPosition: !!currentPosition,
      hasLastTrade: !!lastTrade,
      totalPositions: Object.keys(allPositions).length
    });

    // Fetch market data
    logger.info('📈 Fetching market data...');
    const yahooData = await getYahooPrice(ticker);
    const historicalData = await getHistoricalData(ticker, '1mo');

    // Calculate technical indicators
    const indicators = new TechnicalIndicators();
    const technicals = indicators.calculate(historicalData);
    const signals = indicators.generateSignals(technicals, yahooData.price);

    // Make trading decision
    const decision = strategy.analyze(
      {
        ...technicals,
        currentPrice: yahooData.price,
        signals: Object.values(signals).map(signal => ({ type: signal }))
      },
      currentPosition,
      lastTrade
    );

    logger.info('🎯 Trading decision made', {
      action: decision.action,
      confidence: decision.confidence
    });

    // Execute auto-trade if conditions are met
    let orderResult = null;
    const shouldAutoTrade = autoTrade && 
                           decision && 
                           (decision.action === 'BUY' || decision.action === 'SELL') && 
                           decision.confidence > 60;

    if (shouldAutoTrade) {
      try {
        logger.info('🤖 Executing auto-trade...');
        
        const orderParams = {
          symbol: alpacaTicker,
          side: decision.action.toLowerCase(),
          qty: decision.quantity || 0.02,
          type: 'market',
          tif: 'gtc',
          confirm: req.headers.confirm === 'true' || req.query.confirm === 'true'
        };

        orderResult = await placeAlpacaOrder(orderParams);

        // Log trade to Google Sheets if real order
        if (orderResult && orderResult.status !== 'simulated') {
          const tradeData = {
            id: `trade_${Date.now()}`,
            symbol: alpacaTicker,
            action: decision.action,
            quantity: decision.quantity || 0.02,
            price: yahooData.price,
            orderId: orderResult.orderId,
            timestamp: new Date().toISOString()
          };

          logger.info('📝 Logging trade to Google Sheets...');
          await storage.updatePosition(alpacaTicker, tradeData);
          logger.info('✅ Trade successfully logged to Google Sheets');
        }

      } catch (tradeError) {
        logger.error('❌ Auto-trade execution failed', tradeError);
      }
    }

    // Prepare response
    const duration = Date.now() - startTime;
    
    if (action === 'analyze') {
      const responseData = {
        success: true,
        requestId,
        durationMs: duration,
        data: {
          market: {
            yahoo: yahooData,
            technicals: {
              rsi: technicals.rsi?.[technicals.rsi.length - 1]?.value || null,
              sma20: technicals.sma?.[technicals.sma.length - 1]?.value || null,
              trend: 'NEUTRAL'
            },
            signals
          },
          positions: {
            current: currentPosition,
            lastTrade,
            all: allPositions
          },
          decision,
          trading: {
            autoTrade: shouldAutoTrade ? 
              (orderResult ? 'executed' : 'failed') : 
              (autoTrade ? 'no_signal' : 'disabled'),
            inCooldown,
            confidence: decision.confidence,
            minConfidenceRequired: 60
          },
          order: orderResult,
          storage: {
            status: storageHealth.status,
            connected: true,
            spreadsheet: storageHealth.spreadsheetTitle
          }
        }
      };

      return res.json(responseData);
    }

    // Manual trade handling
    if (action === 'trade' && req.method === 'POST') {
      const { side = 'buy', qty = 0.02, type = 'market', tif = 'gtc' } = req.body;

      if (!['buy', 'sell'].includes(side.toLowerCase())) {
        return res.status(400).json({ 
          success: false, 
          requestId, 
          error: 'Invalid trade side - must be buy or sell' 
        });
      }

      const orderParams = {
        symbol: alpacaTicker,
        side: side.toLowerCase(),
        qty: parseFloat(qty),
        type: type.toLowerCase(),
        tif: tif.toLowerCase(),
        confirm: req.headers.confirm === 'true'
      };

      logger.info('📋 Placing manual order', orderParams);
      const manualOrderResult = await placeAlpacaOrder(orderParams);

      // Log manual trade to Google Sheets
      if (manualOrderResult && manualOrderResult.status !== 'simulated') {
        const tradeData = {
          id: `manual_${Date.now()}`,
          symbol: alpacaTicker,
          action: side.toUpperCase(),
          quantity: parseFloat(qty),
          price: yahooData.price,
          orderId: manualOrderResult.orderId,
          timestamp: new Date().toISOString()
        };

        await storage.updatePosition(alpacaTicker, tradeData);
        logger.info('✅ Manual trade logged to Google Sheets');
      }

      return res.json({
        success: true,
        requestId,
        durationMs: Date.now() - startTime,
        data: {
          market: { yahoo: yahooData },
          position: await storage.getCurrentPosition(alpacaTicker),
          signals,
          decision,
          order: manualOrderResult,
          storage: { status: 'updated' }
        }
      });
    }

    // Default response
    return res.json({
      success: true,
      requestId,
      durationMs: Date.now() - startTime,
      data: {
        market: { yahoo: yahooData },
        position: currentPosition,
        technicals,
        signals,
        decision,
        storage: { status: storageHealth.status }
      }
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('💥 Trading API error', error);
    
    return res.status(500).json({
      success: false,
      requestId,
      durationMs: duration,
      error: error.message,
      debug: {
        message: 'Check Vercel function logs for detailed error information',
        timestamp: new Date().toISOString(),
        hint: 'Verify Google Sheets setup and environment variables'
      }
    });
  }
}

function validateEnvironment() {
  const required = [
    'ALPACA_API_KEY_ID',
    'ALPACA_SECRET_KEY', 
    'ALPACA_PAPER',
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_PRIVATE_KEY',
    'GOOGLE_SPREADSHEET_ID'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  return {
    valid: missing.length === 0,
    errors: missing.length > 0 ? {
      missingVariables: missing,
      message: 'Add these environment variables in Vercel dashboard'
    } : null
  };
}