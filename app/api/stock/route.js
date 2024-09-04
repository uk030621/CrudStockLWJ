import { NextResponse } from 'next/server';
import clientPromise from '../../../lib/mongodb';

// Helper function to connect to the database
async function connectToDatabase() {
    const client = await clientPromise;
    return client.db('stock_portfolio'); // Replace 'stock_portfolio' with your database name
}

// Function to get the baseline portfolio value
export async function getBaselinePortfolioValue() {
    const db = await connectToDatabase();
    const settings = await db.collection('settings').findOne({});

    const baselinePortfolioValue = settings?.baselinePortfolioValue || 100000; // Fallback to 100000 if not set

    // Use console.log to verify if the baselinePortfolioValue is retrieved
    console.log('Retrieved baselinePortfolioValue:', baselinePortfolioValue);

    return baselinePortfolioValue;
}

getBaselinePortfolioValue();


// GET - Fetch stock price from Yahoo Finance API or from database
export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol');

    try {
        const db = await connectToDatabase();

        if (symbol) {
            const stock = await db.collection('stocks').findOne({ symbol });

            if (!stock) {
                return NextResponse.json({ error: `No stock found with symbol: ${symbol}` }, { status: 404 });
            }

            if (stock.pricePerShare || stock.totalValue) {
                const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`);
                const data = await response.json();
                let pricePerShare = data.chart.result[0].meta.regularMarketPrice;

                // Debugging: Log the fetched pricePerShare, symbol, and stock.sharesHeld
                //console.log(`Fetched pricePerShare for ${symbol}:`, pricePerShare);
                //console.log(`Shares held for ${symbol}:`, stock.sharesHeld);

                if (pricePerShare !== undefined) {
                    stock.pricePerShare = (pricePerShare / 100).toFixed(2);
                    stock.totalValue = (pricePerShare * stock.sharesHeld).toFixed(2);

                    // Debugging: Log the calculated pricePerShare and totalValue
                    //console.log(`[A] Calculated pricePerShare for ${symbol}:`, stock.pricePerShare);
                    //console.log(`{A] Calculated totalValue for ${symbol}:`, stock.totalValue);

                    await db.collection('stocks').updateOne({ symbol }, { $set: { pricePerShare: stock.pricePerShare, totalValue: stock.totalValue } });
                } else {
                    return NextResponse.json({ error: `Failed to fetch stock price for symbol: ${symbol}` }, { status: 500 });
                }
            }

            return NextResponse.json(stock);
        } else {
            const stocks = await db.collection('stocks').find({}).toArray();

            const updatedStocks = await Promise.all(stocks.map(async (stock) => {
                if (stock.pricePerShare || stock.totalValue) {
                    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${stock.symbol}`);
                    const data = await response.json();
                    let pricePerShare = data.chart.result[0].meta.regularMarketPrice;

                    // Debugging: Log the fetched pricePerShare and stock.sharesHeld
                    //console.log(`[B] Fetched pricePerShare for ${stock.symbol}:`, pricePerShare);
                    //console.log(`[B] Shares held for ${stock.symbol}:`, stock.sharesHeld);

                    if (pricePerShare !== undefined) {
                        stock.pricePerShare = (pricePerShare / 100).toFixed(2);
                        stock.totalValue = (pricePerShare * stock.sharesHeld).toFixed(2);

                        // Debugging: Log the calculated pricePerShare and totalValue
                        //console.log(`[C] Calculated pricePerShare for ${stock.symbol}:`, stock.pricePerShare);
                        //console.log(`[C] Calculated totalValue for ${stock.symbol}:`, stock.totalValue);

                        await db.collection('stocks').updateOne({ symbol: stock.symbol }, { $set: { pricePerShare: stock.pricePerShare, totalValue: stock.totalValue } });
                    }
                }
                return stock;
            }));

            return NextResponse.json(updatedStocks);
        }
    } catch (error) {
        console.error('Error fetching stocks from database:', error);
        return NextResponse.json({ error: 'Failed to retrieve stocks from database' }, { status: 500 });
    }
}

// POST - Add a new stock to the database
export async function POST(req) {
    try {
        const db = await connectToDatabase();
        const newStock = await req.json();

        const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${newStock.symbol}`);
        const data = await response.json();
        let pricePerShare = data.chart.result[0].meta.regularMarketPrice;

        if (pricePerShare === undefined) {
            throw new Error('Failed to fetch stock price');
        }

        // Debugging: Log the fetched pricePerShare and sharesHeld
        //console.log(`[D] Fetched pricePerShare for ${newStock.symbol}:`, pricePerShare);
        //console.log(`{D] Shares held for ${newStock.symbol}:`, newStock.sharesHeld);

        newStock.pricePerShare = (pricePerShare / 100).toFixed(2);
        newStock.totalValue = (pricePerShare * newStock.sharesHeld).toFixed(2);

        // Debugging: Log the calculated pricePerShare and totalValue
        //console.log(`[E] Calculated pricePerShare for ${newStock.symbol}:`, newStock.pricePerShare);
        //console.log(`[E] Calculated totalValue for ${newStock.symbol}:`, newStock.totalValue);

        const result = await db.collection('stocks').insertOne(newStock);
        const addedStock = { _id: result.insertedId, ...newStock };

        return NextResponse.json(addedStock, { status: 201 });
    } catch (error) {
        console.error('Error adding stock to database:', error);
        return NextResponse.json({ error: 'Failed to add stock to database' }, { status: 500 });
    }
}

// PUT - Update an existing stock in the database
export async function PUT(req) {
    try {
        const db = await connectToDatabase();
        const updatedStock = await req.json();
        const { symbol, ...updateData } = updatedStock;

        const result = await db.collection('stocks').updateOne(
            { symbol },
            { $set: updateData }
        );

        if (result.matchedCount === 0) {
            return NextResponse.json({ error: `No stock found with symbol: ${symbol}` }, { status: 404 });
        }

        return NextResponse.json(updatedStock);
    } catch (error) {
        console.error('Error updating stock in database:', error);
        return NextResponse.json({ error: 'Failed to update stock in database' }, { status: 500 });
    }
}

// DELETE - Remove a stock from the database
export async function DELETE(req) {
    try {
        const db = await connectToDatabase();
        const { symbol } = await req.json();

        const result = await db.collection('stocks').deleteOne({ symbol });

        if (result.deletedCount === 0) {
            return NextResponse.json({ error: `No stock found with symbol: ${symbol}` }, { status: 404 });
        }

        return NextResponse.json({ message: `Stock with symbol ${symbol} deleted successfully` });
    } catch (error) {
        console.error('Error deleting stock from database:', error);
        return NextResponse.json({ error: 'Failed to delete stock from database' }, { status: 500 });
    }
}



