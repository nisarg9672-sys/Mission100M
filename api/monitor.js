// api/monitor.js - Fixed Continuous Position Monitoring with Better Validation
import { getYahooPrice, getHistoricalData } from '../lib/yahooFinance.js';
import { placeAlpacaOrder, syncAlpacaPosition } from '../lib/alpaca.js';
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    logger.info('🔍 Position Monitoring Service Started', { requestId });
    
    // Initialize storage and cleanup ghost positions
    const storageHealth = await storage.healthCheck();
    if (storageHealth.status !== 'healthy') {
      return res.status(500).json({
        success: false,
        error: 'Storage unavailable',
        details: storageHealth
      });
    }

    // Clean up any ghost positions first
    const { cleanupGhosts = false } = req.method === 'GET' ? req.query : req.body;
    if (cleanupGhosts === 'true' || cleanupGhosts === true) {
      logger.info('🧹 Manual ghost position cleanup requested');
      await storage.cleanupAllPositions();
    }

    // Get all current positions (now validated)
    const allPositions = await storage.getAllPositions();
    const positionCount = Object.keys(allPositions).length;
    
    logger.info(`📊 Monitoring ${positionCount} valid positions`);

    if (positionCount === 0) {
      return res.json({
        success: true,
        requestId,
        message: 'No active positions to monitor',
        data: { 
          positionCount: 0, 
          alerts: [],
          cleanupPerformed: cleanupGhosts === 'true' || cleanupGhosts === true
        }
      });
    }

    // Monitor each position
    const monitoringResults = [];
    const alerts = [];
    
    for (const [symbol, position] of Object.entries(allPositions)) {
      try {
        const result = await monitorPosition(symbol, position);
        monitoringResults.push(result);
        
        if (result.alerts) {
          alerts.push(...result.alerts);
        }
        
        // Execute emergency trades if needed (but validate first)
        if (result.urgentAction && result.hasValidPosition) {
          await executeUrgentAction(symbol, result.urgentAction, position);
        } else if (result.urgentAction && !result.hasValidPosition) {
          logger.warn(`🚫 Skipping urgent action for invalid position: ${symbol}`);
        }
        
      } catch (error) {
        logger.error(`❌ Error monitoring ${symbol}`, error);
        monitoringResults.push({
          symbol,
          error: error.message,
          status: 'ERROR'
        });
      }
    }

    // Calculate overall portfolio metrics
    const portfolioMetrics = calculatePortfolioMetrics(monitoringResults);
    
    // Log performance metrics
    await storage.logPerformanceMetrics(portfolioMetrics);

    const duration = Date.now() - startTime;
    
    return res.json({
      success: true,
      requestId,
      durationMs: duration,
      data: {
        positionCount,
        monitoringResults,
        alerts,
        portfolioMetrics,
        timestamp: new Date().toISOString(),
        cleanupPerformed: cleanupGhosts === 'true' || cleanupGhosts === true
      }
    });

  } catch (error) {
    logger.error('💥 Position Monitoring Error', error);
    
    return res.status(500).json({
      success: false,
      requestId,
      error: error.message,
      durationMs: Date.now() - startTime
    });
  }
}

