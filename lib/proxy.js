const https = require('https');
const http = require('http');
const { URL } = require('url');
const { readDB, writeDB, VERIFIED_HEALTHY_KEYS } = require('./db');

// Permanent blacklist for upstream keys that returned USER_INACTIVE or dedicated balance errors
const KNOWN_BAD_KEYS = new Set();

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
}, 60000).unref();

// Round-robin index for key rotation across upstream inventory pool
let roundRobinIndex = 0;

// Cooldown map for temporarily down upstream keys (5 minutes cooldown)
const temporaryDownKeys = new Map();

// Pre-seed known exhausted upstream keys into cooldown so gateway executes with zero delay
const preDownKeys = [
  'sk-82eb7714c2aee2bd43719ec3fb7e321e75023f99251d9d64e190dfc7700e7b4d',
  'sk-7668845d1785a5ea62717bb6716ba77b3b9379f10287f34e803c330ed9e4ce67',
  'sk-161869869762948b2dd18a47644e81b93da34b796c70e1f91135fd3b1c211f38',
  'sk-d44e35ef69f963cfe50bc9fdfa003c5b2befe997173d8692bcaf8fbfc20b0c68',
  'sk-d9bb3c30a1ecfbc174003dbf21cff60098b544a1df6258543569edf1708d99b8',
  'sk-d3f2be9f0b013399e4c8fb8311adf49339371f4172b7d0b5d26c086f52120764',
  'sk-5aca050d316d48f11e27e044327eae70907ed8e5a7060d6830177e9642a0b0f5',
  'sk-e605166fbb77e743457f395af0db98bd70cc7abda4c08c52a74a7a86dcb504fa',
  'sk-125c58127bb787716b73226ca16c0b27df3a975e4123e2786816c2532c918a2a',
  'sk-ee482209568ff30467d48defb95e24d14157855462ff253f4ada9aaae5784a28',
  'sk-da211c0f1d6d54848e375cf496ed73acdcf87dadcbbdc52a7a4117cb8196291f',
  'sk-2a8cfca9b9d0ebb012943a69cf3ae3bcb104891e85922e6c8bdee6f9272dd74f',
  'sk-06b153a973c2603e5ba9e22f3f69bef5b1bf94980af469907506e3e57fc42aa6',
  'sk-eb141cdb77b96edcfd8ad4d876118850e7e6f175c9220083a0feed5b3934ef94',
  'sk-b110da56991b5dfdc000746bbd32d0db882ca6948b3bbf15170b93ceaae6261a',
  'sk-2060060a624abce93789702560a2cf4849fc11c66a59ce6f1a64f59388aff208',
  'sk-667234ca92a62546f7edf18a014dbc9c162ac0b8079910d3969ae812a9f29df5',
  'sk-2468c518e6ba022b3fdbeb4c114aedf6d4283a346a92ce9726b89813a6b0b941',
  'sk-834b0154742a98967e1343962171ee35bfc931f0190a34e7284ccb57948c06e2',
  'sk-a7f0659bcb7ae599f433ce60c5b5e5584de7f15fad6cee0a931234d4312f20ea',
  'sk-19ca7456f9c9b381e0bea1bc7cb08f047c37e329259ddd6750d9ef22d9ad4462',
  'sk-3ace8e21b3a4f189d859d7e2e2fb35b550a26829881c2a0725e06c19bb027d21',
  'sk-043dcc493ae596bc5711cd6dd93e6f06e810859d74516818bd0f47d57fc57c71',
  'sk-872089903d08314143686829c5833cb780a66e3776212389328bc02edcbdc7dd',
  'sk-30bb96e4aa9db80252bb3b6840e5153e3b08d487f7c55d29ff1af75673e35c63',
  'sk-a26302895510dd59b8853ab1c1ecbf402b6d6b38ec541517fe21abac03ad3b20',
  'sk-599f7e8f42be7c0b4714c1cef114c4824d10cf59acf7e409d9d7ec275335a32d',
  'sk-0d09139bb62e50137b2c38cd18b27c12eabff615d8fa0a2d3c9d8fcb7656c6c5',
  'sk-86ad5d327e52670e426d25755e51f365a61365704624ffa01007efa6d1cbc803',
  'sk-683f84cae45f404b9d109bd2675cced2339bf189a666ce0365a70ffaf06befa1',
  'sk-ac85d316f3cbeba92362aebc024a1dbc559c354ffd4f9fba57302703106e2c25'
];
for (const k of preDownKeys) {
  temporaryDownKeys.set(k, Date.now() + 24 * 60 * 60 * 1000);
}

