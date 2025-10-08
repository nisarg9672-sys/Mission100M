// lib/storage.js – Fixed Google Sheets storage with enhanced private key handling
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

      // Enhanced private key processing to handle different formats
      let privateKey = process.env.GOOGLE_PRIVATE_KEY;
      
      // Log the key format for debugging (without exposing the actual key)
      logger.info('🔑 Processing private key...', {
        hasKey: !!privateKey,
        keyLength: privateKey?.length || 0,
        startsWithBegin: privateKey?.startsWith('-----BEGIN'),
        hasNewlines: privateKey?.includes('\\n'),
        hasActualNewlines: privateKey?.includes('\n')
      });

      // Handle different private key formats
      if (privateKey) {
        // Remove any quotes that might wrap the key
        privateKey = privateKey.replace(/^["']|["']$/g, '');
        
        // Convert escaped newlines to actual newlines
        privateKey = privateKey.replace(/\\n/g, '\n');
        
        // Ensure proper formatting
        if (!privateKey.startsWith('-----BEGIN PRIVATE KEY-----')) {
          // If it's just the base64 content, wrap it properly
          if (!privateKey.includes('-----BEGIN')) {
            privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
          }
        }
        
        // Clean up any double newlines that might have been created
        privateKey = privateKey.replace(/\n\n+/g, '\n');
        
        logger.info('✅ Private key processed', {
          startsCorrectly: privateKey.startsWith('-----BEGIN PRIVATE KEY-----'),
          endsCorrectly: privateKey.endsWith('-----END PRIVATE KEY-----'),
          lineCount: privateKey.split('\n').length
        });
      }

      // Set up authentication with multiple fallback methods
      let auth;
      
      try {
        // Method 1: Standard JWT client
        auth = new google.auth.JWT({
          email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          key: privateKey,
          scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        
        logger.info('🔐 Created JWT client with standard method');
      } catch (jwtError) {
        logger.warn('⚠️ Standard JWT creation failed, trying alternative method', {
          error: jwtError.message
        });
        
        // Method 2: Alternative JWT format
        try {
          auth = new google.auth.JWT(
            process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            null,
            privateKey,
            ['https://www.googleapis.com/auth/spreadsheets']
          );
          logger.info('🔐 Created JWT client with alternative method');
        } catch (altError) {
          logger.error('❌ Both JWT methods failed', {
            standardError: jwtError.message,
            alternativeError: altError.message
          });
          throw new Error(`JWT client creation failed: ${altError.message}`);
        }
      }

      // Test authentication
      logger.info('🔍 Testing Google authentication...');
      await auth.authorize();
      logger.info('✅ Google Sheets JWT authentication successful');

      this.sheets = google.sheets({ version: 'v4', auth });
      this.spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

      // Test spreadsheet access
      logger.info('📋 Testing spreadsheet access...');
      const testAccess = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId
      });
      
      logger.info('✅ Spreadsheet access confirmed', {
        title: testAccess.data.properties.title,
        sheetCount: testAccess.data.sheets.length
      });

      // Ensure required sheets exist
      await this._ensureSheetsExist();
      
      this.isInitialized = true;
      logger.info('✅ Google Sheets storage service ready');

    } catch (error) {
      logger.error('❌ Google Sheets initialization failed', {
        errorMessage: error.message,
        errorCode: error.code,
        errorStack: error.stack?.split('\n')[0] // Just first line of stack
      });
      
      // Provide helpful error messages based on error type
      if (error.message.includes('DECODER routines')) {
        throw new Error('Private key format error. Please check the GOOGLE_PRIVATE_KEY environment variable format. It should include -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY----- lines.');
      } else if (error.message.includes('invalid_grant')) {
        throw new Error('Authentication failed. Check if the service account email and private key match, and ensure the spreadsheet is shared with the service account.');
      } else if (error.message.includes('PERMISSION_DENIED')) {
        throw new Error('Permission denied. Make sure the Google Spreadsheet is shared with the service account email with Editor permissions.');
      } else if (error.message.includes('NOT_FOUND')) {
        throw new Error('Spreadsheet not found. Check the GOOGLE_SPREADSHEET_ID environment variable.');
      }
      
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
          logger.info(`📝 Creating missing sheet: ${sheetName}`);
          await this._createSheet(sheetName);
        } else {
          logger.info(`✅ Sheet exists: ${sheetName}`);
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
      logger.error('❌ Storage health check failed', {
        errorMessage: error.message,
        errorCode: error.code
      });
      
      return {
        status: 'unhealthy',
        error: error.message,
        lastChecked: new Date().toISOString(),
        troubleshooting: this._getTroubleshootingTips(error)
      };
    }
  }

  _getTroubleshootingTips(error) {
    const tips = [];
    
    if (error.message.includes('DECODER routines')) {
      tips.push('Private key format issue - check GOOGLE_PRIVATE_KEY format in Vercel environment variables');
      tips.push('Ensure the private key includes -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY----- lines');
      tips.push('Try copying the private key directly from the downloaded JSON file');
    }
    
    if (error.message.includes('invalid_grant')) {
      tips.push('Service account authentication failed - verify service account email and private key match');
    }
    
    if (error.message.includes('PERMISSION_DENIED')) {
      tips.push('Share the Google Spreadsheet with the service account email');
      tips.push('Give the service account Editor permissions');
    }
    
    if (error.message.includes('NOT_FOUND')) {
      tips.push('Check the GOOGLE_SPREADSHEET_ID environment variable');
      tips.push('Verify the spreadsheet exists and is accessible');
    }
    
    return tips;
  }
}

export default new StorageService();