// lib/storage.js – Fixed Google Sheets storage with proper error handling
import { google } from 'googleapis';
import logger from './logger.js';

class StorageService {
  constructor() {
    this.isInitialized = false;
    this.initializationPromise = null;
    this.sheets = null;
    this.spreadsheetId = null;
    this.positionSheet = 'Positions';
    this.tradesSheet = 'Trades';
  }

  async initialize() {
    if (this.isInitialized) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = this._performInitialization();
    return this.initializationPromise;
  }

  async _performInitialization() {
    try {
      logger.info('🔧 Initializing Google Sheets storage service...');

      // Validate environment variables
      const requiredVars = ['GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY', 'GOOGLE_SPREADSHEET_ID'];
      const missing = requiredVars.filter(v => !process.env[v]);
      
      if (missing.length > 0) {
        throw new Error(`Missing Google Sheets environment variables: ${missing.join(', ')}`);
      }

      // Set up authentication
      const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
      
      const auth = new google.auth.JWT({
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: privateKey,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });

      await auth.authorize();
      logger.info('✅ Google Sheets JWT authentication successful');

      this.sheets = google.sheets({ version: 'v4', auth });
      this.spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

      // Verify access and create sheets if needed
      await this._ensureSheetsExist();
      
      this.isInitialized = true;
      logger.info('✅ Google Sheets storage service ready', {
        spreadsheetId: this.spreadsheetId
      });

    } catch (error) {
      logger.error('❌ Google Sheets initialization failed', error);
      throw error;
    }
  }

  async _ensureSheetsExist() {
    try {
      const { data: spreadsheet } = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId
      });

      const existingSheets = spreadsheet.sheets.map(s => s.properties.title);
      const requiredSheets = [this.positionSheet, this.tradesSheet];

      for (const sheetName of requiredSheets) {
        if (!existingSheets.includes(sheetName)) {
          await this._createSheet(sheetName);
        }
      }
    } catch (error) {
      logger.error('Error ensuring sheets exist', error);
      throw error;
    }
  }

  async _createSheet(sheetName) {
    try {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: sheetName
              }
            }
          }]
        }
      });

      // Add headers
      let headers = [];
      if (sheetName === this.positionSheet) {
        headers = ['Symbol', 'Quantity', 'Average Price', 'Last Updated'];
      } else if (sheetName === this.tradesSheet) {
        headers = ['ID', 'Timestamp', 'Symbol', 'Action', 'Quantity', 'Price', 'PnL', 'Order ID'];
      }

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

  async getCurrentPosition(symbol) {
    try {
      await this.initialize();
      
      const { data } = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.positionSheet}!A2:D`
      });

      if (!data.values) return null;

      for (const row of data.values) {
        if (row[0] === symbol && parseFloat(row[1]) > 0) {
          return {
            symbol,
            quantity: parseFloat(row[1]),
            averagePrice: parseFloat(row[2]),
            lastUpdated: row[3] || new Date().toISOString()
          };
        }
      }
      return null;
    } catch (error) {
      logger.error(`Error getting position for ${symbol}`, error);
      return null;
    }
  }

  async updatePosition(symbol, tradeResult) {
    try {
      await this.initialize();
      
      logger.info('📝 Logging trade to Google Sheets', {
        symbol,
        action: tradeResult.action,
        quantity: tradeResult.quantity
      });

      // 1. Log the trade
      await this._logTrade(symbol, tradeResult);
      
      // 2. Update position
      await this._updatePosition(symbol, tradeResult);
      
      logger.info('✅ Trade logged and position updated successfully');
      
    } catch (error) {
      logger.error('❌ Failed to update Google Sheets', error);
      throw error;
    }
  }

  async _logTrade(symbol, tradeResult) {
    const tradeRow = [
      tradeResult.id || `trade_${Date.now()}`,
      tradeResult.timestamp || new Date().toISOString(),
      symbol,
      tradeResult.action,
      tradeResult.quantity,
      tradeResult.price,
      tradeResult.pnl || '',
      tradeResult.orderId || ''
    ];

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${this.tradesSheet}!A:H`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [tradeRow] }
    });

    logger.info('✅ Trade logged to Trades sheet', { tradeId: tradeRow[0] });
  }

  async _updatePosition(symbol, tradeResult) {
    const { data } = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.positionSheet}!A2:D`
    });

    const rows = data.values || [];
    let found = false;
    let updatedRows = [];

    // Process existing positions
    for (const row of rows) {
      if (row[0] === symbol) {
        found = true;
        if (tradeResult.action === 'BUY') {
          const prevQty = parseFloat(row[1]) || 0;
          const prevAvg = parseFloat(row[2]) || 0;
          const newQty = prevQty + tradeResult.quantity;
          const newAvg = newQty > 0 ? 
            ((prevQty * prevAvg) + (tradeResult.quantity * tradeResult.price)) / newQty : 0;
          
          updatedRows.push([symbol, newQty, newAvg.toFixed(4), new Date().toISOString()]);
        } else if (tradeResult.action === 'SELL') {
          const prevQty = parseFloat(row[1]) || 0;
          const remaining = Math.max(0, prevQty - tradeResult.quantity);
          
          if (remaining > 0) {
            updatedRows.push([symbol, remaining, parseFloat(row[2]), new Date().toISOString()]);
          }
        }
      } else {
        updatedRows.push(row);
      }
    }

    // Add new position for BUY if not found
    if (!found && tradeResult.action === 'BUY') {
      updatedRows.push([symbol, tradeResult.quantity, tradeResult.price, new Date().toISOString()]);
    }

    // Update the sheet
    if (updatedRows.length > 0) {
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: this.spreadsheetId,
        range: `${this.positionSheet}!A2:D`
      });

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.positionSheet}!A2:D${updatedRows.length + 1}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: updatedRows }
      });
    }

    logger.info('✅ Position updated in Positions sheet', { symbol });
  }

  async getTradeHistory(limit = 50) {
    try {
      await this.initialize();
      
      const { data } = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.tradesSheet}!A2:H`
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
        orderId: row[7]
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
      const cooldownMinutes = parseInt(process.env.COOLDOWN_MINUTES) || 15;
      const cooldownEnd = new Date(new Date(lastTrade.timestamp).getTime() + (cooldownMinutes * 60000));
      
      return new Date() < cooldownEnd;
    } catch (error) {
      logger.error('Error checking cooldown', error);
      return false;
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

  async getAllPositions() {
    try {
      await this.initialize();
      
      const { data } = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.positionSheet}!A2:D`
      });

      const positions = {};
      (data.values || []).forEach(([sym, qty, avg, updated]) => {
        if (sym && parseFloat(qty) > 0) {
          positions[sym] = {
            symbol: sym,
            quantity: parseFloat(qty),
            averagePrice: parseFloat(avg),
            lastUpdated: updated
          };
        }
      });

      return positions;
    } catch (error) {
      logger.error('Error getting all positions', error);
      return {};
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
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        lastChecked: new Date().toISOString()
      };
    }
  }
}

export default new StorageService();