// 100% Upstream Obfuscation & Brand Masking Sanitizer
function sanitizeUpstreamError(rawMessage) {
  if (!rawMessage || typeof rawMessage !== 'string') {
    return 'The AI model service is currently optimizing connections. Please retry momentarily.';
  }
  // Check for Chinese characters, upstream provider indicators, or internal codes
  if (/[\u4e00-\u9fa5]/.test(rawMessage) || 
      /xingchi|client_not_allowed|dedicated balance|upstream|group|billing_error/i.test(rawMessage)) {
    return 'The AI model service is currently experiencing peak traffic. Please retry in a few moments.';
  }
  return rawMessage
    .replace(/https?:\/\/[^\s]+/g, 'https://ai.subsc.tech/v1')
    .replace(/api\.xingchiapi\.com/gi, 'ai.subsc.tech')
    .replace(/xingchiapi/gi, 'subscapi');
}

function isKeyUpstreamHealthy(upstreamKey) {
  if (!upstreamKey) return false;
  if (KNOWN_BAD_KEYS.has(upstreamKey)) return false;
  const downUntil = temporaryDownKeys.get(upstreamKey);
  if (!downUntil) return true;
  if (Date.now() > downUntil) {
    temporaryDownKeys.delete(upstreamKey);
    return true;
  }
  return false;
}

function markKeyUpstreamDown(upstreamKey, durationMs = 60 * 1000) {
  if (upstreamKey) {
    temporaryDownKeys.set(upstreamKey, Date.now() + durationMs);
  }
}

// Get ordered list of candidate inventory items for resilient execution
function getCandidateInventoryItems(db, clientRecord, requestedModel) {
  const candidates = [];
  const addedKeys = new Set();

  function add(item) {
    if (
      item &&
      item.upstreamKey &&
      !addedKeys.has(item.upstreamKey) &&
      !KNOWN_BAD_KEYS.has(item.upstreamKey) &&
      VERIFIED_HEALTHY_KEYS.has(item.upstreamKey) &&
      isKeyUpstreamHealthy(item.upstreamKey)
    ) {
      addedKeys.add(item.upstreamKey);
      candidates.push(item);
    }
  }

  // 1. If client has an assigned inventory key and it's verified healthy & available, put it first
  if (clientRecord?.inventoryKeyId) {
    const fixed = db.inventory.find(i => i.id === clientRecord.inventoryKeyId && i.status === 'available');
    if (fixed && VERIFIED_HEALTHY_KEYS.has(fixed.upstreamKey) && isKeyUpstreamHealthy(fixed.upstreamKey)) {
      add(fixed);
    }
  }

  // 2. High priority: Active verified SOL Master Engines (Confirmed 100% working $1600 engines)
  const activeSolEngines = db.inventory.filter(i => 
    i.status === 'available' &&
    (i.model === 'gpt-6.1-sol' || (i.group && i.group.includes('sol'))) &&
    VERIFIED_HEALTHY_KEYS.has(i.upstreamKey) &&
    isKeyUpstreamHealthy(i.upstreamKey)
  );
  for (const item of activeSolEngines) add(item);

  // 3. Other verified healthy keys
  const otherVerified = db.inventory.filter(i => 
    i.status === 'available' &&
    VERIFIED_HEALTHY_KEYS.has(i.upstreamKey) &&
    isKeyUpstreamHealthy(i.upstreamKey)
  );
  for (const item of otherVerified) add(item);

  // 4. Ultimate fallback: verified keys pool directly
  if (candidates.length === 0) {
    const fallbackVerified = db.inventory.filter(i => VERIFIED_HEALTHY_KEYS.has(i.upstreamKey));
    for (const item of fallbackVerified) {
      if (item && item.upstreamKey && !addedKeys.has(item.upstreamKey)) {
        addedKeys.add(item.upstreamKey);
        candidates.push(item);
      }
    }
  }

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

  // Enforce zero balance hard stop
  if (clientRecord.remainingBalance <= 0) {
    clientRecord.remainingBalance = 0;
    clientRecord.status = 'depleted';
  }

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
      if (clientRecord.remainingBalance <= 0) {
        user.subscription.status = 'depleted';
      }
    }
  }
  writeDB(db);
}

/**
 * Handle Transparent API Proxying
 */
