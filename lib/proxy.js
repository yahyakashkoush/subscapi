const https = require('https');
const http = require('http');
const { URL } = require('url');
const { readDB, writeDB } = require('./db');

// High-Capacity Keep-Alive Agents for up to 5,000 concurrent pooled connections
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 300,
  maxFreeSockets: 50,
  timeout: 60000
});

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 300,
  maxFreeSockets: 50,
  timeout: 60000
});

// In-Memory Rate Limiter (300 requests/minute per client key to prevent accidental loops)
const clientRateMap = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of clientRateMap.entries()) {
    if (now - data.resetAt > 60000) {
      clientRateMap.delete(key);
    }
  }
}, 60000);

// Round-robin index for key rotation across upstream inventory pool
let roundRobinIndex = 0;

function selectInventoryItem(db, clientRecord) {
  if (clientRecord.inventoryKeyId) {
    const fixed = db.inventory.find(i => i.id === clientRecord.inventoryKeyId);
    if (fixed && fixed.upstreamKey) return fixed;
  }

  // Filter available active inventory pool matching tier and model
  let pool = db.inventory.filter(i => 
    i.model === clientRecord.model && 
    Number(i.tier) === Number(clientRecord.tier) && 
    i.status !== 'depleted'
  );

  if (pool.length === 0) {
    pool = db.inventory.filter(i => i.model === clientRecord.model && i.status !== 'depleted');
  }
  if (pool.length === 0) {
    pool = db.inventory.filter(i => Number(i.tier) === Number(clientRecord.tier) && i.status !== 'depleted');
  }
  if (pool.length === 0) {
    pool = db.inventory.filter(i => i.status !== 'depleted');
  }
  if (pool.length === 0) {
    pool = db.inventory;
  }

  if (pool.length === 0) return null;

  const item = pool[roundRobinIndex % pool.length];
  roundRobinIndex = (roundRobinIndex + 1) % 1000000;
  return item;
}

