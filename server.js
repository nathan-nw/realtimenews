/**
 * Zero-Dependency News Highlights Server
 * Fetches RSS feeds directly, dedupes, sorts, and caches them.
 */

const express = require('express');
const Parser = require('rss-parser');
const app = express();
const PORT = 3001;
const parser = new Parser({
    headers: { 'User-Agent': 'NewsHighlightsBar/1.0 (Simple RSS Aggregator)' }
});

app.use(express.static('public'));

const CONFIG_FEEDS = [
    'https://feeds.bbci.co.uk/news/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
    'https://www.reuters.com/rssFeed/topNews',
    'https://www.theverge.com/rss/index.xml',
    'https://hnrss.org/frontpage'
];

let cache = {
    data: [],
    lastFetch: 0
};
const CACHE_CONTENT_TTL = 120 * 1000; // 120 seconds

async function fetchAllFeeds() {
    const promises = CONFIG_FEEDS.map(async (url) => {
        try {
            const feed = await parser.parseURL(url);
            // Map items
            return feed.items.map(item => ({
                title: item.title,
                url: item.link,
                publishedAt: item.isoDate || item.pubDate, // rss-parser often provides isoDate
                source: feed.title || 'Unknown'
            }));
        } catch (err) {
            console.error(`Failed to fetch ${url}:`, err.message);
            return [];
        }
    });

    // Wait for all, merge results
    const results = await Promise.all(promises);
    let allItems = results.flat();

    // Dedupe by URL
    const seen = new Set();
    const uniqueItems = [];
    for (const item of allItems) {
        if (!item.url) continue;
        if (!seen.has(item.url)) {
            seen.add(item.url);
            uniqueItems.push(item);
        }
    }

    // Sort by date desc
    uniqueItems.sort((a, b) => {
        const dateA = new Date(a.publishedAt || 0);
        const dateB = new Date(b.publishedAt || 0);
        return dateB - dateA;
    });

    return uniqueItems.slice(0, 30);
}

app.get('/api/highlights', async (req, res) => {
    const now = Date.now();
    
    // Serve fresh cache
    if (cache.data.length > 0 && (now - cache.lastFetch < CACHE_CONTENT_TTL)) {
        return res.json(cache.data);
    }

    try {
        const freshData = await fetchAllFeeds();
        if (freshData.length > 0) {
            cache.data = freshData;
            cache.lastFetch = now;
            return res.json(freshData);
        } else {
            // If fetch returns empty (e.g. all failed), serve stale if available
            if (cache.data.length > 0) {
                console.warn('Returning stale cache due to empty fetch result');
                return res.json(cache.data);
            }
            return res.json([]);
        }
    } catch (error) {
        console.error('RSS Fetch Error:', error);
        // Serve stale on error
        if (cache.data.length > 0) {
            return res.json(cache.data);
        }
        res.status(500).json({ error: 'Failed to update headlines.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
