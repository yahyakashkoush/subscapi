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

// Cooldown map for temporarily down upstream keys (5 minutes cooldown)
const temporaryDownKeys = new Map();

function isKeyUpstreamHealthy(upstreamKey) {
  if (!upstreamKey) return false;
  const downUntil = temporaryDownKeys.get(upstreamKey);
  if (!downUntil) return true;
  if (Date.now() > downUntil) {
    temporaryDownKeys.delete(upstreamKey);
    return true;
  }
  return false;
}

function markKeyUpstreamDown(upstreamKey) {
  if (upstreamKey) {
    temporaryDownKeys.set(upstreamKey, Date.now() + 5 * 60 * 1000);
  }
}

// Get ordered list of candidate inventory items for resilient execution
function getCandidateInventoryItems(db, clientRecord, requestedModel) {
  const candidates = [];
  const addedKeys = new Set();

  function add(item) {
    if (item && item.upstreamKey && !addedKeys.has(item.upstreamKey)) {
      addedKeys.add(item.upstreamKey);
      candidates.push(item);
    }
  }

  const tier = Number(clientRecord?.tier) || 100;

  // 1. If client has an assigned inventory key and it's healthy, put it first
  if (clientRecord?.inventoryKeyId) {
    const fixed = db.inventory.find(i => i.id === clientRecord.inventoryKeyId);
    if (fixed && isKeyUpstreamHealthy(fixed.upstreamKey)) {
      add(fixed);
    }
  }

  // 2. High priority: matching tier AND known working model (gpt-6.1-sol)
  const healthyTierSol = db.inventory.filter(i => 
    Number(i.tier) === tier && 
    (i.model === 'gpt-6.1-sol' || (i.group && i.group.includes('gpt-6.1-sol'))) &&
    isKeyUpstreamHealthy(i.upstreamKey)
  );
  for (const item of healthyTierSol) add(item);

  // 3. Other healthy keys matching tier
  const healthyTierOther = db.inventory.filter(i => 
    Number(i.tier) === tier && 
    isKeyUpstreamHealthy(i.upstreamKey)
  );
  for (const item of healthyTierOther) add(item);

  // 4. Any healthy keys in the whole inventory (prioritizing gpt-6.1-sol)
  const allHealthySol = db.inventory.filter(i => 
    (i.model === 'gpt-6.1-sol' || (i.group && i.group.includes('gpt-6.1-sol'))) &&
    isKeyUpstreamHealthy(i.upstreamKey)
  );
  for (const item of allHealthySol) add(item);

  const anyHealthy = db.inventory.filter(i => isKeyUpstreamHealthy(i.upstreamKey));
  for (const item of anyHealthy) add(item);

  // 5. Fallback: all inventory items if everything was marked down
  for (const item of db.inventory) add(item);

  return candidates;
}

function selectInventoryItem(db, clientRecord) {
  const candidates = getCandidateInventoryItems(db, clientRecord);
  if (candidates.length === 0) return null;
  const item = candidates[roundRobinIndex % candidates.length];
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
      (clientRecord.userId && u.id === clientRecord.userId) ||
      (clientRecord.clerkUserId && (u.clerkUserId === clientRecord.clerkUserId || u.id === clientRecord.clerkUserId)) ||
      (clientRecord.customerContact && u.email && u.email.toLowerCase() === clientRecord.customerContact.toLowerCase())
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

  // Public models endpoint support for IDE discovery (Cline, Cursor, etc.)
  if ((req.path === '/v1/models' || req.path === '/models') && !match) {
    return res.json({
      object: 'list',
      data: [
        { id: 'gpt-6.1-sol', object: 'model', created: 1790640000, owned_by: 'subscapi', display_name: 'GPT-6.1 Sol (Flagship Code & Agents)' },
        { id: 'astra', object: 'model', created: 1788480000, owned_by: 'subscapi', display_name: 'ASTRA (Fast Creative & Code)' },
        { id: 'gpt-6', object: 'model', created: 1788480000, owned_by: 'subscapi', display_name: 'GPT-6 Astra' },
        { id: 'gpt-4o', object: 'model', created: 1738368000, owned_by: 'subscapi', display_name: 'GPT-4o (Compatible)' },
        { id: 'gpt-5.6-sol', object: 'model', created: 1780876800, owned_by: 'subscapi', display_name: 'GPT-5.6 Sol' }
      ]
    });
  }

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
    outgoingHeaders['user-agent'] = 'Cursor/0.45.0';
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
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    return executeChatCompletions(req.body, req, res, clientRecord, upstreamBaseUrl, upstreamKey, db);
  }

  if (req.readableEnded) {
    return executeChatCompletions({}, req, res, clientRecord, upstreamBaseUrl, upstreamKey, db);
  }

  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    try {
      const raw = Buffer.concat(chunks).toString('utf-8');
      const body = raw ? JSON.parse(raw) : {};
      return executeChatCompletions(body, req, res, clientRecord, upstreamBaseUrl, upstreamKey, db);
    } catch (parseErr) {
      return executeChatCompletions({}, req, res, clientRecord, upstreamBaseUrl, upstreamKey, db);
    }
  });
}

