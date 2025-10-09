// lib/storage.js - Enhanced Google Sheets storage with active position monitoring
import { google } from 'googleapis';
import logger from './logger.js';

class EnhancedStorageService {
  constructor() {
    this.isInitialized = false;
    this.initializationPromise = null;
    this.sheets = null;
    this.spreadsheetId = null;
    this.positionSheet = 'Positions';
    this.tradesSheet = 'Trades';
    this.alertsSheet = 'Alerts';
    this.performanceSheet = 'Performance';
    
    // Position monitoring
    this.positionCache = new Map();
    this.highWaterMarks = new Map();
    this.alertsSent = new Set();
  }

  async initialize() {
    if (this.isInitialized) return;
    if (this.initializationPromise) return this.initializationPromise;
    
    this.initializationPromise = this._performInitialization();
    return this.initializationPromise;
  }

  async _performInitialization() {
    try {
      logger.info('🔧 Initializing Enhanced Google Sheets storage service...');
      
      // Validate environment variables
      const requiredVars = ['GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY', 'GOOGLE_SPREADSHEET_ID'];
      const missing = requiredVars.filter(v => !process.env[v]);
      
      if (missing.length > 0) {
        throw new Error(`Missing Google Sheets environment variables: ${missing.join(', ')}`);
      }

      // Enhanced private key processing
      let privateKey = process.env.GOOGLE_PRIVATE_KEY;
      
      logger.info('🔑 Processing private key...', {
        hasKey: !!privateKey,
        keyLength: privateKey?.length || 0,
        startsWithBegin: privateKey?.startsWith('-----BEGIN'),
        hasNewlines: privateKey?.includes('\\n'),
        hasActualNewlines: privateKey?.includes('\n')
      });

      if (privateKey) {
        privateKey = privateKey.replace(/^["']|["']$/g, '');
        privateKey = privateKey.replace(/\\\\n/g, '\n');
        
        if (!privateKey.startsWith('-----BEGIN PRIVATE KEY-----')) {
          if (!privateKey.includes('-----BEGIN')) {
            privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
          }
        }
        
        privateKey = privateKey.replace(/\n\n+/g, '\n');
      }

      // Set up authentication
      let auth;
      try {
        auth = new google.auth.JWT({
          email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          key: privateKey,
          scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
      } catch (jwtError) {
        auth = new google.auth.JWT(
          process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          null,
          privateKey,
          ['https://www.googleapis.com/auth/spreadsheets']
        );
      }

      await auth.authorize();
      this.sheets = google.sheets({ version: 'v4', auth });
      this.spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

      // Ensure required sheets exist
      await this._ensureAllSheetsExist();
      
      this.isInitialized = true;
      logger.info('✅ Enhanced Google Sheets storage service ready');
      
    } catch (error) {
      logger.error('❌ Google Sheets initialization failed', error);
      throw error;
    }
  }

  async _ensureAllSheetsExist() {
    const requiredSheets = [
      { name: this.positionSheet, headers: ['Symbol', 'Quantity', 'Average Price', 'High Water Mark', 'Last Updated', 'Alert Level'] },
      { name: this.tradesSheet, headers: ['ID', 'Timestamp', 'Symbol', 'Action', 'Quantity', 'Price', 'PnL', 'Order ID', 'Strategy Reason'] },
      { name: this.alertsSheet, headers: ['Timestamp', 'Symbol', 'Alert Type', 'Message', 'Price', 'P&L %'] },
      { name: this.performanceSheet, headers: ['Date', 'Total P&L', 'Trade Count', 'Win Rate', 'Max Drawdown', 'Sharpe Ratio'] }
    ];

    try {
      const { data: spreadsheet } = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId
      });
      
      const existingSheets = spreadsheet.sheets.map(s => s.properties.title);

      for (const sheet of requiredSheets) {
        if (!existingSheets.includes(sheet.name)) {
          logger.info(`📝 Creating missing sheet: ${sheet.name}`);
          await this._createSheet(sheet.name, sheet.headers);
        }
      }
    } catch (error) {
      logger.error('Error ensuring sheets exist', error);
      throw error;
    }
  }

  async _createSheet(sheetName, headers) {
    try {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: { title: sheetName }
            }
          }]
        }
      });

      if (headers.length > 0) {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${sheetName}!A1:${String.fromCharCode(64 + headers.length)}1`,
          valueInputOption: 'USER_ENTERED',
          resource: { values: [headers] }
        });
      }

      logger.info(`✅ Created sheet: ${sheetName} with headers`);
    } catch (error) {
      logger.error(`Error creating sheet ${sheetName}`, error);
      throw error;
    }
  }

  // Enhanced position management with monitoring
  async getCurrentPosition(symbol) {
    try {
      await this.initialize();
      
      const { data } = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.positionSheet}!A2:F`
      });

      if (!data.values) return null;

      for (const row of data.values) {
        if (row[0] === symbol && parseFloat(row[1]) > 0) {
          const position = {
            symbol,
            quantity: parseFloat(row[1]),
            averagePrice: parseFloat(row[2]),
            highWaterMark: parseFloat(row[3]) || parseFloat(row[2]),
            lastUpdated: row[4] || new Date().toISOString(),
            alertLevel: row[5] || 'NORMAL'
          };
          
          // Cache for monitoring
          this.positionCache.set(symbol, position);
          return position;
        }
      }
      
      return null;
    } catch (error) {
      logger.error(`Error getting position for ${symbol}`, error);
      return null;
    }
  }

  // Enhanced position update with monitoring
  async updatePosition(symbol, tradeResult) {
    try {
      await this.initialize();
      
      logger.info('📝 Enhanced position update with monitoring', {
        symbol,
        action: tradeResult.action,
        quantity: tradeResult.quantity
      });

      // Log the trade with strategy reasoning
      await this._logEnhancedTrade(symbol, tradeResult);
      
      // Update position with monitoring
      await this._updateEnhancedPosition(symbol, tradeResult);
      
      // Check for alerts after position update
      await this._checkPositionAlerts(symbol);
      
      logger.info('✅ Enhanced position update completed');
      
    } catch (error) {
      logger.error('❌ Failed to update enhanced position', error);
      throw error;
    }
  }

  async _logEnhancedTrade(symbol, tradeResult) {
    const tradeRow = [
      tradeResult.id || `trade_${Date.now()}`,
      tradeResult.timestamp || new Date().toISOString(),
      symbol,
      tradeResult.action,
      tradeResult.quantity,
      tradeResult.price,
      tradeResult.pnl || '',
      tradeResult.orderId || '',
      Array.isArray(tradeResult.reasoning) ? tradeResult.reasoning.join(' | ') : (tradeResult.reasoning || '')
    ];

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${this.tradesSheet}!A:I`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [tradeRow] }
    });

    logger.info('✅ Enhanced trade logged', { tradeId: tradeRow[0] });
  }

  async _updateEnhancedPosition(symbol, tradeResult) {
    const { data } = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.positionSheet}!A2:F`
    });

    const rows = data.values || [];
    let found = false;
    let updatedRows = [];

    for (const row of rows) {
      if (row[0] === symbol) {
        found = true;
        
        if (tradeResult.action === 'BUY') {
          const prevQty = parseFloat(row[1]) || 0;
          const prevAvg = parseFloat(row[2]) || 0;
          const prevHighWater = parseFloat(row[3]) || 0;
          
          const newQty = prevQty + tradeResult.quantity;
          const newAvg = newQty > 0 ? 
            ((prevQty * prevAvg) + (tradeResult.quantity * tradeResult.price)) / newQty : 0;
          const newHighWater = Math.max(prevHighWater, tradeResult.price);

          updatedRows.push([
            symbol, 
            newQty, 
            newAvg.toFixed(4), 
            newHighWater.toFixed(4),
            new Date().toISOString(),
            'MONITORING'
          ]);
          
        } else if (tradeResult.action === 'SELL') {
          const prevQty = parseFloat(row[1]) || 0;
          const remaining = Math.max(0, prevQty - tradeResult.quantity);

          if (remaining > 0) {
            updatedRows.push([
              symbol, 
              remaining, 
              parseFloat(row[2]), 
              parseFloat(row[3]) || parseFloat(row[2]),
              new Date().toISOString(),
              'MONITORING'
            ]);
          }
        }
      } else {
        updatedRows.push(row);
      }
    }

    // Add new position for BUY if not found
    if (!found && tradeResult.action === 'BUY') {
      updatedRows.push([
        symbol, 
        tradeResult.quantity, 
        tradeResult.price, 
        tradeResult.price,
        new Date().toISOString(),
        'MONITORING'
      ]);
    }

    // Update the sheet
    if (updatedRows.length > 0) {
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: this.spreadsheetId,
        range: `${this.positionSheet}!A2:F`
      });

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.positionSheet}!A2:F${updatedRows.length + 1}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: updatedRows }
      });
    }
  }

  // Active position monitoring with alerts
  async _checkPositionAlerts(symbol) {
    try {
      const position = await this.getCurrentPosition(symbol);
      if (!position) return;

      // Note: In a real implementation, you'd fetch current market price here
      // For now, we'll use the average price as placeholder
      const currentPrice = position.averagePrice; // This should be current market price
      
      const pnlPct = ((currentPrice - position.averagePrice) / position.averagePrice) * 100;
      const alerts = [];

      // Stop loss alert
      if (pnlPct <= -1.5) {
        alerts.push({
          type: 'STOP_LOSS_ALERT',
          message: `URGENT: Position down ${pnlPct.toFixed(2)}% - Consider stop loss`,
          urgency: 'HIGH'
        });
      }

      // Profit target alert
      if (pnlPct >= 3) {
        alerts.push({
          type: 'PROFIT_TARGET_ALERT',
          message: `Position up ${pnlPct.toFixed(2)}% - Consider taking profits`,
          urgency: 'MEDIUM'
        });
      }

      // Log alerts
      for (const alert of alerts) {
        await this._logAlert(symbol, alert, currentPrice, pnlPct);
      }

    } catch (error) {
      logger.error('Error checking position alerts', error);
    }
  }

  async _logAlert(symbol, alert, price, pnlPct) {
    const alertKey = `${symbol}_${alert.type}_${Math.floor(Date.now() / 60000)}`; // Per minute
    
    if (this.alertsSent.has(alertKey)) return; // Don't spam alerts
    
    const alertRow = [
      new Date().toISOString(),
      symbol,
      alert.type,
      alert.message,
      price.toFixed(4),
      pnlPct.toFixed(2)
    ];

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${this.alertsSheet}!A:F`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [alertRow] }
    });

    this.alertsSent.add(alertKey);
    logger.warn(`🚨 ALERT: ${alert.message}`, { symbol, price, pnlPct });
  }

  // Monitor all positions actively
  async monitorAllPositions(currentPrices = {}) {
    try {
      const positions = await this.getAllPositions();
      const alerts = [];

      for (const [symbol, position] of Object.entries(positions)) {
        const currentPrice = currentPrices[symbol] || position.averagePrice;
        const pnlPct = ((currentPrice - position.averagePrice) / position.averagePrice) * 100;

        // Update high water mark
        if (currentPrice > position.highWaterMark) {
          await this._updateHighWaterMark(symbol, currentPrice);
        }

        // Check for alerts
        const positionAlerts = this._evaluatePositionAlerts(symbol, position, currentPrice, pnlPct);
        alerts.push(...positionAlerts);
      }

      return alerts;
    } catch (error) {
      logger.error('Error monitoring positions', error);
      return [];
    }
  }

  _evaluatePositionAlerts(symbol, position, currentPrice, pnlPct) {
    const alerts = [];

    // Critical alerts
    if (pnlPct <= -1.5) {
      alerts.push({
        symbol,
        type: 'STOP_LOSS_CRITICAL',
        urgency: 'CRITICAL',
        message: `IMMEDIATE ACTION REQUIRED: ${symbol} down ${pnlPct.toFixed(2)}%`,
        recommendedAction: 'SELL_IMMEDIATELY'
      });
    }

    // Profit taking alerts
    if (pnlPct >= 3) {
      alerts.push({
        symbol,
        type: 'PROFIT_TARGET_REACHED',
        urgency: 'HIGH',
        message: `${symbol} reached profit target: +${pnlPct.toFixed(2)}%`,
        recommendedAction: 'CONSIDER_PROFIT_TAKING'
      });
    }

    // Trailing stop alerts
    const trailingStopPct = 0.8; // 0.8% trailing stop
    const trailingStopPrice = position.highWaterMark * (1 - trailingStopPct / 100);
    
    if (currentPrice <= trailingStopPrice) {
      alerts.push({
        symbol,
        type: 'TRAILING_STOP_TRIGGERED',
        urgency: 'HIGH',
        message: `${symbol} trailing stop triggered at $${currentPrice.toFixed(4)}`,
        recommendedAction: 'SELL_TRAILING_STOP'
      });
    }

    return alerts;
  }

  async _updateHighWaterMark(symbol, newHighPrice) {
    try {
      this.highWaterMarks.set(symbol, newHighPrice);
      // Update in spreadsheet as well
      const { data } = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.positionSheet}!A2:F`
      });

      const rows = data.values || [];
      let updatedRows = [];

      for (const row of rows) {
        if (row[0] === symbol) {
          row[3] = newHighPrice.toFixed(4); // Update high water mark
          row[4] = new Date().toISOString(); // Update timestamp
        }
        updatedRows.push(row);
      }

      if (updatedRows.length > 0) {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${this.positionSheet}!A2:F${updatedRows.length + 1}`,
          valueInputOption: 'USER_ENTERED',
          resource: { values: updatedRows }
        });
      }
    } catch (error) {
      logger.error(`Error updating high water mark for ${symbol}`, error);
    }
  }

  // Enhanced performance tracking
  async logPerformanceMetrics(metrics) {
    try {
      const performanceRow = [
        new Date().toISOString().split('T')[0], // Date only
        metrics.totalPnL || 0,
        metrics.tradeCount || 0,
        metrics.winRate || 0,
        metrics.maxDrawdown || 0,
        metrics.sharpeRatio || 0
      ];

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${this.performanceSheet}!A:F`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [performanceRow] }
      });

      logger.info('📊 Performance metrics logged', metrics);
    } catch (error) {
      logger.error('Error logging performance metrics', error);
    }
  }

  // Keep existing methods...
  async getAllPositions() {
    try {
      await this.initialize();
      
      const { data } = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.positionSheet}!A2:F`
      });

      const positions = {};
      (data.values || []).forEach(([sym, qty, avg, highWater, updated, alertLevel]) => {
        if (sym && parseFloat(qty) > 0) {
          positions[sym] = {
            symbol: sym,
            quantity: parseFloat(qty),
            averagePrice: parseFloat(avg),
            highWaterMark: parseFloat(highWater) || parseFloat(avg),
            lastUpdated: updated,
            alertLevel: alertLevel || 'NORMAL'
          };
        }
      });

      return positions;
    } catch (error) {
      logger.error('Error getting all positions', error);
      return {};
    }
  }

  async getLastTrade(symbol) {
    try {
      const trades = await this.getTradeHistory(10);
      return trades.find(trade => trade.symbol === symbol) || null;
    } catch (error) {
      logger.error(`Error getting last trade for ${symbol}`, error);
      return null;
    }
  }

  async getTradeHistory(limit = 50) {
    try {
      await this.initialize();
      
      const { data } = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.tradesSheet}!A2:I`
      });

      if (!data.values) return [];

      const trades = data.values.map(row => ({
        id: row[0],
        timestamp: row[1],
        symbol: row[2],
        action: row[3],
        quantity: parseFloat(row[4]) || 0,
        price: parseFloat(row[5]) || 0,
        pnl: row[6] ? parseFloat(row[6]) : null,
        orderId: row[7],
        reasoning: row[8] || ''
      }));

      return trades.slice(-limit).reverse();
    } catch (error) {
      logger.error('Error getting trade history', error);
      return [];
    }
  }

  async isInCooldown() {
    try {
      const trades = await this.getTradeHistory(1);
      if (!trades.length) return false;

      const lastTrade = trades[0];
      const cooldownMinutes = parseInt(process.env.COOLDOWN_MINUTES) || 5;
      const cooldownEnd = new Date(new Date(lastTrade.timestamp).getTime() + (cooldownMinutes * 60000));

      return new Date() < cooldownEnd;
    } catch (error) {
      logger.error('Error checking cooldown', error);
      return false;
    }
  }

  async healthCheck() {
    try {
      await this.initialize();
      
      const { data } = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId
      });

      return {
        status: 'healthy',
        spreadsheetTitle: data.properties.title,
        sheetsCount: data.sheets.length,
        lastChecked: new Date().toISOString(),
        enhancedFeatures: [
          'Active Position Monitoring',
          'Alert System',
          'Performance Tracking',
          'High Water Mark Tracking'
        ]
      };
    } catch (error) {
      logger.error('❌ Enhanced storage health check failed', error);
      
      return {
        status: 'unhealthy',
        error: error.message,
        lastChecked: new Date().toISOString()
      };
    }
  }
}

export default new EnhancedStorageService();