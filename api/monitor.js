// api/monitor.js - Continuous Position Monitoring Service
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
    
    // Initialize storage
    const storageHealth = await storage.healthCheck();
    if (storageHealth.status !== 'healthy') {
      return res.status(500).json({
        success: false,
        error: 'Storage unavailable',
        details: storageHealth
      });
    }

    // Get all current positions
    const allPositions = await storage.getAllPositions();
    const positionCount = Object.keys(allPositions).length;
    
    logger.info(`📊 Monitoring ${positionCount} active positions`);

    if (positionCount === 0) {
      return res.json({
        success: true,
        requestId,
        message: 'No active positions to monitor',
        data: { positionCount: 0, alerts: [] }
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
        
        // Execute emergency trades if needed
        if (result.urgentAction) {
          await executeUrgentAction(symbol, result.urgentAction);
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
        timestamp: new Date().toISOString()
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
    
    // Calculate P&L
    const pnlAmount = (currentPrice - position.averagePrice) * position.quantity;
    const pnlPercentage = ((currentPrice - position.averagePrice) / position.averagePrice) * 100;
    
    logger.info(`📊 ${symbol} Position Status`, {
      currentPrice: currentPrice.toFixed(4),
      averagePrice: position.averagePrice.toFixed(4),
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
    
    // Make trading decision
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
      currentPrice,
      position,
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
  
  // Critical stop loss alert
  if (pnlPercentage <= -1.5) {
    alerts.push({
      type: 'STOP_LOSS_CRITICAL',
      urgency: 'CRITICAL',
      message: `🚨 CRITICAL: ${symbol} down ${pnlPercentage.toFixed(2)}% - IMMEDIATE SELL REQUIRED`,
      action: 'SELL_IMMEDIATELY'
    });
    riskLevel = 'CRITICAL';
  }
  
  // Profit target reached
  if (pnlPercentage >= 3) {
    alerts.push({
      type: 'PROFIT_TARGET',
      urgency: 'HIGH',
      message: `🎯 ${symbol} profit target reached: +${pnlPercentage.toFixed(2)}% - Consider taking profits`,
      action: 'CONSIDER_SELL'
    });
  }
  
  // Trailing stop check
  if (position.highWaterMark) {
    const trailingStopPrice = position.highWaterMark * 0.992; // 0.8% trailing stop
    if (currentPrice <= trailingStopPrice) {
      alerts.push({
        type: 'TRAILING_STOP',
        urgency: 'HIGH',
        message: `📉 ${symbol} trailing stop triggered - Price fell below $${trailingStopPrice.toFixed(4)}`,
        action: 'SELL_TRAILING_STOP'
      });
    }
  }
  
  // Warning levels
  if (pnlPercentage <= -1.0 && pnlPercentage > -1.5) {
    alerts.push({
      type: 'WARNING',
      urgency: 'MEDIUM',
      message: `⚠️ ${symbol} approaching stop loss: ${pnlPercentage.toFixed(2)}% loss`,
      action: 'MONITOR_CLOSELY'
    });
    riskLevel = 'ELEVATED';
  }

  return { alerts, riskLevel };
}

async function executeUrgentAction(symbol, urgentAction) {
  try {
    logger.warn(`🚨 EXECUTING URGENT ACTION: ${symbol}`, urgentAction);
    
    const orderParams = {
      symbol: alpacaTicker,
      side: urgentAction.action.toLowerCase(),
      qty: urgentAction.quantity,
      type: 'market',
      tif: 'gtc',
      confirm: true // Auto-confirm urgent actions
    };
    
    const orderResult = await placeAlpacaOrder(orderParams);
    
    if (orderResult && orderResult.status !== 'simulated') {
      // Log urgent trade
      const tradeData = {
        id: `urgent_${Date.now()}`,
        symbol: alpacaTicker,
        action: urgentAction.action,
        quantity: urgentAction.quantity,
        price: 0, // Will be filled at market price
        orderId: orderResult.orderId,
        timestamp: new Date().toISOString(),
        reasoning: [`URGENT: ${urgentAction.reason}`]
      };
      
      await storage.updatePosition(alpacaTicker, tradeData);
      
      logger.info('🚨✅ URGENT ACTION EXECUTED SUCCESSFULLY', {
        symbol,
        action: urgentAction.action,
        orderId: orderResult.orderId
      });
    }
    
  } catch (error) {
    logger.error(`❌ Failed to execute urgent action for ${symbol}`, error);
    
    // Log the failure for manual intervention
    try {
      const alertRow = [
        new Date().toISOString(),
        symbol,
        'URGENT_ACTION_FAILED',
        `MANUAL INTERVENTION REQUIRED: Failed to execute ${urgentAction.action} - ${error.message}`,
        0,
        0
      ];
      
      // Log to alerts sheet if storage is available
      await storage._logAlert(symbol, {
        type: 'URGENT_ACTION_FAILED',
        message: `MANUAL INTERVENTION REQUIRED: Failed to execute ${urgentAction.action} - ${error.message}`,
        urgency: 'CRITICAL'
      }, 0, 0);
      
    } catch (logError) {
      logger.error('Failed to log urgent action failure', logError);
    }
  }
}

function calculatePortfolioMetrics(monitoringResults) {
  const totalPositions = monitoringResults.filter(r => !r.error).length;
  let totalPnL = 0;
  let totalValue = 0;
  let criticalAlerts = 0;
  let profitablePositions = 0;
  
  for (const result of monitoringResults) {
    if (result.pnl && !result.error) {
      totalPnL += result.pnl.amount;
      totalValue += result.position.quantity * result.position.averagePrice;
      
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