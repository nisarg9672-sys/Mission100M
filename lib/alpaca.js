import Alpaca from '@alpacahq/alpaca-trade-api';

class AlpacaService {
  constructor() {
    this.alpaca = new Alpaca({
      keyId: process.env.ALPACA_API_KEY_ID,
      secretKey: process.env.ALPACA_SECRET_KEY,
      paper: process.env.ALPACA_PAPER === 'true',
      usePolygon: false
    });
  }

  async getAccount() {
    try {
      return await this.alpaca.getAccount();
    } catch (error) {
      console.error('Error getting account:', error);
      throw error;
    }
  }

  async getQuote(symbol) {
    try {
      return await this.alpaca.getLatestTrade(symbol);
    } catch (error) {
      console.error('Error getting quote:', error);
      throw error;
    }
  }

  async placeOrder({ symbol, side, qty, type, tif, confirm = false }) {
    try {
      const account = await this.getAccount();
      if (account.trading_blocked) {
        throw new Error('Trading is blocked for this account');
      }

      // If confirm is false, return a simulation response
      if (!confirm) {
        return {
          orderId: 'SIMULATED_' + Date.now(),
          symbol,
          side,
          qty,
          type,
          status: 'simulated',
          message: 'Order simulation - set confirm=true to execute',
          timestamp: new Date().toISOString()
        };
      }

      // Execute real order
      const orderData = {
        symbol,
        qty: parseFloat(qty),
        side: side.toLowerCase(),
        type: type.toLowerCase(),
        time_in_force: tif.toLowerCase()
      };

      console.log('Placing Alpaca order:', orderData);
      const order = await this.alpaca.createOrder(orderData);

      return {
        orderId: order.id,
        symbol,
        side,
        qty,
        type,
        status: order.status,
        timestamp: order.created_at,
        filled_price: order.filled_avg_price || null
      };
    } catch (error) {
      console.error('Error placing order:', error);
      throw error;
    }
  }

  async getPositions() {
    try {
      return await this.alpaca.getPositions();
    } catch (error) {
      console.error('Error getting positions:', error);
      return [];
    }
  }

  async getPosition(symbol) {
    try {
      return await this.alpaca.getPosition(symbol);
    } catch (error) {
      console.error(`Error getting position for ${symbol}:`, error);
      return null;
    }
  }

  // New method to sync Alpaca positions with local storage
  async syncPosition(symbol, localStorage) {
    try {
      const alpacaPosition = await this.getPosition(symbol);
      const localPosition = await localStorage.getCurrentPosition(symbol);
      
      if (alpacaPosition) {
        // Update local storage with real Alpaca position
        const realPosition = {
          quantity: parseFloat(alpacaPosition.qty),
          averagePrice: parseFloat(alpacaPosition.avg_entry_price),
          lastUpdate: new Date().toISOString(),
          source: 'alpaca_sync'
        };
        
        console.log('Syncing position from Alpaca:', realPosition);
        return realPosition;
      }
      
      return localPosition;
    } catch (error) {
      console.error('Position sync error:', error);
      return localStorage.getCurrentPosition(symbol);
    }
  }
}

// Create instance
const alpacaService = new AlpacaService();

// Export the functions that trading.js expects
export const getAlpacaQuote = (symbol) => alpacaService.getQuote(symbol);
export const placeAlpacaOrder = (orderParams) => alpacaService.placeOrder(orderParams);
export const syncAlpacaPosition = (symbol, storage) => alpacaService.syncPosition(symbol, storage);

// Also export the service instance and class for flexibility
export { AlpacaService };
export default alpacaService;
