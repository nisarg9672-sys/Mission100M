// lib/storage.js – Google Sheets–backed storage

import { google } from 'googleapis';

class StorageService {
  constructor() {
    const scopes = ['https://www.googleapis.com/auth/spreadsheets'];
    this.jwtClient = new google.auth.JWT(
      process.env.sheets-backend@mission100m.iam.gserviceaccount.com,
      null,
      (process.env.b832e32238a72b1b6f23046fd8304521c5d98252 || '').replace(/\\n/g, '\n'),
      scopes
    );
    this.sheets = google.sheets({ version: 'v4', auth: this.jwtClient });
    this.spreadsheetId = process.env.https://docs.google.com/spreadsheets/d/1-fgG3vpJD97kjlUlq-PY1Y6RIBXrncAnmbq8LosrrOA/edit?gid=0#gid=0;
    this.positionSheet = 'Positions';
    this.tradesSheet = 'Trades';
  }

  // Ensure sheets exist (call once at startup)
  async initialize() {
    await this.jwtClient.authorize();
    // In production, you’d check for and create sheets if missing.
  }

  // Fetch current position for a symbol
  async getCurrentPosition(symbol) {
    const { data } = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.positionSheet}!A2:C`,
    });
    if (!data.values) return null;
    for (const row of data.values) {
      if (row[0] === symbol) {
        return {
          symbol,
          quantity: parseFloat(row[1]),
          averagePrice: parseFloat(row[2]),
        };
      }
    }
    return null;
  }

  // Append or update position and append trade record
  async updatePosition(symbol, tradeResult) {
    // 1) Append trade to Trades sheet
    const tradeRow = [
      tradeResult.id || Date.now().toString(),
      tradeResult.timestamp || new Date().toISOString(),
      symbol,
      tradeResult.action,
      tradeResult.quantity,
      tradeResult.price,
      tradeResult.pnl != null ? tradeResult.pnl : '',
      tradeResult.orderId
    ];
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${this.tradesSheet}!A:G`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [tradeRow] }
    });

    // 2) Upsert position in Positions sheet
    const rows = (await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.positionSheet}!A2:C`,
    })).data.values || [];

    let found = false;
    const updatedRows = rows.map(row => {
      if (row[0] === symbol) {
        found = true;
        if (tradeResult.action === 'BUY') {
          const prevQty = parseFloat(row[1]);
          const prevAvg = parseFloat(row[2]);
          const newQty = prevQty + tradeResult.quantity;
          const totalCost = prevQty * prevAvg + tradeResult.quantity * tradeResult.price;
          return [symbol, newQty, totalCost / newQty];
        } else {
          // SELL
          const prevQty = parseFloat(row[1]);
          const remaining = Math.max(0, prevQty - tradeResult.quantity);
          return [symbol, remaining, prevQty > 0 ? parseFloat(row[2]) : ''];
        }
      }
      return row;
    });
    if (!found && tradeResult.action === 'BUY') {
      updatedRows.push([symbol, tradeResult.quantity, tradeResult.price]);
    }

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${this.positionSheet}!A2:C${updatedRows.length + 1}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: updatedRows }
    });
  }

  // Retrieve recent trades
  async getTradeHistory(limit = 50) {
    const { data } = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.tradesSheet}!A2:H`,
    });
    const all = (data.values || []).map(row => ({
      id: row[0],
      timestamp: row[1],
      symbol: row[2],
      action: row[3],
      quantity: parseFloat(row[4]),
      price: parseFloat(row[5]),
      pnl: row[6] ? parseFloat(row[6]) : null,
      orderId: row[7]
    }));
    return all.slice(-limit).reverse();
  }

  // Check cooldown based on last trade timestamp in sheet
  async isInCooldown() {
    const trades = await this.getTradeHistory(1);
    if (!trades.length) return false;
    const last = trades[0];
    const cooldownEnd = new Date(new Date(last.timestamp).getTime() + (process.env.COOLDOWN_MINUTES || 15) * 60000);
    return new Date() < cooldownEnd;
  }

  // Fetch last trade metadata
  async getLastTrade(symbol) {
    const trades = await this.getTradeHistory(1);
    if (trades.length && trades[0].symbol === symbol) return trades[0];
    return null;
  }

  // Fetch all active positions
  async getAllPositions() {
    const { data } = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.positionSheet}!A2:C`,
    });
    const positions = {};
    (data.values || []).forEach(([sym, qty, avg]) => {
      positions[sym] = { symbol: sym, quantity: parseFloat(qty), averagePrice: parseFloat(avg) };
    });
    return positions;
  }
}

const storage = new StorageService();
storage.initialize();
export default storage;
