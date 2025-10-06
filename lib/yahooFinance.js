
import yahooFinance from 'yahoo-finance2';

class YahooFinanceService {
  async getMarketData(symbol) {
    try {
      // Get current quote
      const quote = await yahooFinance.quote(symbol);

      // Get historical data for technical analysis
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 100); // 100 days of data

      const historical = await yahooFinance.historical(symbol, {
        period1: startDate,
        period2: endDate,
        interval: '1d'
      });

      return {
        symbol,
        currentPrice: quote.regularMarketPrice,
        previousClose: quote.regularMarketPreviousClose,
        volume: quote.regularMarketVolume,
        marketCap: quote.marketCap,
        high52Week: quote.fiftyTwoWeekHigh,
        low52Week: quote.fiftyTwoWeekLow,
        historical: historical.map(h => ({
          date: h.date,
          open: h.open,
          high: h.high,
          low: h.low,
          close: h.close,
          volume: h.volume
        }))
      };
    } catch (error) {
      console.error(`Error fetching data for ${symbol}:`, error);
      return null;
    }
  }

  async getQuote(symbol) {
    try {
      return await yahooFinance.quote(symbol);
    } catch (error) {
      console.error(`Error fetching quote for ${symbol}:`, error);
      return null;
    }
  }
}

export default new YahooFinanceService();
