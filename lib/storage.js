// lib/storage.js – Fixed Google Sheets-backed storage with proper authentication
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

  // Initialize Google Sheets connection
  async initialize() {
    if (this.isInitialized) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = this._performInitialization();
    await this.initializationPromise;
  }

  async _performInitialization() {
    try {
      logger.info('Initializing Google Sheets storage service...');

      // Validate required environment variables
      const requiredEnvVars = [
        'GOOGLE_SERVICE_ACCOUNT_EMAIL',
        'GOOGLE_PRIVATE_KEY',
        'GOOGLE_SPREADSHEET_ID'
      ];

      const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
      if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
      }

      // Set up authentication
      const scopes = ['https://www.googleapis.com/auth/spreadsheets'];
      
      // Fix the private key formatting
      const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
      
      const jwtClient = new google.auth.JWT(
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        null,
        privateKey,
        scopes
      );

      // Authorize the client
      await jwtClient.authorize();
      logger.info('Google Sheets JWT client authorized successfully');

      // Initialize the Sheets API
      this.sheets = google.sheets({ version: 'v4', auth: jwtClient });
      this.spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

      // Verify spreadsheet access and ensure required sheets exist
      await this._ensureSheetsExist();
      
      this.isInitialized = true;
      logger.info('Google Sheets storage service initialized successfully', {
        spreadsheetId: this.spreadsheetId,
        positionSheet: this.positionSheet,
        tradesSheet: this.tradesSheet
      });
    } catch (error) {
      logger.error('Failed to initialize Google Sheets storage service', error);
      throw new Error(`Google Sheets initialization failed: ${error.message}`);
    }
  }

  // Ensure required sheets exist
  async _ensureSheetsExist() {
    try {
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      const existingSheets = spreadsheet.data.sheets.map(sheet => sheet.properties.title);
      const requiredSheets = [this.positionSheet, this.tradesSheet];

      for (const sheetName of requiredSheets) {
        if (!existingSheets.includes(sheetName)) {
          await this._createSheet(sheetName);
          await this._setupSheetHeaders(sheetName);
        }
      }
    } catch (error) {
      logger.error('Error ensuring sheets exist', error);
      throw error;
    }
  }

  // Create a new sheet
  async _createSheet(sheetName) {
    try {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: sheetName,
                gridProperties: {
                  rowCount: 1000,
                  columnCount: 10
                }
              }
            }
          }]
        }
      });
      logger.info(`Created sheet: ${sheetName}`);
    } catch (error) {
      logger.error(`Error creating sheet ${sheetName}`, error);
      throw error;
    }
  }

  // Setup headers for sheets
  async _setupSheetHeaders(sheetName) {
    try {
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
        logger.info(`Set up headers for sheet: ${sheetName}`, { headers });
      }
    } catch (error) {
      logger.error(`Error setting up headers for ${sheetName}`, error);
      throw error;
    }
  }

  // Fetch current position for a symbol
  async getCurrentPosition(symbol) {
    try {
      await this.initialize();
      
      logger.debug(`Fetching position for symbol: ${symbol}`);
      
      const { data } = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.positionSheet}!A2:D`,
      });

      if (!data.values) {
        logger.debug(`No positions found for ${symbol}`);
        return null;
      }

      for (const row of data.values) {
        if (row[0] === symbol) {
          const position = {
            symbol,
            quantity: parseFloat(row[1]) || 0,
            averagePrice: parseFloat(row[2]) || 0,
            lastUpdated: row[3] || new Date().toISOString()
          };
          logger.debug(`Found position for ${symbol}`, position);
          return position;
        }
      }

      logger.debug(`No position found for symbol: ${symbol}`);
      return null;
    } catch (error) {
      logger.error(`Error fetching position for ${symbol}`, error);
      throw new Error(`Failed to get current position: ${error.message}`);
    }
  }

  // Update position and log trade
  async updatePosition(symbol, tradeResult) {
    try {
      await this.initialize();
      
      logger.info('Updating position and logging trade', {
        symbol,
        action: tradeResult.action,
        quantity: tradeResult.quantity,
        price: tradeResult.price
      });

      // 1) Log trade to Trades sheet
      await this._logTrade(symbol, tradeResult);

      // 2) Update position in Positions sheet
      await this._updatePositionSheet(symbol, tradeResult);

      logger.info('Successfully updated position and logged trade', { symbol, tradeId: tradeResult.id });
    } catch (error) {
      logger.error('Failed to update position', error);
      throw new Error(`Failed to update position: ${error.message}`);
    }
  }

  // Log trade to Trades sheet
  async _logTrade(symbol, tradeResult) {
    try {
      const tradeRow = [
        tradeResult.id || Date.now().toString(),
        tradeResult.timestamp || new Date().toISOString(),
        symbol,
        tradeResult.action,
        tradeResult.quantity,
        tradeResult.price,
        tradeResult.pnl != null ? tradeResult.pnl : '',
        tradeResult.orderId || ''
      ];

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${this.tradesSheet}!A:H`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [tradeRow] }
      });

      logger.info('Trade logged to Google Sheets', {
        tradeId: tradeRow[0],
        symbol,
        action: tradeResult.action,
        quantity: tradeResult.quantity,
        price: tradeResult.price
      });
    } catch (error) {
      logger.error('Error logging trade to Google Sheets', error);
      throw error;
    }
  }

  // Update position in Positions sheet
  async _updatePositionSheet(symbol, tradeResult) {
    try {
      const { data } = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.positionSheet}!A2:D`,
      });

      const rows = data.values || [];
      let found = false;
      let updatedRows = [];

      // Process existing rows
      for (const row of rows) {
        if (row[0] === symbol) {
          found = true;
          if (tradeResult.action === 'BUY') {
            const prevQty = parseFloat(row[1]) || 0;
            const prevAvg = parseFloat(row[2]) || 0;
            const newQty = prevQty + tradeResult.quantity;
            const totalCost = (prevQty * prevAvg) + (tradeResult.quantity * tradeResult.price);
            const newAvgPrice = newQty > 0 ? totalCost / newQty : 0;
            
            updatedRows.push([
              symbol, 
              newQty, 
              newAvgPrice.toFixed(4), 
              new Date().toISOString()
            ]);
          } else if (tradeResult.action === 'SELL') {
            const prevQty = parseFloat(row[1]) || 0;
            const prevAvg = parseFloat(row[2]) || 0;
            const remaining = Math.max(0, prevQty - tradeResult.quantity);
            
            if (remaining > 0) {
              updatedRows.push([
                symbol, 
                remaining, 
                prevAvg, 
                new Date().toISOString()
              ]);
            }
            // If remaining is 0, don't add the row (position closed)
          }
        } else {
          updatedRows.push(row);
        }
      }

      // Add new position if not found and it's a BUY
      if (!found && tradeResult.action === 'BUY') {
        updatedRows.push([
          symbol, 
          tradeResult.quantity, 
          tradeResult.price, 
          new Date().toISOString()
        ]);
      }

      // Clear the range and update with new data
      if (updatedRows.length > 0) {
        // Clear existing data first
        await this.sheets.spreadsheets.values.clear({
          spreadsheetId: this.spreadsheetId,
          range: `${this.positionSheet}!A2:D`,
        });

        // Add updated data
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${this.positionSheet}!A2:D${updatedRows.length + 1}`,
          valueInputOption: 'USER_ENTERED',
          resource: { values: updatedRows }
        });
      }

      logger.info('Position updated in Google Sheets', {
        symbol,
        action: tradeResult.action,
        found,
        totalPositions: updatedRows.length
      });
    } catch (error) {
      logger.error('Error updating position in Google Sheets', error);
      throw error;
    }
  }

  // Get trade history
  async getTradeHistory(limit = 50) {
    try {
      await this.initialize();
      
      const { data } = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.tradesSheet}!A2:H`,
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

      // Return most recent trades first, limited by the specified limit
      return trades.slice(-limit).reverse();
    } catch (error) {
      logger.error('Error getting trade history', error);
      return [];
    }
  }

  // Check cooldown based on last trade timestamp
  async isInCooldown() {
    try {
      const trades = await this.getTradeHistory(1);
      if (!trades.length) return false;

      const lastTrade = trades[0];
      const cooldownMinutes = parseInt(process.env.COOLDOWN_MINUTES) || 15;
      const cooldownEnd = new Date(new Date(lastTrade.timestamp).getTime() + (cooldownMinutes * 60000));
      
      const inCooldown = new Date() < cooldownEnd;
      
      if (inCooldown) {
        const remainingMinutes = Math.ceil((cooldownEnd - new Date()) / 60000);
        logger.info(`System in cooldown: ${remainingMinutes} minutes remaining`);
      }
      
      return inCooldown;
    } catch (error) {
      logger.error('Error checking cooldown status', error);
      return false; // Default to not in cooldown if error
    }
  }

  // Get last trade for a symbol
  async getLastTrade(symbol) {
    try {
      const trades = await this.getTradeHistory(10); // Get last 10 trades
      const symbolTrade = trades.find(trade => trade.symbol === symbol);
      return symbolTrade || null;
    } catch (error) {
      logger.error(`Error getting last trade for ${symbol}`, error);
      return null;
    }
  }

  // Get all active positions
  async getAllPositions() {
    try {
      await this.initialize();
      
      const { data } = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.positionSheet}!A2:D`,
      });

      const positions = {};
      (data.values || []).forEach(([sym, qty, avg, lastUpdated]) => {
        if (sym && parseFloat(qty) > 0) {
          positions[sym] = {
            symbol: sym,
            quantity: parseFloat(qty),
            averagePrice: parseFloat(avg),
            lastUpdated: lastUpdated || new Date().toISOString()
          };
        }
      });

      return positions;
    } catch (error) {
      logger.error('Error getting all positions', error);
      return {};
    }
  }

  // Health check method
  async healthCheck() {
    try {
      await this.initialize();
      
      // Try to read spreadsheet info
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      return {
        status: 'healthy',
        spreadsheetTitle: spreadsheet.data.properties.title,
        sheetsCount: spreadsheet.data.sheets.length,
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Storage health check failed', error);
      return {
        status: 'unhealthy',
        error: error.message,
        lastChecked: new Date().toISOString()
      };
    }
  }
}

// Create and initialize the service
const storage = new StorageService();

export default storage;