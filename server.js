/**
 * How to run:
 * 1) docker compose up -d
 * 2) Open Miniflux: http://localhost:8081
 * 3) Login with admin/adminpass
 * 4) Add a couple feeds (subscriptions)
 * 5) Create an API key in Miniflux UI
 * 6) Export env var and run:
 *    export MINIFLUX_API_KEY="..."
 *    npm i
 *    npm run dev
 * 7) Open http://localhost:3001
 */

require('dotenv').config();
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const app = express();
const PORT = 3001;

app.use(express.static('public'));

let cache = {
    data: [],
    lastFetch: 0
};
const CACHE_DURATION = 60 * 1000; // 60 seconds

app.get('/api/highlights', async (req, res) => {
    const MINIFLUX_URL = process.env.MINIFLUX_URL || 'http://localhost:8081';
    const API_KEY = process.env.MINIFLUX_API_KEY;

    if (!API_KEY) {
        return res.status(500).json({ error: 'Set MINIFLUX_API_KEY environment variable' });
    }

    const now = Date.now();
    if (cache.data.length > 0 && (now - cache.lastFetch < CACHE_DURATION)) {
        return res.json(cache.data);
    }

    try {
        // Try to get unread entries first
        let response = await fetch(`${MINIFLUX_URL}/v1/entries?status=unread&order=published_at&direction=desc&limit=30`, {
            headers: { 'X-Auth-Token': API_KEY }
        });

        if (!response.ok) {
            throw new Error(`Miniflux returned ${response.status}`);
        }

        let data = await response.json();
        let entries = data.entries || [];

        // If no unread, fallback to all entries
        if (entries.length === 0) {
            response = await fetch(`${MINIFLUX_URL}/v1/entries?order=published_at&direction=desc&limit=30`, {
                headers: { 'X-Auth-Token': API_KEY }
            });
             if (response.ok) {
                data = await response.json();
                entries = data.entries || [];
            }
        }

        // Dedupe by URL
        const seen = new Set();
        const highlights = [];
        
        for (const entry of entries) {
            if (!seen.has(entry.url)) {
                seen.add(entry.url);
                highlights.push({
                    title: entry.title,
                    url: entry.url,
                    published_at: entry.published_at,
                    feed_title: entry.feed ? entry.feed.title : 'Unknown'
                });
            }
        }

        cache.data = highlights;
        cache.lastFetch = now;
        
        res.json(highlights);

    } catch (error) {
        console.error('Error fetching from Miniflux:', error);
        res.status(502).json({ error: 'Failed to fetch headlines from Miniflux', details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