async function executeChatCompletions(body, req, res, clientRecord, upstreamBaseUrl, upstreamKey, db) {
  try {
    let input = '';
    if (Array.isArray(body.messages)) {
      const parts = [];
      for (const m of body.messages) {
        const role = m.role || 'user';
        if (typeof m.content === 'string') {
          parts.push(`[${role.toUpperCase()}]: ${m.content}`);
        } else if (Array.isArray(m.content)) {
          const textParts = m.content
            .filter(c => c && (c.type === 'text' || c.text))
            .map(c => c.text || JSON.stringify(c));
          parts.push(`[${role.toUpperCase()}]: ${textParts.join(' ')}`);
        } else if (m.content) {
          parts.push(`[${role.toUpperCase()}]: ${JSON.stringify(m.content)}`);
        }
      }
      input = parts.join('\n\n');
    } else if (body.prompt) {
      input = typeof body.prompt === 'string' ? body.prompt : JSON.stringify(body.prompt);
    } else {
      input = 'Hello';
    }

    const isStream = Boolean(body.stream);

    // Normalize model: prefer gpt-6.1-sol which is the active upstream working engine
    let targetModel = 'gpt-6.1-sol';
    const requestedModel = (body.model || clientRecord?.model || '').toLowerCase();
    if (requestedModel.includes('sol')) {
      targetModel = 'gpt-6.1-sol';
    }

    const responsesPayload = {
      model: targetModel,
      input: input,
      ...(isStream ? { stream: true } : {})
    };

    // Resilient failover loop across candidate inventory keys
    const candidates = getCandidateInventoryItems(db, clientRecord, body.model);
    const completionId = `chatcmpl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const nowSecs = Math.floor(Date.now() / 1000);

    let lastError = null;

    for (const candidate of candidates) {
      const key = candidate.upstreamKey;
      const cleanBase = (candidate.baseUrl || upstreamBaseUrl || 'https://api.xingchiapi.com/v1')
        .replace(/\/+$/, '')
        .replace(/\/v1$/, '');
      const targetUrl = `${cleanBase}/v1/responses`;

      try {
        const upstreamResp = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Cursor/0.45.0'
          },
          body: JSON.stringify(responsesPayload),
          signal: AbortSignal.timeout(120000) // 120 seconds generous timeout for large agent reasoning
        });

        if (!upstreamResp.ok) {
          const errorText = await upstreamResp.text();
          lastError = `Status ${upstreamResp.status}: ${errorText}`;
          if (upstreamResp.status >= 500 || upstreamResp.status === 503) {
            markKeyUpstreamDown(key);
          }
          continue; // Try next candidate key
        }

        // If clientRecord had a broken key pinned, heal it to the working key
        if (clientRecord && clientRecord.inventoryKeyId !== candidate.id) {
          clientRecord.inventoryKeyId = candidate.id;
          writeDB(db);
        }

        // STREAMING MODE (Used by Cline, Cursor, Windsurf, etc.)
        if (isStream && upstreamResp.body) {
          res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-transform');
          res.setHeader('Connection', 'keep-alive');
          res.setHeader('x-proxied-by', 'SubscAPI-HighSpeed-Gateway');
          res.setHeader('x-subsc-tier', clientRecord ? `${clientRecord.tier}USD` : 'Direct');
          res.flushHeaders?.();

          // Initial empty role chunk
          const initChunk = {
            id: completionId,
            object: 'chat.completion.chunk',
            created: nowSecs,
            model: body.model || targetModel,
            choices: [
              {
                index: 0,
                delta: { role: 'assistant', content: '' },
                finish_reason: null
              }
            ]
          };
          res.write(`data: ${JSON.stringify(initChunk)}\n\n`);

          const reader = upstreamResp.body.getReader();
          const decoder = new TextDecoder();
          let streamBuffer = '';
          let totalTokens = 50;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            streamBuffer += decoder.decode(value, { stream: true });
            const lines = streamBuffer.split('\n');
            streamBuffer = lines.pop(); // Retain incomplete line

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const jsonText = line.slice(6).trim();
                if (jsonText && jsonText !== '[DONE]') {
                  try {
                    const parsed = JSON.parse(jsonText);
                    if (parsed.type === 'response.output_text.delta' && parsed.delta) {
                      totalTokens += 1;
                      const sseChunk = {
                        id: completionId,
                        object: 'chat.completion.chunk',
                        created: nowSecs,
                        model: body.model || targetModel,
                        choices: [
                          {
                            index: 0,
                            delta: { content: parsed.delta },
                            finish_reason: null
                          }
                        ]
                      };
                      res.write(`data: ${JSON.stringify(sseChunk)}\n\n`);
                    }
                  } catch {}
                }
              }
            }
          }

          // Final stop chunk required by Cline
          const finalChunk = {
            id: completionId,
            object: 'chat.completion.chunk',
            created: nowSecs,
            model: body.model || targetModel,
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: 'stop'
              }
            ]
          };
          res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();

          if (clientRecord) {
            recordUsage(db, clientRecord, totalTokens);
          }
          return;
        }

        // NON-STREAMING MODE
        const upstreamData = await upstreamResp.json();
        const assistantText = upstreamData.output?.[0]?.content?.[0]?.text || '';
        const tokens = upstreamData.usage?.total_tokens || 120;

        if (clientRecord) {
          recordUsage(db, clientRecord, tokens);
        }

        res.setHeader('content-type', 'application/json');
        res.setHeader('x-proxied-by', 'SubscAPI-HighSpeed-Gateway');
        res.setHeader('x-subsc-tier', clientRecord ? `${clientRecord.tier}USD` : 'Direct');

        const chatCompletionResponse = {
          id: upstreamData.id || completionId,
          object: 'chat.completion',
          created: upstreamData.created_at || nowSecs,
          model: body.model || targetModel,
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
      } catch (fetchErr) {
        lastError = fetchErr.message;
        markKeyUpstreamDown(key);
      }
    }

    return res.status(502).json({
      error: {
        message: 'All upstream providers temporarily busy. Last response: ' + lastError,
        type: 'upstream_error'
      }
    });
  } catch (err) {
    console.error('Chat completions adapter error:', err);
    return res.status(500).json({
      error: {
        message: 'SubscAPI Gateway Error converting chat completion: ' + err.message,
        type: 'gateway_error'
      }
    });
  }
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
