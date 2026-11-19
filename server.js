const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { fork } = require('child_process');
const crypto = require('crypto');
const { readDB, writeDB, generateClientApiKey } = require('./lib/db');
const { handleProxy } = require('./lib/proxy');

const app = express();
const PORT = process.env.PORT || 3000;
const NITRO_PORT = process.env.NITRO_PORT || 3001;

app.use(cors());

// Intercept /v1 requests for transparent API proxying BEFORE express.json() parses body,
// so that streams and binary data are preserved verbatim!
app.use((req, res, next) => {
  if (req.path.startsWith('/v1')) {
    return handleProxy(req, res);
  }
  next();
});

// JSON body parser for normal API routes
app.use(express.json());

// Serve static assets from frontend build if available, otherwise from public
const frontendPublic = path.join(__dirname, 'frontend/.output/public');
if (fs.existsSync(frontendPublic)) {
  app.use(express.static(frontendPublic));
}
app.use(express.static(path.join(__dirname, 'public')));

// Admin authentication middleware
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.admin_token;
  const db = readDB();
  const validToken = db.settings.adminPassword || 'admin';

  if (!token || token !== validToken) {
    return res.status(401).json({ success: false, error: 'غير مصرح (Unauthorized admin access)' });
  }
  next();
}

// -----------------------------------------------------------------
// PUBLIC / CLIENT API (Compatible with Lovable & Legacy frontend)
// -----------------------------------------------------------------

// Get Public Packages & Stock Availability
app.get('/api/packages', (req, res) => {
  const db = readDB();
  
  // Calculate inventory counts per tier
  const stockCounts = { 100: 0, 200: 0, 500: 0 };
  db.inventory.forEach(item => {
    if (item.status === 'available') {
      stockCounts[item.tier] = (stockCounts[item.tier] || 0) + 1;
    }
  });

  const packagesWithStock = [
    {
      id: 'starter',
      tier: 100,
      stockCount: stockCounts[100] || 0,
      stock: stockCounts[100] || 0,
      availableStock: stockCounts[100] || 0
    },
    {
      id: 'pro',
      tier: 200,
      stockCount: stockCounts[200] || 0,
      stock: stockCounts[200] || 0,
      availableStock: stockCounts[200] || 0
    },
    {
      id: 'enterprise',
      tier: 500,
      stockCount: stockCounts[500] || 0,
      stock: stockCounts[500] || 0,
      availableStock: stockCounts[500] || 0
    },
    ...db.packages.map(pkg => ({
      ...pkg,
      stockCount: stockCounts[pkg.tier] || 0,
      stock: stockCounts[pkg.tier] || 0,
      availableStock: stockCounts[pkg.tier] || 0,
      inStock: (stockCounts[pkg.tier] || 0) > 0
    }))
  ];

  res.json({
    success: true,
    siteName: db.settings.siteName,
    egpRate: db.settings.egpRate || 54,
    packages: packagesWithStock
  });
});

