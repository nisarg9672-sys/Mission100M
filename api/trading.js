// api/trading.js - Enhanced Professional Trading API with Active Position Management
import { getYahooPrice, getHistoricalData } from '../lib/yahooFinance.js';
import { getAlpacaQuote, placeAlpacaOrder, syncAlpacaPosition } from '../lib/alpaca.js';
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
    logger.info('🚀 Enhanced Trading API request started', { requestId, method: req.method });
    
    // Environment validation
    const envCheck = validateEnvironment();
    if (!envCheck.valid) {
      return res.status(500).json({
        success: false,
        requestId,
        error: 'Environment configuration error',
        details: envCheck.errors
      });
    }

    const {
      ticker = yahooTicker,
      symbol = alpacaTicker,
      action = 'analyze',
      autoTrade = true,
      forceAction = false,
      monitorOnly = false
    } = req.method === 'GET' ? req.query : req.body;

    // Storage health check
    logger.info('🔍 Checking enhanced storage connection...');
    const storageHealth = await storage.healthCheck();
    
    if (storageHealth.status !== 'healthy') {
      logger.error('❌ Enhanced storage not available', storageHealth);
      return res.status(500).json({
        success: false,
        requestId,
        error: 'Enhanced storage unavailable',
        details: storageHealth
      });
    }

    logger.info('✅ Enhanced storage connection verified', {
      features: storageHealth.enhancedFeatures
    });

    // Load position data with enhanced monitoring
    logger.info('📊 Loading enhanced position data...');
    const currentPosition = await storage.getCurrentPosition(alpacaTicker);
    const lastTrade = await storage.getLastTrade(alpacaTicker);
    const allPositions = await storage.getAllPositions();

    // Sync with Alpaca to ensure accuracy
    logger.info('🔄 Syncing with Alpaca positions...');
    let syncedPosition;
    try {
      syncedPosition = await syncAlpacaPosition(alpacaTicker, storage);
      if (syncedPosition) {
        logger.info('✅ Position synced with Alpaca', {
          local: currentPosition?.quantity || 0,
          alpaca: syncedPosition.quantity
        });
      }
    } catch (syncError) {
      logger.warn('⚠️ Alpaca sync failed, using local data', syncError.message);
      syncedPosition = currentPosition;
    }

    const activePosition = syncedPosition || currentPosition;

    logger.info('📋 Enhanced position data loaded', {
      hasPosition: !!activePosition,
      positionQuantity: activePosition?.quantity || 0,
      totalPositions: Object.keys(allPositions).length,
      hasLastTrade: !!lastTrade
    });

    // Monitor-only mode (for continuous monitoring service)
    if (monitorOnly && activePosition) {
      return await handleMonitoringMode(req, res, activePosition, requestId);
    }

    // Check cooldown (reduced to 5 minutes for more active trading)
    const inCooldown = await storage.isInCooldown();
    if (inCooldown && !forceAction) {
      logger.info('⏳ System in cooldown - skipping trade');
      return res.json({
        success: true,
        requestId,
        message: 'System in enhanced cooldown period (5 minutes)',
        data: { 
          status: 'COOLDOWN', 
          autoTrade: 'disabled',
          position: activePosition,
          portfolioSummary: await getPortfolioSummary()
        }
      });
    }

    // Fetch enhanced market data
    logger.info('📈 Fetching enhanced market data...');
    const yahooData = await getYahooPrice(ticker);
    const historicalData = await getHistoricalData(ticker, '1mo');
    
    // Calculate enhanced technical indicators
    const indicators = new TechnicalIndicators();
    const technicals = indicators.calculate(historicalData);
    const signals = indicators.generateSignals(technicals, yahooData.price);

    // Enhanced trading decision with professional strategy
    const enhancedTechnicalData = {
      ...technicals,
      currentPrice: yahooData.price,
      volume: yahooData.volume,
      signals: Object.values(signals).map(signal => ({ type: signal })),
      historical: historicalData
    };

    const decision = strategy.analyze(
      enhancedTechnicalData,
      activePosition,
      lastTrade
    );

    logger.info('🎯 Enhanced trading decision made', {
      action: decision.action,
      confidence: decision.confidence,
      urgency: decision.urgency || 'NORMAL'
    });

    // Enhanced auto-trading logic with urgency levels
    let orderResult = null;
    const shouldAutoTrade = autoTrade && 
      decision && 
      (decision.action === 'BUY' || decision.action === 'SELL') && 
      (decision.confidence > 0.6 || decision.urgency === 'CRITICAL');

    if (shouldAutoTrade) {
      try {
        logger.info('🤖 Executing enhanced auto-trade...', {
          urgency: decision.urgency,
          confidence: decision.confidence
        });

        const orderParams = {
          symbol: alpacaTicker,
          side: decision.action.toLowerCase(),
          qty: decision.quantity || 0.02,
          type: 'market',
          tif: 'gtc',
          // Auto-confirm for critical urgency or if confirm header is set
          confirm: decision.urgency === 'CRITICAL' || 
                  decision.urgency === 'IMMEDIATE' ||
                  req.headers.confirm === 'true' || 
                  req.query.confirm === 'true'
        };

        orderResult = await placeAlpacaOrder(orderParams);

        // Enhanced trade logging with reasoning
        if (orderResult && orderResult.status !== 'simulated') {
          const tradeData = {
            id: `enhanced_${Date.now()}`,
            symbol: alpacaTicker,
            action: decision.action,
            quantity: decision.quantity || 0.02,
            price: yahooData.price,
            orderId: orderResult.orderId,
            timestamp: new Date().toISOString(),
            reasoning: decision.reasoning,
            confidence: decision.confidence,
            urgency: decision.urgency
          };

          logger.info('📝 Logging enhanced trade...');
          await storage.updatePosition(alpacaTicker, tradeData);
          
          // Trigger immediate monitoring for the updated position
          if (decision.action === 'BUY') {
            logger.info('🔍 Initiating position monitoring for new buy order');
          }
          
          logger.info('✅ Enhanced trade successfully logged');
        }

      } catch (tradeError) {
        logger.error('❌ Enhanced auto-trade execution failed', tradeError);
        
        // Log the failure for manual review
        if (decision.urgency === 'CRITICAL' || decision.urgency === 'IMMEDIATE') {
          logger.error('🚨 CRITICAL TRADE FAILED - MANUAL INTERVENTION REQUIRED', {
            symbol: alpacaTicker,
            decision,
            error: tradeError.message
          });
        }
      }
    }

    // Enhanced response with comprehensive data
    const duration = Date.now() - startTime;
    
    if (action === 'analyze') {
      const portfolioSummary = await getPortfolioSummary();
      const riskAssessment = assessPortfolioRisk(allPositions, yahooData.price);
      
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
              trend: determineTrendFromTechnicals(technicals)
            },
            signals
          },
          positions: {
            current: activePosition,
            lastTrade,
            all: allPositions,
            synced: !!syncedPosition
          },
          decision: {
            ...decision,
            professionalAnalysis: generateProfessionalAnalysis(decision, activePosition, yahooData.price)
          },
          trading: {
            autoTrade: shouldAutoTrade ? 
              (orderResult ? 'executed' : 'failed') : 
              (autoTrade ? 'no_signal' : 'disabled'),
            inCooldown,
            confidence: decision.confidence,
            urgency: decision.urgency || 'NORMAL',
            minConfidenceRequired: 0.6
          },
          portfolio: portfolioSummary,
          risk: riskAssessment,
          order: orderResult,
          storage: {
            status: storageHealth.status,
            enhanced: true,
            features: storageHealth.enhancedFeatures
          },
          recommendations: generateTradingRecommendations(decision, activePosition, riskAssessment)
        }
      };

      return res.json(responseData);
    }

    // Enhanced manual trading
    if (action === 'trade' && req.method === 'POST') {
      return await handleManualTrade(req, res, yahooData, requestId, startTime);
    }

    // Default enhanced response
    return res.json({
      success: true,
      requestId,
      durationMs: duration,
      data: {
        market: { yahoo: yahooData },
        position: activePosition,
        technicals,
        signals,
        decision,
        portfolio: await getPortfolioSummary(),
        storage: { 
          status: storageHealth.status,
          enhanced: true 
        }
      }
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('💥 Enhanced Trading API error', error);
    
    return res.status(500).json({
      success: false,
      requestId,
      durationMs: duration,
      error: error.message,
      debug: {
        message: 'Check Vercel function logs for detailed error information',
        timestamp: new Date().toISOString(),
        enhancement: 'Professional trading system with enhanced monitoring'
      }
    });
  }
}

