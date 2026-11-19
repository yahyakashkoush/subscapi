const https = require('https');
const http = require('http');
const { URL } = require('url');
const { readDB, writeDB } = require('./db');

/**
 * Handle Transparent API Proxying
 */
function handleProxy(req, res) {
  const authHeader = req.headers['authorization'] || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({
      error: {
        message: 'Missing or malformed Authorization header. Please pass "Authorization: Bearer sk-subsc-..."',
        type: 'authentication_error',
        code: 'missing_api_key'
      }
    });
  }

  const clientKeyStr = match[1].trim();
  const db = readDB();

  // Find client key record
  let clientRecord = db.clientKeys.find(k => k.clientKey === clientKeyStr);
  let upstreamKey = '';
  let upstreamBaseUrl = db.settings.defaultUpstreamUrl || 'https://api.xingchiapi.com/v1';

  if (clientRecord) {
    if (clientRecord.status !== 'active') {
      return res.status(403).json({
        error: {
          message: `This SubscAPI key is currently ${clientRecord.status}. Please contact support.`,
          type: 'permission_error',
          code: 'key_inactive'
        }
      });
    }

    if (clientRecord.remainingBalance <= 0) {
      return res.status(429).json({
        error: {
          message: 'Your SubscAPI balance is depleted ($0.00 remaining). Please renew your subscription.',
          type: 'insufficient_quota',
          code: 'quota_exceeded'
        }
      });
    }

    // Find mapped inventory key
    const invItem = db.inventory.find(i => i.id === clientRecord.inventoryKeyId);
    if (invItem) {
      upstreamKey = invItem.upstreamKey;
      if (invItem.baseUrl) {
        upstreamBaseUrl = invItem.baseUrl;
      }
    } else {
      // Fallback: pick any available key or use first inventory key
      const fallbackInv = db.inventory[0];
      if (fallbackInv) {
        upstreamKey = fallbackInv.upstreamKey;
      }
    }
  } else {
    // Check if admin is passing an inventory key directly
    const directInv = db.inventory.find(i => i.upstreamKey === clientKeyStr);
    if (directInv) {
      upstreamKey = directInv.upstreamKey;
      if (directInv.baseUrl) upstreamBaseUrl = directInv.baseUrl;
    } else {
      return res.status(401).json({
        error: {
          message: 'Incorrect API key provided: ' + clientKeyStr.substring(0, 10) + '...',
          type: 'invalid_request_error',
          code: 'invalid_api_key'
        }
      });
    }
  }

  // Handle special case: /v1/usage
  if (req.path === '/v1/usage' || req.path === '/usage') {
    return handleUsageEndpoint(req, res, clientRecord, upstreamBaseUrl, upstreamKey);
  }

  // Construct target URL
  let cleanBase = upstreamBaseUrl.replace(/\/+$/, '');
  let subPath = req.originalUrl || req.url;
  // If cleanBase ends with /v1 and subPath starts with /v1, don't duplicate /v1
  if (cleanBase.endsWith('/v1') && subPath.startsWith('/v1')) {
    subPath = subPath.replace(/^\/v1/, '');
  }

  const targetUrlStr = cleanBase + subPath;
  const targetUrl = new URL(targetUrlStr);

  // Prepare outgoing headers
  const outgoingHeaders = {
    ...req.headers,
    'host': targetUrl.host,
    'authorization': `Bearer ${upstreamKey}`
  };

  // Add default headers from settings (e.g. x-openai-actor-authorization)
  if (db.settings.defaultHeaders) {
    for (const [k, v] of Object.entries(db.settings.defaultHeaders)) {
      outgoingHeaders[k.toLowerCase()] = v;
    }
  }

  // Ensure appropriate client headers for IDEs if needed
  if (!outgoingHeaders['user-agent'] || outgoingHeaders['user-agent'].includes('node-fetch') || outgoingHeaders['user-agent'].includes('curl')) {
    outgoingHeaders['user-agent'] = 'Cursor/0.45.0 (SubscAPI Transparent Proxy)';
  }

  // Remove hop-by-hop headers
  delete outgoingHeaders['content-length'];
  delete outgoingHeaders['connection'];

  const requestModule = targetUrl.protocol === 'https:' ? https : http;

  const proxyReq = requestModule.request(targetUrl, {
    method: req.method,
    headers: outgoingHeaders,
    timeout: 60000
  }, (proxyRes) => {
    // Set status code
    res.status(proxyRes.statusCode);

    // Forward response headers
    for (const [headerKey, headerVal] of Object.entries(proxyRes.headers)) {
      if (headerKey.toLowerCase() !== 'content-length') {
        res.setHeader(headerKey, headerVal);
      }
    }

    // Set custom SubscAPI signature header
    res.setHeader('x-proxied-by', 'SubscAPI-HighSpeed-Gateway');
    res.setHeader('x-subsc-tier', clientRecord ? `${clientRecord.tier}USD` : 'Direct');

    // Streaming response directly to client
    proxyRes.pipe(res);

    // Track usage
    if (clientRecord && proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
      clientRecord.totalRequests = (clientRecord.totalRequests || 0) + 1;
      clientRecord.lastUsedAt = new Date().toISOString();
      writeDB(db);
    }
  });

  proxyReq.on('error', (err) => {
    console.error('SubscAPI Proxy Error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({
        error: {
          message: 'SubscAPI Gateway Error: Unable to reach upstream AI server (' + err.message + ')',
          type: 'upstream_error',
          code: 'bad_gateway'
        }
      });
    }
  });

  // Pipe incoming request body to target
  req.pipe(proxyReq);
}

/**
 * Handle custom /v1/usage for SubscAPI clients
 */
async function handleUsageEndpoint(req, res, clientRecord, upstreamBaseUrl, upstreamKey) {
  try {
    // If clientRecord exists, synthesize beautiful usage data
    if (clientRecord) {
      return res.json({
        isValid: true,
        status: clientRecord.status,
        mode: 'quota_limited',
        quota: {
          limit: clientRecord.initialBalance,
          remaining: Number(clientRecord.remainingBalance.toFixed(4)),
          used: Number((clientRecord.initialBalance - clientRecord.remainingBalance).toFixed(4)),
          unit: 'USD'
        },
        remaining: Number(clientRecord.remainingBalance.toFixed(4)),
        unit: 'USD',
        days_until_expiry: 30,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        usage: {
          today: {
            cost: 0,
            requests: clientRecord.totalRequests || 0,
            total_tokens: clientRecord.totalTokens || 0,
            input_tokens: 0,
            output_tokens: 0
          },
          total: {
            cost: Number((clientRecord.initialBalance - clientRecord.remainingBalance).toFixed(4)),
            requests: clientRecord.totalRequests || 0,
            total_tokens: clientRecord.totalTokens || 0
          },
          rpm: 60,
          tpm: 60000,
          average_duration_ms: 250
        },
        daily_usage: [
          {
            date: new Date().toISOString().slice(0, 10),
            requests: clientRecord.totalRequests || 0,
            total_tokens: clientRecord.totalTokens || 0,
            cost: Number((clientRecord.initialBalance - clientRecord.remainingBalance).toFixed(4))
          }
        ]
      });
    }

    // Direct proxy to upstream /v1/usage
    const url = `${upstreamBaseUrl.replace(/\/+$/, '')}/usage`;
    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${upstreamKey}`
      }
    });
    const data = await resp.json();
    return res.status(resp.status).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  handleProxy
};
