import fs from 'fs/promises';
import path from 'path';

class StorageService {
  constructor() {
    this.dataPath = '/tmp/trading-data.json';
  }

  async getCurrentPosition(symbol) {
    try {
      const data = await this.loadData();
      return data.positions[symbol] || { quantity: 0, averagePrice: 0, lastUpdate: null };
    } catch (error) {
      console.error('Error loading position:', error);
      return { quantity: 0, averagePrice: 0, lastUpdate: null };
    }
  }

  async updatePosition(symbol, tradeResult) {
    try {
      const data = await this.loadData();

      if (!data.positions) {
        data.positions = {};
      }

      const currentPosition = data.positions[symbol] || { quantity: 0, averagePrice: 0 };

      if (tradeResult.action === 'BUY') {
        // Calculate new average price for buys
        const totalCost = (currentPosition.quantity * currentPosition.averagePrice) + 
                         (tradeResult.quantity * tradeResult.price);
        const totalQuantity = currentPosition.quantity + tradeResult.quantity;

        data.positions[symbol] = {
          quantity: totalQuantity,
          averagePrice: totalQuantity > 0 ? totalCost / totalQuantity : 0,
          lastUpdate: new Date().toISOString()
        };
      } else if (tradeResult.action === 'SELL') {
        // Reduce position for sells
        data.positions[symbol] = {
          quantity: Math.max(0, currentPosition.quantity - tradeResult.quantity),
          averagePrice: currentPosition.averagePrice,
          lastUpdate: new Date().toISOString()
        };
      }

      // Add trade to history
      if (!data.trades) {
        data.trades = [];
      }

      data.trades.push({
        ...tradeResult,
        timestamp: new Date().toISOString()
      });

      await this.saveData(data);
    } catch (error) {
      console.error('Error updating position:', error);
      throw error;
    }
  }

  async getTradeHistory(limit = 50) {
    try {
      const data = await this.loadData();
      return (data.trades || []).slice(-limit);
    } catch (error) {
      console.error('Error loading trade history:', error);
      return [];
    }
  }

  async loadData() {
    try {
      const dataString = await fs.readFile(this.dataPath, 'utf8');
      return JSON.parse(dataString);
    } catch (error) {
      // File doesn't exist or is invalid, return default structure
      return {
        positions: {},
        trades: [],
        createdAt: new Date().toISOString()
      };
    }
  }

  async saveData(data) {
    try {
      data.lastUpdated = new Date().toISOString();
      await fs.writeFile(this.dataPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving data:', error);
      throw error;
    }
  }

  // Clean up old trades (keep only last 1000)
  async cleanupOldTrades() {
    try {
      const data = await this.loadData();
      if (data.trades && data.trades.length > 1000) {
        data.trades = data.trades.slice(-1000);
        await this.saveData(data);
      }
    } catch (error) {
      console.error('Error cleaning up trades:', error);
    }
  }
}

export default new StorageService();