// Enhanced manual trading handler
async function handleManualTrade(req, res, yahooData, requestId, startTime) {
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

  logger.info('📋 Placing enhanced manual order', orderParams);
  const manualOrderResult = await placeAlpacaOrder(orderParams);

  // Enhanced manual trade logging
  if (manualOrderResult && manualOrderResult.status !== 'simulated') {
    const tradeData = {
      id: `manual_enhanced_${Date.now()}`,
      symbol: alpacaTicker,
      action: side.toUpperCase(),
      quantity: parseFloat(qty),
      price: yahooData.price,
      orderId: manualOrderResult.orderId,
      timestamp: new Date().toISOString(),
      reasoning: ['Manual trade executed by user'],
      type: 'MANUAL'
    };

    await storage.updatePosition(alpacaTicker, tradeData);
    logger.info('✅ Enhanced manual trade logged');
  }

  return res.json({
    success: true,
    requestId,
    durationMs: Date.now() - startTime,
    data: {
      market: { yahoo: yahooData },
      position: await storage.getCurrentPosition(alpacaTicker),
      order: manualOrderResult,
      portfolio: await getPortfolioSummary(),
      storage: { status: 'updated', enhanced: true }
    }
  });
}

// Enhanced monitoring mode handler
async function handleMonitoringMode(req, res, position, requestId) {
  logger.info('🔍 Enhanced monitoring mode activated');
  
  const yahooData = await getYahooPrice(yahooTicker);
  const currentPrice = yahooData.price;
  
  const pnlAmount = (currentPrice - position.averagePrice) * position.quantity;
  const pnlPercentage = ((currentPrice - position.averagePrice) / position.averagePrice) * 100;
  
  // Check for critical alerts
  const criticalAlerts = [];
  
  if (pnlPercentage <= -1.5) {
    criticalAlerts.push({
      type: 'CRITICAL_STOP_LOSS',
      message: `Position down ${pnlPercentage.toFixed(2)}% - IMMEDIATE ACTION REQUIRED`,
      urgency: 'CRITICAL'
    });
  }
  
  if (pnlPercentage >= 3) {
    criticalAlerts.push({
      type: 'PROFIT_TARGET',
      message: `Position up ${pnlPercentage.toFixed(2)}% - Consider taking profits`,
      urgency: 'HIGH'
    });
  }

  return res.json({
    success: true,
    requestId,
    monitoring: true,
    data: {
      position,
      currentPrice,
      pnl: {
        amount: pnlAmount,
        percentage: pnlPercentage
      },
      alerts: criticalAlerts,
      timestamp: new Date().toISOString()
    }
  });
}

