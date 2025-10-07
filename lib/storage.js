// lib/storage.js - Enhanced persistent storage
class StorageService {
  constructor() {
    // Use environment variable for persistence or fallback to memory
    this.useMemoryStorage = true; // Change to external DB in production
    this.memoryStore = {
      positions: {},
      trades: [],
      lastTrade: null,
      cooldownUntil: null
    };
  }

  async getCurrentPosition(symbol) {
    try {
      if (this.useMemoryStorage) {
        const position = this.memoryStore.positions[symbol] || null;
        console.log(`Loading position for ${symbol}:`, position);
        return position;
      }
      
      // In production, use external database like Supabase, PlanetScale, or Vercel KV
      return null;
    } catch (error) {
      console.error('Error loading position:', error);
      return null;
    }
  }

  async updatePosition(symbol, tradeResult) {
    try {
      console.log(`Updating position for ${symbol}:`, tradeResult);
      
      if (this.useMemoryStorage) {
        const currentPosition = this.memoryStore.positions[symbol] || null;
        
        if (tradeResult.action === 'BUY') {
          // Calculate new position
          const newQuantity = (currentPosition?.quantity || 0) + tradeResult.quantity;
          const currentCost = (currentPosition?.quantity || 0) * (currentPosition?.averagePrice || 0);
          const newCost = tradeResult.quantity * tradeResult.price;
          const totalCost = currentCost + newCost;
          const averagePrice = totalCost / newQuantity;

          this.memoryStore.positions[symbol] = {
            symbol,
            quantity: newQuantity,
            averagePrice: averagePrice,
            lastUpdate: new Date().toISOString(),
            entryPrice: averagePrice,
            side: 'LONG'
          };
        } else if (tradeResult.action === 'SELL') {
          // Reduce or close position
          const currentQuantity = currentPosition?.quantity || 0;
          const remainingQuantity = Math.max(0, currentQuantity - tradeResult.quantity);
          
          if (remainingQuantity <= 0) {
            delete this.memoryStore.positions[symbol];
            console.log(`Position closed for ${symbol}`);
          } else {
            this.memoryStore.positions[symbol] = {
              ...currentPosition,
              quantity: remainingQuantity,
              lastUpdate: new Date().toISOString()
            };
          }
        }

        // Add trade to history
        this.memoryStore.trades.push({
          ...tradeResult,
          timestamp: new Date().toISOString(),
          id: Date.now().toString()
        });

        // Set last trade info and cooldown
        this.memoryStore.lastTrade = {
          symbol,
          action: tradeResult.action,
          price: tradeResult.price,
          timestamp: new Date().toISOString()
        };

        // Set 5-minute cooldown after any trade
        this.memoryStore.cooldownUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();

        // Keep only last 100 trades
        if (this.memoryStore.trades.length > 100) {
          this.memoryStore.trades = this.memoryStore.trades.slice(-100);
        }

        console.log(`Position updated. Current positions:`, this.memoryStore.positions);
        console.log(`Cooldown until:`, this.memoryStore.cooldownUntil);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error updating position:', error);
      throw error;
    }
  }

  async getTradeHistory(limit = 50) {
    try {
      if (this.useMemoryStorage) {
        return this.memoryStore.trades.slice(-limit).reverse();
      }
      return [];
    } catch (error) {
      console.error('Error loading trade history:', error);
      return [];
    }
  }

  async isInCooldown() {
    try {
      if (!this.memoryStore.cooldownUntil) return false;
      
      const now = new Date();
      const cooldownEnd = new Date(this.memoryStore.cooldownUntil);
      const inCooldown = now < cooldownEnd;
      
      console.log(`Cooldown check: ${inCooldown}, ends at ${this.memoryStore.cooldownUntil}`);
      return inCooldown;
    } catch (error) {
      console.error('Error checking cooldown:', error);
      return false;
    }
  }

  async getLastTrade(symbol) {
    try {
      if (this.useMemoryStorage) {
        const lastTrade = this.memoryStore.lastTrade;
        if (lastTrade && lastTrade.symbol === symbol) {
          return lastTrade;
        }
      }
      return null;
    } catch (error) {
      console.error('Error getting last trade:', error);
      return null;
    }
  }

  async getAllPositions() {
    try {
      if (this.useMemoryStorage) {
        return this.memoryStore.positions;
      }
      return {};
    } catch (error) {
      console.error('Error getting all positions:', error);
      return {};
    }
  }

  async clearAllData() {
    try {
      if (this.useMemoryStorage) {
        this.memoryStore = {
          positions: {},
          trades: [],
          lastTrade: null,
          cooldownUntil: null
        };
        console.log('All data cleared');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error clearing data:', error);
      return false;
    }
  }
}

export default new StorageService();