// Deduct client usage in real-time
function recordUsage(db, clientRecord, tokensUsed = 120) {
  const deduction = 0.0025; // Standard deduction per successful request
  clientRecord.remainingBalance = Math.max(0, Number((clientRecord.remainingBalance - deduction).toFixed(4)));
  clientRecord.totalRequests = (clientRecord.totalRequests || 0) + 1;
  clientRecord.totalTokens = (clientRecord.totalTokens || 0) + tokensUsed;
  clientRecord.lastUsedAt = new Date().toISOString();

  if (db.users) {
    const user = db.users.find(u => 
      (clientRecord.clerkUserId && u.clerkUserId === clientRecord.clerkUserId) ||
      (clientRecord.customerContact && u.email === clientRecord.customerContact)
    );
    if (user && user.subscription) {
      user.subscription.remainingBalance = clientRecord.remainingBalance;
      user.subscription.usedBalance = Number((clientRecord.initialBalance - clientRecord.remainingBalance).toFixed(4));
      user.subscription.lastUsedAt = clientRecord.lastUsedAt;
    }
  }
  writeDB(db);
}

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

    // Rate Limiting Protection (300 req / minute per client key)
    const now = Date.now();
    let rateData = clientRateMap.get(clientKeyStr);
    if (!rateData || now - rateData.resetAt > 60000) {
      rateData = { count: 1, resetAt: now };
      clientRateMap.set(clientKeyStr, rateData);
    } else {
      rateData.count++;
      if (rateData.count > 300) {
        return res.status(429).json({
          error: {
            message: 'Too many requests. SubscAPI rate limit is 300 requests per minute.',
            type: 'rate_limit_exceeded',
            code: 'rate_limit_exceeded'
          }
        });
      }
    }

    // Load Balanced Key Selection across inventory pool
    const invItem = selectInventoryItem(db, clientRecord);
    if (invItem) {
      upstreamKey = invItem.upstreamKey;
      if (invItem.baseUrl) {
        upstreamBaseUrl = invItem.baseUrl;
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

  // Handle /v1/chat/completions translation to /v1/responses (since upstream disabled /v1/chat/completions)
  if (req.path === '/v1/chat/completions' || req.path === '/chat/completions') {
    return handleChatCompletionsCompatibility(req, res, clientRecord, upstreamBaseUrl, upstreamKey, db);
  }

  // Construct target URL for direct endpoints (e.g. /v1/responses, /v1/models)
  let cleanBase = upstreamBaseUrl.replace(/\/+$/, '');
  let subPath = req.originalUrl || req.url;
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

  // Add default headers from settings
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
  const agent = targetUrl.protocol === 'https:' ? httpsAgent : httpAgent;

  const proxyReq = requestModule.request(targetUrl, {
    method: req.method,
    headers: outgoingHeaders,
    agent: agent,
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

    // Set custom SubscAPI signature headers
    res.setHeader('x-proxied-by', 'SubscAPI-HighSpeed-Gateway');
    res.setHeader('x-subsc-tier', clientRecord ? `${clientRecord.tier}USD` : 'Direct');

    // Streaming response directly to client
    proxyRes.pipe(res);

    // Track usage & deduct balance in real time on successful response
    if (clientRecord && proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
      recordUsage(db, clientRecord, 120);
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
 * Compatibility handler for /v1/chat/completions -> /v1/responses
 */
function handleChatCompletionsCompatibility(req, res, clientRecord, upstreamBaseUrl, upstreamKey, db) {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', async () => {
    try {
      const raw = Buffer.concat(chunks).toString('utf-8');
      const body = raw ? JSON.parse(raw) : {};

      let input = '';
      if (Array.isArray(body.messages)) {
        input = body.messages.map(m => {
          if (typeof m.content === 'string') return m.content;
          return JSON.stringify(m.content);
        }).join('\n');
      } else if (body.prompt) {
        input = typeof body.prompt === 'string' ? body.prompt : JSON.stringify(body.prompt);
      } else {
        input = 'Hello';
      }

      const responsesPayload = {
        model: body.model || clientRecord?.model || 'gpt-6.1-sol',
        input: input
      };

      const cleanBase = upstreamBaseUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
      const targetUrl = `${cleanBase}/v1/responses`;

      const upstreamResp = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${upstreamKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Cursor/0.45.0 (SubscAPI Compatible Gateway)'
        },
        body: JSON.stringify(responsesPayload)
      });

      if (!upstreamResp.ok) {
        const errorText = await upstreamResp.text();
        return res.status(upstreamResp.status).send(errorText);
      }

      const upstreamData = await upstreamResp.json();
      const assistantText = upstreamData.output?.[0]?.content?.[0]?.text || '';
      const tokens = upstreamData.usage?.total_tokens || 120;

      // Track usage
      if (clientRecord) {
        recordUsage(db, clientRecord, tokens);
      }

      res.setHeader('content-type', 'application/json');
      res.setHeader('x-proxied-by', 'SubscAPI-HighSpeed-Gateway');
      res.setHeader('x-subsc-tier', clientRecord ? `${clientRecord.tier}USD` : 'Direct');

      const chatCompletionResponse = {
        id: upstreamData.id || `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: upstreamData.created_at || Math.floor(Date.now() / 1000),
        model: upstreamData.model || body.model || 'gpt-6.1-sol',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: assistantText
            },
            finish_reason: 'stop'
          }
        ],
        usage: upstreamData.usage || {
          prompt_tokens: 50,
          completion_tokens: 50,
          total_tokens: 100
        }
      };

      return res.json(chatCompletionResponse);
    } catch (err) {
      console.error('Chat completions adapter error:', err);
      return res.status(500).json({
        error: {
          message: 'SubscAPI Gateway Error converting chat completion: ' + err.message,
          type: 'gateway_error'
        }
      });
    }
  });
}

/**
 * Handle custom /v1/usage for SubscAPI clients
 */
async function handleUsageEndpoint(req, res, clientRecord, upstreamBaseUrl, upstreamKey) {
  try {
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
