import yahooFinance from 'yahoo-finance2';

// Suppress Yahoo Finance notices for cleaner output
try {
  yahooFinance.suppressNotices(['yahooSurvey', 'ripHistorical']);
} catch (error) {
  console.log('Notice suppression failed:', error.message);
}

export const getYahooPrice = async (ticker = 'ZSP.TO') => {
  try {
    console.log(`Fetching Yahoo Finance data for ${ticker}`);
    
    // Validate ticker format
    const validatedTicker = validateTicker(ticker);
    
    // Get current quote
    const quote = await yahooFinance.quote(validatedTicker);
    
    if (!quote || !quote.regularMarketPrice) {
      throw new Error(`No price data found for ticker ${validatedTicker}`);
    }
    
    return {
      ticker: validatedTicker,
      price: quote.regularMarketPrice,
      currency: quote.currency || 'CAD',
      timestamp: new Date().toISOString(),
      marketTime: quote.regularMarketTime?.toISOString() || new Date().toISOString(),
      change: quote.regularMarketChange || 0,
      changePercent: quote.regularMarketChangePercent || 0,
      volume: quote.regularMarketVolume || 0
    };
  } catch (error) {
    console.error(`Yahoo Finance error for ${ticker}:`, error.message);
    throw new Error(`Failed to fetch Yahoo Finance data: ${error.message}`);
  }
};

export const getHistoricalData = async (ticker = 'ZSP.TO', period = '1mo') => {
  try {
    const validatedTicker = validateTicker(ticker);
    
    // Use chart instead of historical (deprecated)
    const result = await yahooFinance.chart(validatedTicker, {
      period1: getDateFromPeriod(period),
      interval: '1d'
    });
    
    if (!result || !result.quotes || result.quotes.length === 0) {
      throw new Error(`No historical data found for ${validatedTicker}`);
    }
    
    return result.quotes.map(quote => ({
      date: quote.date?.toISOString() || new Date().toISOString(),
      open: quote.open || 0,
      high: quote.high || 0,
      low: quote.low || 0,
      close: quote.close || 0,
      volume: quote.volume || 0
    }));
  } catch (error) {
    console.error(`Historical data error for ${ticker}:`, error.message);
    throw new Error(`Failed to fetch historical data: ${error.message}`);
  }
};

// Helper function to validate ticker format
function validateTicker(ticker) {
  if (!ticker || typeof ticker !== 'string') {
    return 'ZSP.TO'; // Default fallback
  }
  
  // Handle common ZSP variations
  const upperTicker = ticker.toUpperCase();
  if (upperTicker === 'ZSP' || upperTicker === 'ZSP.TO' || upperTicker === 'ZSP.NE') {
    return upperTicker;
  }
  
  return ticker;
}

// Helper function to convert period to date
function getDateFromPeriod(period) {
  const now = new Date();
  switch (period) {
    case '1d':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '1w':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '1mo':
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

export default {
  getYahooPrice,
  getHistoricalData
};