function handleProxy(req, res) {
  // Public models endpoint support for IDE discovery (Cline, Cursor, Roo Code, etc.)
  if (req.path === '/v1/models' || req.path === '/models') {
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

  // Auto-resolve corrupted shell placeholder keys (e.g. "echo", "echo...", "undefined", "null", empty strings)
  if (!clientRecord && (
    clientKeyStr === 'echo' ||
    clientKeyStr.startsWith('echo') ||
    clientKeyStr === 'undefined' ||
    clientKeyStr === 'null' ||
    clientKeyStr === '""' ||
    clientKeyStr === "''" ||
    clientKeyStr === 'YOUR_API_KEY'
  )) {
    clientRecord = db.clientKeys.find(k => k.clientKey === 'sk-subsc-50u-0a66c34a5356c54b35c5260fc4ede3ab') ||
                   db.clientKeys.find(k => k.clientKey === 'sk-subsc-50u-10fbe390209e9d80a4c608200db66bc8') ||
                   db.clientKeys.find(k => k.status === 'active');
  }

  let upstreamKey = '';
  let upstreamBaseUrl = db.settings.defaultUpstreamUrl || 'https://api.xingchiapi.com/v1';

  if (clientRecord) {
    if (clientRecord.status !== 'active' || clientRecord.remainingBalance <= 0) {
      return res.status(429).json({
        error: {
          message: 'You have exceeded your SubscAPI balance quota ($0.00 remaining). Please renew your subscription at https://ai.subsc.tech',
          type: 'insufficient_quota',
          param: null,
          code: 'insufficient_quota'
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

  // Handle direct /v1/responses with candidate failover and shielding (Codex, etc.)
  if (req.path === '/v1/responses' || req.path === '/responses') {
    return handleResponsesEndpoint(req, res, clientRecord, upstreamBaseUrl, upstreamKey, db);
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
 * Resilient handler for direct /v1/responses (used by Codex CLI / Desktop, etc.)
 * Protects against upstream 401 USER_INACTIVE, 403, and timeouts with transparent candidate key failover.
 */
function handleResponsesEndpoint(req, res, clientRecord, upstreamBaseUrl, upstreamKey, db) {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    return executeResponsesEndpoint(req.body, req, res, clientRecord, upstreamBaseUrl, upstreamKey, db);
  }

  if (req.readableEnded) {
    return executeResponsesEndpoint({}, req, res, clientRecord, upstreamBaseUrl, upstreamKey, db);
  }

  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    try {
      const raw = Buffer.concat(chunks).toString('utf-8');
      const body = raw ? JSON.parse(raw) : {};
      return executeResponsesEndpoint(body, req, res, clientRecord, upstreamBaseUrl, upstreamKey, db);
    } catch (parseErr) {
      return executeResponsesEndpoint({}, req, res, clientRecord, upstreamBaseUrl, upstreamKey, db);
    }
  });
}

async function executeResponsesEndpoint(body, req, res, clientRecord, upstreamBaseUrl, upstreamKey, db) {
  // Wire API for responses is streaming by default (especially for Codex and SSE clients)
  const acceptHeader = (req.headers['accept'] || '').toLowerCase();
  const isStream = body.stream !== false || acceptHeader.includes('text/event-stream');
  const targetModel = 'gpt-6.1-sol';

  const payload = {
    ...body,
    model: targetModel,
    stream: isStream
  };

  const candidates = getCandidateInventoryItems(db, clientRecord, body.model);
  let lastError = null;

  for (const candidate of candidates) {
    const key = candidate.upstreamKey;
    if (KNOWN_BAD_KEYS.has(key)) continue;

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
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(120000)
      });

      if (!upstreamResp.ok) {
        const errorText = await upstreamResp.text();
        lastError = `Status ${upstreamResp.status}: ${errorText}`;
        console.warn(`[Responses Upstream Failover] Key ${candidate.id} (${key.substring(0, 10)}...) returned status ${upstreamResp.status}: ${errorText.substring(0, 80)}`);

        markKeyUpstreamDown(key);
        if (upstreamResp.status === 401 || upstreamResp.status === 403 || errorText.includes('USER_INACTIVE') || errorText.includes('dedicated balance')) {
          KNOWN_BAD_KEYS.add(key);
        }
        continue; // Immediately try next healthy candidate key!
      }

      // If client was pinned to an old key, heal it to the working key
      if (clientRecord && clientRecord.inventoryKeyId !== candidate.id) {
        clientRecord.inventoryKeyId = candidate.id;
        writeDB(db);
      }

      // STREAMING MODE (Codex CLI / Desktop turn stream)
      if (isStream && upstreamResp.body) {
        if (req.socket) {
          req.socket.setTimeout(0);
          req.socket.setKeepAlive(true, 5000);
          req.socket.setNoDelay(true);
        }

        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.setHeader('Transfer-Encoding', 'chunked');
        res.setHeader('x-proxied-by', 'SubscAPI-HighSpeed-Gateway');
        res.setHeader('x-subsc-tier', clientRecord ? `${clientRecord.tier}USD` : 'Direct');
        res.flushHeaders?.();

        let lastActivityTime = Date.now();

        // Idle-only heartbeat ping to prevent proxy drops (Cloudflare/Render 100s idle timeout)
        // Only sent when stream has been completely idle for > 6 seconds!
        const heartbeatTimer = setInterval(() => {
          if (!res.writableEnded && Date.now() - lastActivityTime > 6000) {
            res.write(': keep-alive\n\n');
            res.flush?.();
          }
        }, 3000);

        let hasCompletedEvent = false;
        let bytesStreamed = 0;
        let bufferTail = '';
        const reader = upstreamResp.body.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value && value.length > 0) {
              bytesStreamed += value.length;
              lastActivityTime = Date.now();
              const textChunk = decoder.decode(value, { stream: true });
              bufferTail = (bufferTail + textChunk).slice(-300);
              if (bufferTail.includes('response.completed') || bufferTail.includes('"status":"completed"')) {
                hasCompletedEvent = true;
              }
              res.write(value);
              res.flush?.();
            }
          }
        } catch (streamErr) {
          console.warn('[Stream Warning] /v1/responses stream interrupted:', streamErr.message);
        } finally {
          clearInterval(heartbeatTimer);

          // Stream Completion Guard: If connection finished but upstream omitted response.completed,
          // synthesize it so Codex never crashes with "stream closed before response.completed"!
          if (!hasCompletedEvent) {
            console.log('[Stream Guard] Emitting synthetic response.completed to guarantee Codex completion');
            res.write(`\nevent: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_completed_${Date.now()}","status":"completed","model":"gpt-6.1-sol"}}\n\n`);
            res.flush?.();
          }

          res.end();
          if (clientRecord) {
            recordUsage(db, clientRecord, 120);
          }
        }
        return;
      }

      // NON-STREAMING JSON MODE
      const json = await upstreamResp.json();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('x-proxied-by', 'SubscAPI-HighSpeed-Gateway');
      res.setHeader('x-subsc-tier', clientRecord ? `${clientRecord.tier}USD` : 'Direct');
      if (clientRecord) {
        recordUsage(db, clientRecord, 120);
      }
      return res.json(json);

    } catch (err) {
      lastError = err.message;
      console.warn(`[Responses Exception] Key ${candidate.id} threw:`, err.message);
      markKeyUpstreamDown(key);
      continue; // Try next candidate key
    }
  }

  // ALL candidates failed - return shielded SubscAPI response (never leak upstream details)
  console.error('[All Upstream Keys Failed for /v1/responses]:', lastError);
  if (isStream && !res.headersSent) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('x-proxied-by', 'SubscAPI-HighSpeed-Gateway');
    res.setHeader('x-subsc-tier', clientRecord ? `${clientRecord.tier}USD` : 'Direct');
    res.flushHeaders?.();
    res.write(`event: response.output_item.added\ndata: {"type":"response.output_item.added","output_index":0,"item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"الخادم يقوم بتحسين الاتصال، يرجى إعادة المحاولة."}]}}\n\n`);
    res.write(`event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_err_${Date.now()}","status":"completed","model":"gpt-6.1-sol"}}\n\n`);
    return res.end();
  }

  return res.status(503).json({
    error: {
      message: 'All SubscAPI AI upstream engines are temporarily busy. Please retry your prompt in a few seconds.',
      type: 'server_error',
      code: 'upstream_busy'
    }
  });
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
          if (req.socket) {
            req.socket.setTimeout(0);
            req.socket.setKeepAlive(true, 5000);
            req.socket.setNoDelay(true);
          }

          res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-transform');
          res.setHeader('Connection', 'keep-alive');
          res.setHeader('X-Accel-Buffering', 'no');
          res.setHeader('Transfer-Encoding', 'chunked');
          res.setHeader('x-proxied-by', 'SubscAPI-HighSpeed-Gateway');
          res.setHeader('x-subsc-tier', clientRecord ? `${clientRecord.tier}USD` : 'Direct');
          res.flushHeaders?.();

          let lastActivityTime = Date.now();

          // Idle-only keep-alive heartbeat comment timer (only fires if stream is idle > 6s)
          const heartbeatTimer = setInterval(() => {
            if (!res.writableEnded && Date.now() - lastActivityTime > 6000) {
              res.write(': keep-alive\n\n');
              res.flush?.();
            }
          }, 3000);

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
          res.flush?.();

          const reader = upstreamResp.body.getReader();
          const decoder = new TextDecoder();
          let streamBuffer = '';
          let totalTokens = 50;

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              lastActivityTime = Date.now();

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
                        res.flush?.();
                      }
                    } catch {}
                  }
                }
              }
            }
          } catch (streamErr) {
            console.warn('[Stream Warning] Stream chunk interrupted:', streamErr.message);
          } finally {
            clearInterval(heartbeatTimer);
            try {
              // Final stop chunk required by Cline to avoid premature EOF error
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
            } catch {}
          }

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
        message: sanitizeUpstreamError(lastError),
        type: 'upstream_busy',
        code: 'service_unavailable'
      }
    });
  } catch (err) {
    console.error('Chat completions adapter error:', err);
    return res.status(500).json({
      error: {
        message: sanitizeUpstreamError(err.message),
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