// Enhanced portfolio summary
async function getPortfolioSummary() {
  try {
    const positions = await storage.getAllPositions();
    const trades = await storage.getTradeHistory(20);
    
    let totalValue = 0;
    let totalPnL = 0;
    let activePositions = 0;
    
    for (const position of Object.values(positions)) {
      activePositions++;
      const positionValue = position.quantity * position.averagePrice;
      totalValue += positionValue;
      // Note: For accurate P&L, we'd need current prices for each position
    }
    
    const recentTrades = trades.slice(0, 10);
    const winningTrades = recentTrades.filter(t => t.pnl && t.pnl > 0).length;
    const winRate = recentTrades.length > 0 ? (winningTrades / recentTrades.length) * 100 : 0;
    
    return {
      activePositions,
      totalValue: totalValue.toFixed(2),
      recentTradesCount: recentTrades.length,
      winRate: winRate.toFixed(1) + '%',
      lastTradeTime: recentTrades[0]?.timestamp || null
    };
    
  } catch (error) {
    logger.error('Error calculating portfolio summary', error);
    return { error: 'Unable to calculate portfolio summary' };
  }
}

// Risk assessment
function assessPortfolioRisk(positions, currentPrice) {
  const positionCount = Object.keys(positions).length;
  
  let riskLevel = 'LOW';
  const riskFactors = [];
  
  if (positionCount > 5) {
    riskLevel = 'MEDIUM';
    riskFactors.push('High number of open positions');
  }
  
  // Additional risk assessment logic would go here
  
  return {
    level: riskLevel,
    factors: riskFactors,
    recommendation: riskLevel === 'LOW' ? 
      'Portfolio risk is well managed' : 
      'Consider reducing position sizes or implementing tighter stops'
  };
}

// Professional analysis generator
function generateProfessionalAnalysis(decision, position, currentPrice) {
  const hasPosition = position && position.quantity > 0;
  
  if (hasPosition) {
    const pnl = ((currentPrice - position.averagePrice) / position.averagePrice) * 100;
    
    return {
      summary: `Position monitoring active. Current P&L: ${pnl.toFixed(2)}%`,
      recommendation: decision.action === 'SELL' ? 
        'Consider closing position based on technical signals' : 
        'Continue monitoring position',
      riskLevel: Math.abs(pnl) > 2 ? 'ELEVATED' : 'NORMAL'
    };
  } else {
    return {
      summary: decision.action === 'BUY' ? 
        'Entry opportunity identified' : 
        'No clear entry signal',
      recommendation: decision.action === 'BUY' ? 
        'Consider opening position with tight stop loss' : 
        'Wait for better entry opportunity',
      riskLevel: 'NORMAL'
    };
  }
}

// Trading recommendations
function generateTradingRecommendations(decision, position, riskAssessment) {
  const recommendations = [];
  
  if (decision.action === 'BUY' && !position) {
    recommendations.push('Entry signal detected - consider opening position');
    recommendations.push('Set stop loss at 1.5% below entry price');
    recommendations.push('Target 3% profit for exit');
  }
  
  if (decision.action === 'SELL' && position) {
    recommendations.push('Exit signal detected - consider closing position');
    recommendations.push('Review stop loss and take profit levels');
  }
  
  if (decision.action === 'HOLD') {
    recommendations.push('No clear signal - maintain current position');
    recommendations.push('Continue monitoring for changes in momentum');
  }
  
  return recommendations;
}

// Trend determination helper
function determineTrendFromTechnicals(technicals) {
  try {
    if (technicals.sma && technicals.sma.length >= 3) {
      const latest = technicals.sma[technicals.sma.length - 1].value;
      const previous = technicals.sma[technicals.sma.length - 2].value;
      const older = technicals.sma[technicals.sma.length - 3].value;

      if (latest > previous && previous > older) return 'UPTREND';
      if (latest < previous && previous < older) return 'DOWNTREND';
    }
    return 'NEUTRAL';
  } catch (error) {
    return 'NEUTRAL';
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