async function monitorPosition(symbol, position) {
  logger.info(`🔍 Monitoring position: ${symbol}`);
  
  try {
    // Get current market data
    const marketData = await getYahooPrice(symbol === alpacaTicker ? yahooTicker : symbol);
    const currentPrice = marketData.price;
    
    // Validate position value
    const positionValue = position.quantity * currentPrice;
    const hasValidPosition = position.quantity >= 0.001 && positionValue >= 10; // $10 minimum
    
    if (!hasValidPosition) {
      logger.warn(`❌ Position below minimum thresholds: ${symbol}`, {
        quantity: position.quantity,
        currentPrice: currentPrice.toFixed(4),
        positionValue: positionValue.toFixed(2),
        minQuantity: 0.001,
        minValue: 10
      });
      
      return {
        symbol,
        status: 'INVALID_POSITION',
        hasValidPosition: false,
        position,
        currentPrice,
        positionValue,
        alerts: [{
          type: 'INVALID_POSITION',
          urgency: 'LOW',
          message: `Position ${symbol} below minimum thresholds - will be cleaned up`,
          action: 'CLEANUP_POSITION'
        }],
        timestamp: new Date().toISOString()
      };
    }
    
    // Calculate P&L
    const pnlAmount = (currentPrice - position.averagePrice) * position.quantity;
    const pnlPercentage = ((currentPrice - position.averagePrice) / position.averagePrice) * 100;
    
    logger.info(`📊 ${symbol} Position Status`, {
      quantity: position.quantity,
      currentPrice: currentPrice.toFixed(4),
      averagePrice: position.averagePrice.toFixed(4),
      positionValue: positionValue.toFixed(2),
      pnl: `${pnlPercentage.toFixed(2)}% ($${pnlAmount.toFixed(2)})`
    });

    // Update high water mark if needed
    const newHighWaterMark = Math.max(position.highWaterMark || position.averagePrice, currentPrice);
    
    // Evaluate position health and alerts
    const positionAnalysis = analyzePositionHealth(symbol, position, currentPrice, pnlPercentage);
    
    // Get technical analysis for additional context
    const historicalData = await getHistoricalData(symbol === alpacaTicker ? yahooTicker : symbol, '1mo');
    const indicators = new TechnicalIndicators();
    const technicals = indicators.calculate(historicalData);
    
    // Make trading decision using the enhanced strategy
    const decision = strategy.analyze(
      {
        ...technicals,
        currentPrice,
        volume: marketData.volume,
        signals: [],
        historical: historicalData
      },
      {
        ...position,
        highWaterMark: newHighWaterMark
      },
      await storage.getLastTrade(symbol)
    );

    // Check if urgent action is needed
    let urgentAction = null;
    
    if (decision.action === 'SELL' && (decision.urgency === 'IMMEDIATE' || decision.urgency === 'CRITICAL')) {
      urgentAction = {
        action: 'SELL',
        quantity: decision.quantity,
        reason: Array.isArray(decision.reasoning) ? decision.reasoning.join(' | ') : decision.reasoning,
        confidence: decision.confidence
      };
    }

    return {
      symbol,
      status: 'MONITORED',
      hasValidPosition: true,
      currentPrice,
      position,
      positionValue,
      pnl: {
        amount: pnlAmount,
        percentage: pnlPercentage
      },
      decision,
      alerts: positionAnalysis.alerts,
      urgentAction,
      technicalIndicators: {
        rsi: technicals.rsi?.[technicals.rsi.length - 1]?.value || null,
        sma20: technicals.sma?.[technicals.sma.length - 1]?.value || null,
        trend: 'NEUTRAL'
      },
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    logger.error(`Error monitoring ${symbol}`, error);
    throw error;
  }
}

function analyzePositionHealth(symbol, position, currentPrice, pnlPercentage) {
  const alerts = [];
  let riskLevel = 'NORMAL';
  
  // Critical stop loss alert (now 2% instead of 1.5%)
  if (pnlPercentage <= -2.0) {
    alerts.push({
      type: 'STOP_LOSS_CRITICAL',
      urgency: 'CRITICAL',
      message: `🚨 CRITICAL: ${symbol} down ${pnlPercentage.toFixed(2)}% - STOP LOSS REQUIRED`,
      action: 'SELL_IMMEDIATELY'
    });
    riskLevel = 'CRITICAL';
  }
  
  // Warning level (now 1.5% instead of 1%)
  else if (pnlPercentage <= -1.5 && pnlPercentage > -2.0) {
    alerts.push({
      type: 'WARNING',
      urgency: 'MEDIUM',
      message: `⚠️ ${symbol} approaching stop loss: ${pnlPercentage.toFixed(2)}% loss`,
      action: 'MONITOR_CLOSELY'
    });
    riskLevel = 'ELEVATED';
  }
  
  // Profit target reached
  if (pnlPercentage >= 3.0) {
    alerts.push({
      type: 'PROFIT_TARGET',
      urgency: 'HIGH',
      message: `🎯 ${symbol} profit target reached: +${pnlPercentage.toFixed(2)}% - Consider taking profits`,
      action: 'CONSIDER_SELL'
    });
  }
  
  // Trailing stop check (now 1% instead of 0.8%)
  if (position.highWaterMark) {
    const trailingStopPrice = position.highWaterMark * 0.99; // 1% trailing stop
    const trailingStopLoss = ((trailingStopPrice - position.averagePrice) / position.averagePrice) * 100;
    
    // Only trigger if we're still in profit territory and would preserve gains
    if (currentPrice <= trailingStopPrice && trailingStopLoss > 0) {
      alerts.push({
        type: 'TRAILING_STOP',
        urgency: 'HIGH',
        message: `📉 ${symbol} trailing stop triggered - Preserving ${trailingStopLoss.toFixed(2)}% gains`,
        action: 'SELL_TRAILING_STOP'
      });
    }
  }

  return { alerts, riskLevel };
}

async function executeUrgentAction(symbol, urgentAction, position) {
  try {
    logger.warn(`🚨 EXECUTING URGENT ACTION: ${symbol}`, {
      action: urgentAction.action,
      quantity: urgentAction.quantity,
      positionValue: (position.quantity * position.averagePrice).toFixed(2)
    });
    
    // Validate we actually have the position before trying to sell
    if (urgentAction.action === 'SELL' && position.quantity < urgentAction.quantity) {
      logger.error(`❌ Cannot sell ${urgentAction.quantity} ${symbol} - only have ${position.quantity}`);
      return;
    }
    
    const orderParams = {
      symbol: alpacaTicker,
      side: urgentAction.action.toLowerCase(),
      qty: Math.min(urgentAction.quantity, position.quantity), // Don't try to sell more than we have
      type: 'market',
      tif: 'gtc',
      confirm: true // Auto-confirm urgent actions
    };
    
    logger.info('📋 Urgent order parameters:', orderParams);
    
    const orderResult = await placeAlpacaOrder(orderParams);
    
    if (orderResult && orderResult.status !== 'simulated') {
      // Log urgent trade
      const tradeData = {
        id: `urgent_${Date.now()}`,
        symbol: alpacaTicker,
        action: urgentAction.action,
        quantity: orderParams.qty,
        price: 0, // Will be filled at market price
        orderId: orderResult.orderId,
        timestamp: new Date().toISOString(),
        reasoning: [`URGENT: ${urgentAction.reason}`]
      };
      
      await storage.updatePosition(alpacaTicker, tradeData);
      
      logger.info('🚨✅ URGENT ACTION EXECUTED SUCCESSFULLY', {
        symbol,
        action: urgentAction.action,
        quantity: orderParams.qty,
        orderId: orderResult.orderId
      });
    } else if (orderResult && orderResult.status === 'simulated') {
      logger.warn('⚠️ Urgent action was simulated (not real trade)', {
        symbol,
        orderResult
      });
    }
    
  } catch (error) {
    logger.error(`❌ Failed to execute urgent action for ${symbol}`, error);
    
    // Check if it's an insufficient balance error
    if (error.message && error.message.includes('insufficient balance')) {
      logger.error(`🚫 INSUFFICIENT BALANCE: Cannot sell ${symbol} - position may not exist in broker account`);
      
      // Mark position for cleanup
      logger.info('🧹 Scheduling ghost position cleanup due to insufficient balance error');
      // The storage cleanup will handle this on next initialization
    }
  }
}

function calculatePortfolioMetrics(monitoringResults) {
  const validResults = monitoringResults.filter(r => !r.error && r.hasValidPosition !== false);
  const totalPositions = validResults.length;
  let totalPnL = 0;
  let totalValue = 0;
  let criticalAlerts = 0;
  let profitablePositions = 0;
  
  for (const result of validResults) {
    if (result.pnl) {
      totalPnL += result.pnl.amount;
      totalValue += result.positionValue || (result.position.quantity * result.position.averagePrice);
      
      if (result.pnl.percentage > 0) {
        profitablePositions++;
      }
    }
    
    if (result.alerts) {
      criticalAlerts += result.alerts.filter(alert => alert.urgency === 'CRITICAL').length;
    }
  }
  
  const portfolioPnLPercentage = totalValue > 0 ? (totalPnL / totalValue) * 100 : 0;
  const winRate = totalPositions > 0 ? (profitablePositions / totalPositions) * 100 : 0;
  
  return {
    totalPositions,
    totalPnL: parseFloat(totalPnL.toFixed(2)),
    portfolioPnLPercentage: parseFloat(portfolioPnLPercentage.toFixed(2)),
    winRate: parseFloat(winRate.toFixed(1)),
    criticalAlerts,
    totalValue: parseFloat(totalValue.toFixed(2)),
    profitablePositions,
    timestamp: new Date().toISOString()
  };
}

// Export monitoring utilities for testing
export { monitorPosition, analyzePositionHealth, executeUrgentAction, calculatePortfolioMetrics };