// Subscribe & Auto-Provision Client API Key
app.post('/api/subscribe', (req, res) => {
  try {
    const { packageId, customerName, customerContact } = req.body;
    const db = readDB();

    // Map packageId to tier
    let tier = 100;
    let packageName = 'باقة المطورين 100$';
    if (packageId === 'pro' || packageId === 'pkg_200') {
      tier = 200;
      packageName = 'باقة المحترفين 200$';
    } else if (packageId === 'enterprise' || packageId === 'pkg_500') {
      tier = 500;
      packageName = 'باقة الشركات 500$';
    } else {
      const foundPkg = db.packages.find(p => p.id === packageId);
      if (foundPkg) {
        tier = foundPkg.tier;
        packageName = foundPkg.name;
      }
    }

    // Find available key in inventory for this tier
    let assignedInv = db.inventory.find(i => i.tier === tier && i.status === 'available');

    // If exact tier is out of stock, check if any available key exists
    if (!assignedInv) {
      assignedInv = db.inventory.find(i => i.status === 'available');
    }

    // Mark key as assigned if found
    let inventoryKeyId = null;
    if (assignedInv) {
      assignedInv.status = 'assigned';
      assignedInv.assignedTo = customerName || 'عميل جديد';
      assignedInv.assignedAt = new Date().toISOString();
      inventoryKeyId = assignedInv.id;
    }

    // Generate new unique client key
    const clientKey = generateClientApiKey(tier);
    const newClientRecord = {
      id: 'cli_' + crypto.randomBytes(6).toString('hex'),
      clientKey: clientKey,
      inventoryKeyId: inventoryKeyId,
      tier: tier,
      customerName: customerName || 'مستخدم SubscAPI',
      customerContact: customerContact || '',
      status: 'active',
      initialBalance: tier,
      remainingBalance: tier,
      totalRequests: 0,
      totalTokens: 0,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      packageId: packageId
    };

    db.clientKeys.unshift(newClientRecord);
    writeDB(db);

    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host');
    const proxyBaseUrl = `${protocol}://${host}/v1`;

    // Return both top-level and nested structure for 100% compatibility
    res.json({
      success: true,
      clientKey: clientKey,
      baseUrl: proxyBaseUrl,
      message: 'تم تفعيل باقتك وتوليد مفتاح الـ API بنجاح! 🚀',
      keyData: {
        clientKey: clientKey,
        tier: tier,
        balance: tier,
        currency: 'USD',
        packageName: packageName,
        baseUrl: proxyBaseUrl,
        customerName: newClientRecord.customerName,
        createdAt: newClientRecord.createdAt
      }
    });

  } catch (error) {
    console.error('Subscription error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Client Key Balance Checker
app.post('/api/client/check-key', (req, res) => {
  try {
    const { clientKey } = req.body;
    if (!clientKey) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال مفتاح الـ API' });
    }

    const cleanKey = clientKey.trim();
    const db = readDB();

    const client = db.clientKeys.find(k => k.clientKey === cleanKey);
    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'المفتاح غير موجود في قاعدة بيانات SubscAPI. تأكد من صحة المفتاح المكتوب.'
      });
    }

    const pkg = db.packages.find(p => p.id === client.packageId) || { name: `باقة ${client.tier}$` };
    const remaining = Number(client.remainingBalance.toFixed(4));
    const used = Number((client.initialBalance - client.remainingBalance).toFixed(4));
    const percentageUsed = client.initialBalance > 0 ? Number(((used / client.initialBalance) * 100).toFixed(1)) : 0;
    const percentageRemaining = client.initialBalance > 0 ? Number(((remaining / client.initialBalance) * 100).toFixed(1)) : 100;

    res.json({
      success: true,
      remainingBalance: remaining,
      remaining: remaining,
      totalLimit: client.initialBalance,
      limit: client.initialBalance,
      used: used,
      percentage: percentageUsed,
      percentageRemaining: percentageRemaining,
      percentageUsed: percentageUsed,
      totalRequests: client.totalRequests || 0,
      status: client.status,
      data: {
        clientKey: client.clientKey,
        customerName: client.customerName,
        tier: client.tier,
        packageName: pkg.name,
        initialBalance: client.initialBalance,
        remainingBalance: remaining,
        usedBalance: used,
        percentageRemaining: percentageRemaining,
        percentageUsed: percentageUsed,
        status: client.status,
        totalRequests: client.totalRequests || 0,
        createdAt: client.createdAt,
        lastUsedAt: client.lastUsedAt || 'لم يستخدم بعد'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Legacy check-balance endpoint support
app.post('/api/check-balance', async (req, res) => {
  try {
    const { apiKey, baseUrl } = req.body;
    if (!apiKey) return res.status(400).json({ success: false, error: 'API key is required' });

    const targetUrl = (baseUrl || 'https://api.xingchiapi.com/v1').replace(/\/+$/, '');
    const usageResp = await fetch(`${targetUrl}/usage`, {
      headers: { 'Authorization': `Bearer ${apiKey.trim()}` }
    }).catch(() => null);

    let modelsResp = await fetch(`${targetUrl}/models`, {
      headers: { 'Authorization': `Bearer ${apiKey.trim()}` }
    }).catch(() => null);

    let usageData = usageResp && usageResp.ok ? await usageResp.json() : null;
    let modelsData = modelsResp && modelsResp.ok ? await modelsResp.json() : { data: [] };

    let limit = usageData?.quota?.limit || 100;
    let remaining = usageData?.quota?.remaining !== undefined ? usageData.quota.remaining : 100;
    let used = usageData?.quota?.used || 0;

    res.json({
      success: true,
      provider: 'SubscAPI Gateway Engine',
      currency: 'USD',
      balance: {
        remaining: Number(remaining),
        limit: Number(limit),
        used: Number(used),
        percentage_used: limit > 0 ? Math.round((used / limit) * 100) : 0,
        percentage_remaining: limit > 0 ? Math.round((remaining / limit) * 100) : 100
      },
      status: 'active',
      isValid: true,
      days_until_expiry: usageData?.days_until_expiry || 29,
      expires_at: usageData?.expires_at || null,
      usage: usageData?.usage || {},
      daily_usage: usageData?.daily_usage || [],
      models: modelsData.data || []
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------
// ADMIN API (Compatible with Lovable & Legacy frontend)
// -----------------------------------------------------------------

// Admin Login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const db = readDB();
  if (password === db.settings.adminPassword) {
    res.json({ success: true, token: db.settings.adminPassword });
  } else {
    res.status(401).json({ success: false, error: 'كلمة المرور غير صحيحة' });
  }
});

// Admin Stats
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const db = readDB();
  
  const totalStockValue = db.inventory
    .filter(i => i.status === 'available')
    .reduce((sum, i) => sum + (Number(i.currentBalance) || Number(i.initialBalance) || 0), 0);

  const totalAssignedValue = db.inventory
    .filter(i => i.status === 'assigned')
    .reduce((sum, i) => sum + (Number(i.initialBalance) || 0), 0);

  const available100 = db.inventory.filter(i => i.tier === 100 && i.status === 'available').length;
  const available200 = db.inventory.filter(i => i.tier === 200 && i.status === 'available').length;
  const available500 = db.inventory.filter(i => i.tier === 500 && i.status === 'available').length;

  const totalRequests = db.clientKeys.reduce((sum, c) => sum + (c.totalRequests || 0), 0);

  res.json({
    success: true,
    totalStockValue: Number(totalStockValue.toFixed(2)),
    totalValue: Number(totalStockValue.toFixed(2)),
    availableKeys: db.inventory.filter(i => i.status === 'available').length,
    activeClients: db.clientKeys.length,
    stats: {
      totalStockValue: Number(totalStockValue.toFixed(2)),
      totalAssignedValue: Number(totalAssignedValue.toFixed(2)),
      totalInventoryKeys: db.inventory.length,
      availableKeysCount: db.inventory.filter(i => i.status === 'available').length,
      assignedKeysCount: db.inventory.filter(i => i.status === 'assigned').length,
      tierCounts: {
        100: available100,
        200: available200,
        500: available500
      },
      totalClients: db.clientKeys.length,
      totalRequestsServed: totalRequests
    }
  });
});

// Get Inventory Keys
app.get('/api/admin/inventory', requireAdmin, (req, res) => {
  const db = readDB();
  const formatted = db.inventory.map(item => ({
    ...item,
    key: item.upstreamKey,
    balance: Number(item.currentBalance) || Number(item.initialBalance) || 0
  }));
  res.json({ success: true, inventory: formatted });
});

// Add Key(s) to Inventory
app.post('/api/admin/inventory', requireAdmin, async (req, res) => {
  try {
    const { upstreamKeys, tier, balance, baseUrl, label } = req.body;
    const db = readDB();

    if (!upstreamKeys || (typeof upstreamKeys !== 'string' && !Array.isArray(upstreamKeys))) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال مفتاح واحد على الأقل' });
    }

    const keyList = Array.isArray(upstreamKeys) 
      ? upstreamKeys 
      : upstreamKeys.split('\n').map(k => k.trim()).filter(Boolean);

    const numericTier = Number(tier) || 100;
    const initialBal = Number(balance) || numericTier;
    const targetUrl = baseUrl ? baseUrl.trim() : (db.settings.defaultUpstreamUrl || 'https://api.xingchiapi.com/v1');

    const added = [];
    for (const key of keyList) {
      const newInvItem = {
        id: 'inv_' + crypto.randomBytes(6).toString('hex'),
        upstreamKey: key,
        key: key,
        tier: numericTier,
        initialBalance: initialBal,
        currentBalance: initialBal,
        balance: initialBal,
        currency: 'USD',
        baseUrl: targetUrl,
        status: 'available',
        label: label || `مفتاح ${numericTier}$ - دفعة ${new Date().toLocaleDateString('ar-EG')}`,
        addedAt: new Date().toISOString(),
        lastChecked: new Date().toISOString(),
        assignedTo: null
      };
      db.inventory.unshift(newInvItem);
      added.push(newInvItem);
    }

    writeDB(db);
    res.json({ success: true, count: added.length, added: added });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete Inventory Key
app.delete('/api/admin/inventory/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const idx = db.inventory.findIndex(i => i.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ success: false, error: 'المفتاح غير موجود' });
  }
  db.inventory.splice(idx, 1);
  writeDB(db);
  res.json({ success: true });
});

// Sync / Verify Upstream Live Balance
app.post('/api/admin/inventory/sync/:id', requireAdmin, async (req, res) => {
  try {
    const db = readDB();
    const item = db.inventory.find(i => i.id === req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'المفتاح غير موجود' });
    }

    const testUrl = `${item.baseUrl.replace(/\/+$/, '')}/usage`;
    const resp = await fetch(testUrl, {
      headers: {
        'Authorization': `Bearer ${item.upstreamKey}`,
        'User-Agent': 'Cursor/0.45.0'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!resp.ok) {
      throw new Error(`Upstream returned HTTP ${resp.status}`);
    }

    const usage = await resp.json();
    let currentBal = item.currentBalance;

    if (usage.quota && usage.quota.remaining !== undefined) {
      currentBal = Number(usage.quota.remaining);
    } else if (usage.remaining !== undefined) {
      currentBal = Number(usage.remaining);
    }

    item.currentBalance = currentBal;
    item.balance = currentBal;
    item.lastChecked = new Date().toISOString();
    writeDB(db);

    res.json({
      success: true,
      currentBalance: currentBal,
      balance: currentBal,
      raw: usage
    });
  } catch (err) {
    res.status(500).json({ success: false, error: `فشل التحقق من الرصيد الحي: ${err.message}` });
  }
});

// Get Clients Subscriptions
app.get('/api/admin/clients', requireAdmin, (req, res) => {
  const db = readDB();
  res.json({ success: true, clients: db.clientKeys });
});

// Toggle Client Key Status (active / suspended)
app.post('/api/admin/clients/toggle/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const client = db.clientKeys.find(c => c.id === req.params.id);
  if (!client) {
    return res.status(404).json({ success: false, error: 'العميل غير موجود' });
  }
  client.status = client.status === 'active' ? 'suspended' : 'active';
  writeDB(db);
  res.json({ success: true, newStatus: client.status });
});

// Settings Get & Update
app.get('/api/admin/settings', requireAdmin, (req, res) => {
  const db = readDB();
  res.json({ success: true, settings: db.settings });
});

app.post('/api/admin/settings', requireAdmin, (req, res) => {
  const db = readDB();
  const { defaultUpstreamUrl, defaultHeaders, adminPassword, egpRate } = req.body;
  if (defaultUpstreamUrl) db.settings.defaultUpstreamUrl = defaultUpstreamUrl.trim();
  if (defaultHeaders) db.settings.defaultHeaders = defaultHeaders;
  if (adminPassword) db.settings.adminPassword = adminPassword.trim();
  if (egpRate) db.settings.egpRate = Number(egpRate);
  writeDB(db);
  res.json({ success: true, settings: db.settings });
});

// -----------------------------------------------------------------
// NITRO SSR FRONTEND PROXY / FALLBACK
// -----------------------------------------------------------------
const nitroServerPath = path.join(__dirname, 'frontend/.output/server/index.mjs');
if (fs.existsSync(nitroServerPath)) {
  console.log(`Starting Nitro SSR server on internal port ${NITRO_PORT}...`);
  const nitroProcess = fork(nitroServerPath, [], {
    env: { ...process.env, PORT: String(NITRO_PORT), HOST: '127.0.0.1' },
    stdio: 'inherit'
  });
  nitroProcess.on('error', (err) => console.error('Nitro SSR error:', err));

  // Forward all non-API and non-V1 requests to Nitro SSR
  app.use((req, res) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/v1')) {
      return res.status(404).json({ error: 'Endpoint not found' });
    }

    const options = {
      hostname: '127.0.0.1',
      port: NITRO_PORT,
      path: req.originalUrl || req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: req.headers.host || '127.0.0.1'
      }
    };

    const pReq = http.request(options, (pRes) => {
      res.writeHead(pRes.statusCode, pRes.headers);
      pRes.pipe(res);
    });

    pReq.on('error', (err) => {
      if (!res.headersSent) {
        res.status(503).send('<html><body style="background:#080c14;color:#38bdf8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;"><div><h2>جاري تشغيل واجهة SubscAPI...</h2><p>يرجى تحديث الصفحة بعد ثوانٍ قليلة.</p></div></body></html>');
      }
    });

    req.pipe(pReq);
  });
}

// Start Server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 SubscAPI Unified Platform is RUNNING!`);
  console.log(`🌐 Website & Frontend: http://localhost:${PORT}`);
  console.log(`⚡ API Gateway: http://localhost:${PORT}/v1`);
  console.log(`=======================================================`);
});
