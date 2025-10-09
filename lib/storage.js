// lib/storage.js - Fixed Google Sheets storage with position cleanup
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
    
    // Minimum position thresholds
    this.MIN_POSITION_VALUE = 10; // $10 minimum
    this.MIN_POSITION_QUANTITY = 0.001; // Minimum 0.001 ETH
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
      
      // Clean up ghost positions on startup
      await this._cleanupGhostPositions();
      
      this.isInitialized = true;
      logger.info('✅ Enhanced Google Sheets storage service ready');
      
    } catch (error) {
      logger.error('❌ Google Sheets initialization failed', error);
      throw error;
    }
  }

  async _ensureAllSheetsExist() {
    const requiredSheets = [
      { name: this.positionSheet, headers: ['Symbol', 'Quantity', 'Average Price', 'High Water Mark', 'Last Updated', 'Alert Level', 'Position Value'] },
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

  // Clean up ghost positions (positions with tiny or zero values)
  async _cleanupGhostPositions() {
    try {
      logger.info('🧹 Cleaning up ghost positions...');
      
      const { data } = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.positionSheet}!A2:G`
      });

      if (!data.values) {
        logger.info('No positions to clean up');
        return;
      }

      const validPositions = [];
      let removedCount = 0;

      for (const row of data.values) {
        const [symbol, quantity, avgPrice, highWater, lastUpdated, alertLevel, posValue] = row;
        const qty = parseFloat(quantity) || 0;
        const price = parseFloat(avgPrice) || 0;
        const currentValue = qty * price;

        // Keep position if it meets minimum thresholds
        if (qty >= this.MIN_POSITION_QUANTITY && currentValue >= this.MIN_POSITION_VALUE) {
          validPositions.push(row);
          logger.info(`✅ Keeping valid position: ${symbol} - ${qty} @ $${price.toFixed(4)} (Value: $${currentValue.toFixed(2)})`);
        } else {
          removedCount++;
          logger.warn(`🗑️ Removing ghost position: ${symbol} - ${qty} @ $${price.toFixed(4)} (Value: $${currentValue.toFixed(2)})`);
        }
      }

      if (removedCount > 0) {
        // Clear the sheet and rewrite with valid positions only
        await this.sheets.spreadsheets.values.clear({
          spreadsheetId: this.spreadsheetId,
          range: `${this.positionSheet}!A2:G`
        });

        if (validPositions.length > 0) {
          await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: `${this.positionSheet}!A2:G${validPositions.length + 1}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: validPositions }
          });
        }

        logger.info(`🧹 Cleanup complete: Removed ${removedCount} ghost positions, kept ${validPositions.length} valid positions`);
      } else {
        logger.info('✅ No ghost positions found - all positions are valid');
      }
    } catch (error) {
      logger.error('Error cleaning up ghost positions', error);
    }
  }

  // Enhanced position retrieval with validation
  async getCurrentPosition(symbol) {
    try {
      await this.initialize();
      
      const { data } = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.positionSheet}!A2:G`
      });

      if (!data.values) return null;

      for (const row of data.values) {
        if (row[0] === symbol) {
          const quantity = parseFloat(row[1]) || 0;
          const averagePrice = parseFloat(row[2]) || 0;
          const positionValue = quantity * averagePrice;

          // Validate position meets minimum thresholds
          if (quantity >= this.MIN_POSITION_QUANTITY && positionValue >= this.MIN_POSITION_VALUE) {
            const position = {
              symbol,
              quantity,
              averagePrice,
              highWaterMark: parseFloat(row[3]) || averagePrice,
              lastUpdated: row[4] || new Date().toISOString(),
              alertLevel: row[5] || 'NORMAL',
              positionValue
            };
            
            logger.info(`📊 Valid position found: ${symbol}`, {
              quantity,
              averagePrice: averagePrice.toFixed(4),
              positionValue: positionValue.toFixed(2)
            });
            
            this.positionCache.set(symbol, position);
            return position;
          } else {
            logger.warn(`❌ Invalid position detected: ${symbol}`, {
              quantity,
              averagePrice: averagePrice.toFixed(4),
              positionValue: positionValue.toFixed(2),
              minQuantity: this.MIN_POSITION_QUANTITY,
              minValue: this.MIN_POSITION_VALUE
            });
            
            // Remove invalid position
            await this._removeInvalidPosition(symbol);
            return null;
          }
        }
      }
      
      return null;
    } catch (error) {
      logger.error(`Error getting position for ${symbol}`, error);
      return null;
    }
  }

  // Remove invalid positions
  async _removeInvalidPosition(symbol) {
    try {
      logger.info(`🗑️ Removing invalid position: ${symbol}`);
      
      const { data } = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.positionSheet}!A2:G`
      });

      const rows = data.values || [];
      const filteredRows = rows.filter(row => row[0] !== symbol);

      if (filteredRows.length !== rows.length) {
        await this.sheets.spreadsheets.values.clear({
          spreadsheetId: this.spreadsheetId,
          range: `${this.positionSheet}!A2:G`
        });

        if (filteredRows.length > 0) {
          await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: `${this.positionSheet}!A2:G${filteredRows.length + 1}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: filteredRows }
          });
        }

        logger.info(`✅ Successfully removed invalid position: ${symbol}`);
      }
    } catch (error) {
      logger.error(`Error removing invalid position ${symbol}`, error);
    }
  }

  // Enhanced position update with validation
  async updatePosition(symbol, tradeResult) {
    try {
      await this.initialize();
      
      logger.info('📝 Enhanced position update with validation', {
        symbol,
        action: tradeResult.action,
        quantity: tradeResult.quantity,
        price: tradeResult.price
      });

      // Log the trade first
      await this._logEnhancedTrade(symbol, tradeResult);
      
      // Update position with validation
      await this._updateEnhancedPosition(symbol, tradeResult);
      
      // Clean up any invalid positions that might have been created
      const updatedPosition = await this.getCurrentPosition(symbol);
      if (!updatedPosition && tradeResult.action === 'BUY') {
        logger.warn('Position validation failed after BUY trade - investigating');
      }
      
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
      range: `${this.positionSheet}!A2:G`
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
          const newPositionValue = newQty * newAvg;

          // Only add if position meets minimum requirements
          if (newQty >= this.MIN_POSITION_QUANTITY && newPositionValue >= this.MIN_POSITION_VALUE) {
            updatedRows.push([
              symbol, 
              newQty, 
              newAvg.toFixed(4), 
              newHighWater.toFixed(4),
              new Date().toISOString(),
              'MONITORING',
              newPositionValue.toFixed(2)
            ]);
            
            logger.info(`✅ Updated position: ${symbol}`, {
              quantity: newQty,
              averagePrice: newAvg.toFixed(4),
              positionValue: newPositionValue.toFixed(2)
            });
          } else {
            logger.warn(`❌ BUY resulted in position below minimum thresholds: ${symbol}`, {
              newQty,
              newPositionValue: newPositionValue.toFixed(2),
              minQuantity: this.MIN_POSITION_QUANTITY,
              minValue: this.MIN_POSITION_VALUE
            });
          }
          
        } else if (tradeResult.action === 'SELL') {
          const prevQty = parseFloat(row[1]) || 0;
          const remaining = Math.max(0, prevQty - tradeResult.quantity);
          const avgPrice = parseFloat(row[2]) || 0;
          const remainingValue = remaining * avgPrice;

          // Only keep position if it still meets minimum requirements
          if (remaining >= this.MIN_POSITION_QUANTITY && remainingValue >= this.MIN_POSITION_VALUE) {
            updatedRows.push([
              symbol, 
              remaining, 
              avgPrice, 
              parseFloat(row[3]) || avgPrice,
              new Date().toISOString(),
              'MONITORING',
              remainingValue.toFixed(2)
            ]);
            
            logger.info(`✅ Reduced position: ${symbol}`, {
              remainingQuantity: remaining,
              remainingValue: remainingValue.toFixed(2)
            });
          } else {
            logger.info(`✅ Position fully closed or below minimum: ${symbol}`, {
              remainingQuantity: remaining,
              remainingValue: remainingValue.toFixed(2)
            });
            // Position is removed (not added to updatedRows)
          }
        }
      } else {
        updatedRows.push(row);
      }
    }

    // Add new position for BUY if not found and meets requirements
    if (!found && tradeResult.action === 'BUY') {
      const positionValue = tradeResult.quantity * tradeResult.price;
      
      if (tradeResult.quantity >= this.MIN_POSITION_QUANTITY && positionValue >= this.MIN_POSITION_VALUE) {
        updatedRows.push([
          symbol, 
          tradeResult.quantity, 
          tradeResult.price, 
          tradeResult.price,
          new Date().toISOString(),
          'MONITORING',
          positionValue.toFixed(2)
        ]);
        
        logger.info(`✅ New position created: ${symbol}`, {
          quantity: tradeResult.quantity,
          price: tradeResult.price,
          positionValue: positionValue.toFixed(2)
        });
      } else {
        logger.warn(`❌ New BUY position below minimum thresholds: ${symbol}`, {
          quantity: tradeResult.quantity,
          positionValue: positionValue.toFixed(2)
        });
      }
    }

    // Update the sheet
    await this.sheets.spreadsheets.values.clear({
      spreadsheetId: this.spreadsheetId,
      range: `${this.positionSheet}!A2:G`
    });

    if (updatedRows.length > 0) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.positionSheet}!A2:G${updatedRows.length + 1}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: updatedRows }
      });
    }

    logger.info(`📊 Position sheet updated: ${updatedRows.length} valid positions remaining`);
  }

  // Get all valid positions
  async getAllPositions() {
    try {
      await this.initialize();
      
      const { data } = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.positionSheet}!A2:G`
      });

      const positions = {};
      
      (data.values || []).forEach(([sym, qty, avg, highWater, updated, alertLevel, posValue]) => {
        const quantity = parseFloat(qty) || 0;
        const averagePrice = parseFloat(avg) || 0;
        const positionValue = quantity * averagePrice;
        
        // Only include positions that meet minimum thresholds
        if (sym && quantity >= this.MIN_POSITION_QUANTITY && positionValue >= this.MIN_POSITION_VALUE) {
          positions[sym] = {
            symbol: sym,
            quantity,
            averagePrice,
            highWaterMark: parseFloat(highWater) || averagePrice,
            lastUpdated: updated,
            alertLevel: alertLevel || 'NORMAL',
            positionValue
          };
        }
      });

      logger.info(`📊 Retrieved ${Object.keys(positions).length} valid positions`);
      return positions;
    } catch (error) {
      logger.error('Error getting all positions', error);
      return {};
    }
  }

  // Manual position cleanup function
  async cleanupAllPositions() {
    try {
      logger.info('🧹 Manual cleanup of all positions initiated');
      await this._cleanupGhostPositions();
      return { success: true, message: 'Position cleanup completed' };
    } catch (error) {
      logger.error('Manual cleanup failed', error);
      return { success: false, error: error.message };
    }
  }

  // Rest of the methods remain the same...
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

  async logPerformanceMetrics(metrics) {
    try {
      const performanceRow = [
        new Date().toISOString().split('T')[0],
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
          'Ghost Position Cleanup',
          'Position Validation',
          'Alert System',
          'Performance Tracking'
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