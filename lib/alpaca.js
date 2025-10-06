
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

  async executeTrade({ symbol, action, quantity, takeProfitPercent, stopLossPercent }) {
    try {
      const account = await this.getAccount();

      if (account.trading_blocked) {
        throw new Error('Trading is blocked for this account');
      }

      // Get current price for calculating stop loss and take profit
      const quote = await this.alpaca.getLatestTrade(symbol);
      const currentPrice = quote.Price;

      // Calculate order parameters
      const orderData = {
        symbol,
        qty: quantity,
        side: action.toLowerCase(), // 'buy' or 'sell'
        type: 'market',
        time_in_force: 'day'
      };

      // Execute main order
      const order = await this.alpaca.createOrder(orderData);

      // If it's a buy order, set up bracket orders for take profit and stop loss
      if (action === 'BUY' && takeProfitPercent && stopLossPercent) {
        await this.setupBracketOrders(symbol, quantity, currentPrice, takeProfitPercent, stopLossPercent);
      }

      return {
        orderId: order.id,
        symbol,
        action,
        quantity,
        price: currentPrice,
        status: order.status,
        timestamp: order.created_at
      };

    } catch (error) {
      console.error('Error executing trade:', error);
      throw error;
    }
  }

  async setupBracketOrders(symbol, quantity, entryPrice, takeProfitPercent, stopLossPercent) {
    try {
      const takeProfitPrice = entryPrice * (1 + takeProfitPercent / 100);
      const stopLossPrice = entryPrice * (1 - stopLossPercent / 100);

      // Create take profit order
      await this.alpaca.createOrder({
        symbol,
        qty: quantity,
        side: 'sell',
        type: 'limit',
        time_in_force: 'gtc',
        limit_price: takeProfitPrice.toFixed(2)
      });

      // Create stop loss order
      await this.alpaca.createOrder({
        symbol,
        qty: quantity,
        side: 'sell',
        type: 'stop',
        time_in_force: 'gtc',
        stop_price: stopLossPrice.toFixed(2)
      });

    } catch (error) {
      console.error('Error setting up bracket orders:', error);
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
}

export default new AlpacaService();
