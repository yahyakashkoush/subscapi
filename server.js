const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { fork } = require('child_process');
const crypto = require('crypto');
const { readDB, writeDB, generateClientApiKey, provisionUserSubscription } = require('./lib/db');
const { BYBIT, createSha7nawyLink, checkSha7nawyStatus, verifyBybitDeposit } = require('./lib/payments');
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
  // Redirect legacy /admin to home page to keep obfuscated admin URL secret
  if (req.path === '/admin' || req.path === '/admin/') {
    return res.redirect(302, '/');
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

// Explicit high-speed endpoints for PowerShell & Shell Auto-Configurators
app.get(['/setup.ps1', '/install.ps1'], (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.sendFile(path.resolve(__dirname, 'public/setup.ps1'));
});

app.get('/setup.sh', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.sendFile(path.resolve(__dirname, 'public/setup.sh'));
});

const ADMIN_EMAILS = [
  'yahyaemad999@gmail.com',
  'yahyaemadkashkoush@gmail.com'
];

// Admin authentication middleware (supports session token, email, and secret token)
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.admin_token;
  const userEmail = (
    req.headers['x-user-email'] ||
    req.headers['x-clerk-user-email'] ||
    req.query.userEmail ||
    req.query.clerkEmail ||
    req.query.email ||
    ''
  ).trim().toLowerCase();

  const db = readDB();
  const configuredAdmins = (db.settings?.adminEmails || ADMIN_EMAILS).map(e => e.toLowerCase());

  // 1. Direct admin email check
  if (userEmail && (configuredAdmins.includes(userEmail) || ADMIN_EMAILS.includes(userEmail))) {
    return next();
  }

  // 2. Check session token from Authorization or header
  const authHeader = req.headers['authorization'] || '';
  const sessToken = authHeader.replace(/^Bearer\s+/i, '').trim() || req.headers['x-user-token'];
  if (sessToken && db.sessions && db.sessions[sessToken]) {
    const sess = db.sessions[sessToken];
    if (sess.isAdmin || sess.role === 'admin' || (sess.email && ADMIN_EMAILS.includes(sess.email.toLowerCase()))) {
      return next();
    }
  }

  // 3. Fallback admin password / token check
  const validToken = db.settings?.adminPassword || 'admin';
  if (token && (token === validToken || ADMIN_EMAILS.includes(token.toLowerCase()))) {
    return next();
  }

  return res.status(401).json({ success: false, error: 'غير مصرح لك بدخول لوحة الإدارة. مخصص فقط لإدارة النظام.' });
}

// -----------------------------------------------------------------
// NATIVE AUTHENTICATION SYSTEM (Clean, fast, no external watermarks)
// -----------------------------------------------------------------

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال البريد الإلكتروني' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const db = readDB();
    if (!db.users) db.users = [];
    if (!db.sessions) db.sessions = {};

    let user = db.users.find(u => u.email && u.email.toLowerCase() === cleanEmail);
    const isAdmin = ADMIN_EMAILS.includes(cleanEmail) || (user && user.role === 'admin');

    // If user does not exist but is one of the recognized admins, auto-create
    if (!user && isAdmin) {
      user = {
        id: 'usr_' + crypto.randomBytes(6).toString('hex'),
        name: cleanEmail.split('@')[0],
        email: cleanEmail,
        password: password || 'admin123',
        role: 'admin',
        createdAt: new Date().toISOString()
      };
      db.users.push(user);
    } else if (!user) {
      // Auto-provision user on first login if password is provided
      if (password && password.length >= 4) {
        user = {
          id: 'usr_' + crypto.randomBytes(6).toString('hex'),
          name: cleanEmail.split('@')[0],
          email: cleanEmail,
          password: password,
          role: 'user',
          createdAt: new Date().toISOString()
        };
        db.users.push(user);
      } else {
        return res.status(404).json({ success: false, error: 'الحساب غير موجود. يرجى إنشاء حساب جديد أولاً.' });
      }
    } else {
      // User exists, verify password if not admin bypass
      if (user.password && password && user.password !== password && !isAdmin) {
        return res.status(401).json({ success: false, error: 'كلمة المرور غير صحيحة.' });
      }
      if (isAdmin && user.role !== 'admin') {
        user.role = 'admin';
      }
    }

    // Generate clean session token
    const sessionToken = 'subsc_' + crypto.randomBytes(24).toString('hex');
    db.sessions[sessionToken] = {
      userId: user.id,
      email: user.email,
      role: user.role,
      isAdmin: isAdmin,
      createdAt: Date.now()
    };
    writeDB(db);

    return res.json({
      success: true,
      token: sessionToken,
      user: {
        id: user.id,
        name: user.name || user.email.split('@')[0],
        email: user.email,
        role: user.role,
        isAdmin: isAdmin
      }
    });
  } catch (err) {
    console.error('Auth login error:', err);
    return res.status(500).json({ success: false, error: 'فشل تسجيل الدخول. حاول مرة أخرى.' });
  }
});

app.post('/api/auth/register', (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const db = readDB();
    if (!db.users) db.users = [];
    if (!db.sessions) db.sessions = {};

    let user = db.users.find(u => u.email && u.email.toLowerCase() === cleanEmail);
    if (user) {
      return res.status(400).json({ success: false, error: 'هذا البريد مسجل بالفعل. يرجى تسجيل الدخول.' });
    }

    const isAdmin = ADMIN_EMAILS.includes(cleanEmail);
    user = {
      id: 'usr_' + crypto.randomBytes(6).toString('hex'),
      name: (name || cleanEmail.split('@')[0]).trim(),
      email: cleanEmail,
      password: password,
      role: isAdmin ? 'admin' : 'user',
      createdAt: new Date().toISOString()
    };
    db.users.push(user);

    const sessionToken = 'subsc_' + crypto.randomBytes(24).toString('hex');
    db.sessions[sessionToken] = {
      userId: user.id,
      email: user.email,
      role: user.role,
      isAdmin: isAdmin,
      createdAt: Date.now()
    };
    writeDB(db);

    return res.json({
      success: true,
      token: sessionToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isAdmin: isAdmin
      }
    });
  } catch (err) {
    console.error('Auth register error:', err);
    return res.status(500).json({ success: false, error: 'فشل إنشاء الحساب. حاول مرة أخرى.' });
  }
});

app.get('/api/auth/me', (req, res) => {
  try {
    const token = req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
                  req.headers['x-user-token'] ||
                  req.query.token;
    const email = (req.headers['x-user-email'] || req.query.email || '').trim().toLowerCase();

    const db = readDB();
    if (!db.users) db.users = [];
    if (!db.sessions) db.sessions = {};

    let user = null;
    if (token && db.sessions[token]) {
      const session = db.sessions[token];
      user = db.users.find(u => u.id === session.userId);
    } else if (email) {
      user = db.users.find(u => u.email && u.email.toLowerCase() === email);
    }

    if (!user) {
      return res.json({ success: false, user: null });
    }

    const isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase()) || user.role === 'admin';
    return res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name || user.email.split('@')[0],
        email: user.email,
        role: user.role,
        isAdmin: isAdmin,
        subscription: user.subscription || null
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  try {
    const token = req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
                  req.headers['x-user-token'] ||
                  req.body?.token;
    if (token) {
      const db = readDB();
      if (db.sessions && db.sessions[token]) {
        delete db.sessions[token];
        writeDB(db);
      }
    }
    return res.json({ success: true });
  } catch (err) {
    return res.json({ success: true });
  }
});

// -----------------------------------------------------------------
// PUBLIC / CLIENT API (Compatible with Lovable & Legacy frontend)
// -----------------------------------------------------------------

// Get Public Packages & Stock Availability
app.get('/api/packages', (req, res) => {
  const db = readDB();
  
  // Calculate total available upstream master pool balance
  const activeEngines = (db.inventory || []).filter(i => i.status === 'available');
  const totalUpstreamBalance = activeEngines.reduce((sum, item) => 
    sum + (Number(item.currentBalance) || Number(item.initialBalance) || 0), 0
  );

  const packagesList = (db.packages && db.packages.length > 0) ? db.packages : [
    {
      id: 'pkg_100',
      tier: 100,
      name: 'باقة المحترفين 100$',
      nameEn: 'Pro 100$',
      duration: '30 يوم (30D)',
      badge: 'الأكثر شعبية',
      amount: 100,
      priceUSD: 15,
      priceEGP: 800,
      description: 'رصيد 100$ كامل لدعم إنجاز المشروعات والعمل البرمجي اليومي المستمر.',
      models: ['gpt-6.1-sol', 'ASTRA', 'gpt-4o']
    },
    {
      id: 'pkg_250',
      tier: 250,
      name: 'باقة النخبة والمطورين 250$',
      nameEn: 'Elite 250$',
      duration: '30 يوم (30D)',
      badge: 'الأعلى طلباً للفرق',
      amount: 250,
      priceUSD: 30,
      priceEGP: 1600,
      description: 'رصيد 250$ كامل للمطورين المحترفين وفرق العمل والمشاريع الضخمة.',
      models: ['gpt-6.1-sol', 'ASTRA', 'gpt-4o']
    },
    {
      id: 'pkg_500',
      tier: 500,
      name: 'باقة الشركات والمؤسسات 500$',
      nameEn: 'Enterprise 500$',
      duration: '30 يوم (30D)',
      badge: 'أعلى سعة واستقرار',
      amount: 500,
      priceUSD: 55,
      priceEGP: 2950,
      description: 'رصيد 500$ كامل مخصص للشركات وتوليد كميات هائلة من الأكواد وبناء المنتجات.',
      models: ['gpt-6.1-sol', 'ASTRA', 'gpt-4o']
    }
  ];

  const packagesWithStock = packagesList.map(pkg => {
    // Keys are dynamically generated on-demand backed by our native cloud engine — unlimited stock
    const capacity = 9999;
    const modelDetails = (pkg.models || ['gpt-6.1-sol', 'ASTRA', 'gpt-4o']).map(m => {
      return {
        id: m,
        name: m,
        stockCount: capacity,
        inStock: true
      };
    });

    return {
      ...pkg,
      amount: pkg.tier,
      stockCount: capacity,
      stock: capacity,
      availableStock: capacity,
      inStock: true,
      modelDetails: modelDetails
    };
  });

  res.json({
    success: true,
    siteName: db.settings.siteName,
    egpRate: db.settings.egpRate || 54,
    packages: packagesWithStock
  });
});

// Subscribe & Auto-Provision Client API Key (Dynamically Generated on Demand)
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

    // Direct binding to native Subsc Master Cloud Engine
    const inventoryKeyId = 'inv_subsc_engine_cloud_1';

    // Generate new unique client key on demand
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

    // 1. Look for Client Key
    const client = db.clientKeys ? db.clientKeys.find(k => k.clientKey === cleanKey) : null;
    if (client) {
      const pkg = (db.packages && db.packages.find(p => p.id === client.packageId)) || { name: `باقة ${client.tier}$` };
      const remaining = Number(client.remainingBalance.toFixed(4));
      const used = Number((client.initialBalance - client.remainingBalance).toFixed(4));
      const percentageUsed = client.initialBalance > 0 ? Number(((used / client.initialBalance) * 100).toFixed(1)) : 0;
      const percentageRemaining = client.initialBalance > 0 ? Number(((remaining / client.initialBalance) * 100).toFixed(1)) : 100;

      return res.json({
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
          model: client.model || 'gpt-6.1-sol',
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
    }

    // 2. Look for Upstream / Inventory Key
    const inv = db.inventory ? db.inventory.find(i => i.upstreamKey === cleanKey || i.key === cleanKey) : null;
    if (inv) {
      const initial = inv.initialBalance || inv.tier || 100;
      const current = inv.currentBalance !== undefined ? inv.currentBalance : initial;
      const used = Number((initial - current).toFixed(4));
      const percentageUsed = initial > 0 ? Number(((used / initial) * 100).toFixed(1)) : 0;
      const percentageRemaining = initial > 0 ? Number(((current / initial) * 100).toFixed(1)) : 100;

      return res.json({
        success: true,
        remainingBalance: current,
        remaining: current,
        totalLimit: initial,
        limit: initial,
        used: used,
        percentage: percentageUsed,
        percentageRemaining: percentageRemaining,
        percentageUsed: percentageUsed,
        totalRequests: 0,
        status: inv.status || 'available',
        data: {
          clientKey: inv.upstreamKey || inv.key,
          customerName: inv.label || inv.group || 'مفتاح مخزون رئيسي',
          tier: inv.tier,
          model: inv.model || 'gpt-6.1-sol',
          packageName: inv.group || `باقة ${inv.tier}$`,
          initialBalance: initial,
          remainingBalance: current,
          usedBalance: used,
          percentageRemaining: percentageRemaining,
          percentageUsed: percentageUsed,
          status: inv.status || 'available',
          totalRequests: 0,
          createdAt: inv.addedAt || new Date().toISOString(),
          lastUsedAt: inv.lastChecked || 'نشط'
        }
      });
    }

    return res.status(404).json({
      success: false,
      error: 'المفتاح غير موجود في قاعدة بيانات SubscAPI. تأكد من صحة المفتاح المكتوب.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Legacy & Universal check-balance endpoint support
app.post('/api/check-balance', async (req, res) => {
  try {
    const { apiKey, baseUrl } = req.body;
    if (!apiKey) return res.status(400).json({ success: false, error: 'API key is required' });

    const cleanKey = apiKey.trim();
    const db = readDB();

    // Check SubscAPI database first
    const client = db.clientKeys ? db.clientKeys.find(k => k.clientKey === cleanKey) : null;
    const inv = db.inventory ? db.inventory.find(i => i.upstreamKey === cleanKey || i.key === cleanKey) : null;

    if (client || inv) {
      const initial = client ? client.initialBalance : (inv.initialBalance || inv.tier || 100);
      const remaining = client ? Number(client.remainingBalance.toFixed(4)) : (inv.currentBalance !== undefined ? inv.currentBalance : initial);
      const used = Number((initial - remaining).toFixed(4));
      const percentageUsed = initial > 0 ? Math.round((used / initial) * 100) : 0;
      const percentageRemaining = initial > 0 ? Math.round((remaining / initial) * 100) : 100;

      return res.json({
        success: true,
        provider: 'SubscAPI Gateway Engine',
        currency: 'USD',
        balance: {
          remaining: remaining,
          limit: initial,
          used: used,
          percentage_used: percentageUsed,
          percentage_remaining: percentageRemaining
        },
        status: client ? client.status : (inv.status || 'active'),
        isValid: true,
        days_until_expiry: 30,
        expires_at: null,
        models: [
          { id: 'gpt-6.1-sol', object: 'model' },
          { id: 'gpt-4o', object: 'model' }
        ]
      });
    }

    // Fallback: query upstream URL if provided and not SubscAPI key
    const targetUrl = (baseUrl || 'https://api.xingchiapi.com/v1').replace(/\/+$/, '');
    const usageResp = await fetch(`${targetUrl}/usage`, {
      headers: { 'Authorization': `Bearer ${cleanKey}` }
    }).catch(() => null);

    let modelsResp = await fetch(`${targetUrl}/models`, {
      headers: { 'Authorization': `Bearer ${cleanKey}` }
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
// PAYMENT & USER SUBSCRIPTION GATEWAY
// -----------------------------------------------------------------

// Get Deposit & Payment Info (Addresses, EGP Rate, InstaPay)
app.get('/api/payment/info', (req, res) => {
  const db = readDB();
  res.json({
    success: true,
    egpRate: db.settings.egpRate || 54,
    instapay: db.settings.instapayInfo || {
      name: 'SubscAPI Official',
      username: 'subscapi@instapay',
      phone: '01012345678'
    },
    bybitAddresses: BYBIT.depositAddresses
  });
});

// Get Current User Subscription Status (via Native Session, User ID or Email)
app.get('/api/user/subscription', (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || req.headers['x-clerk-user-id'] || req.query.userId || req.query.clerkUserId;
    const email = (req.headers['x-user-email'] || req.headers['x-clerk-user-email'] || req.query.email || '').trim().toLowerCase();
    const authHeader = req.headers['authorization'] || '';
    const sessToken = authHeader.replace(/^Bearer\s+/i, '').trim() || req.headers['x-user-token'];

    const db = readDB();
    if (!db.users) db.users = [];
    if (!db.orders) db.orders = [];

    let targetEmail = email;
    let targetUserId = userId;

    if (sessToken && db.sessions && db.sessions[sessToken]) {
      targetUserId = targetUserId || db.sessions[sessToken].userId;
      targetEmail = targetEmail || db.sessions[sessToken].email;
    }

    if (!targetUserId && !targetEmail) {
      return res.json({ success: true, status: 'unauthenticated' });
    }

    let user = db.users.find(u => 
      (targetUserId && (u.id === targetUserId || u.clerkUserId === targetUserId)) || 
      (targetEmail && u.email && u.email.toLowerCase() === targetEmail)
    );
    
    // Auto-link client key for admin or matching email if not already active
    if ((!user || !user.subscription || user.subscription.status !== 'active') && targetEmail) {
      const matchingClient = db.clientKeys.find(c => 
        (c.customerContact && c.customerContact.toLowerCase() === targetEmail) ||
        (targetUserId && (c.userId === targetUserId || c.clerkUserId === targetUserId)) ||
        (ADMIN_EMAILS.includes(targetEmail) && (c.clientKey === 'sk-subsc-50u-10fbe390209e9d80a4c608200db66bc8' || c.status === 'active'))
      );
      if (matchingClient) {
        if (!user) {
          user = {
            id: targetUserId || ('usr_' + crypto.randomBytes(6).toString('hex')),
            clerkUserId: targetUserId,
            email: targetEmail,
            name: matchingClient.customerName || 'مدير النظام',
            createdAt: new Date().toISOString()
          };
          db.users.push(user);
        }
        user.subscription = {
          status: 'active',
          tier: matchingClient.tier || 50,
          model: matchingClient.model || 'gpt-6.1-sol',
          clientKey: matchingClient.clientKey,
          initialBalance: matchingClient.initialBalance || 50,
          remainingBalance: matchingClient.remainingBalance || 50,
          paidVia: matchingClient.paidVia || 'admin',
          activatedAt: matchingClient.createdAt || new Date().toISOString()
        };
        matchingClient.userId = targetUserId || matchingClient.userId;
        matchingClient.clerkUserId = targetUserId || matchingClient.clerkUserId;
        matchingClient.customerContact = targetEmail;
        writeDB(db);
      }
    }

    // Also look for pending orders
    const pendingOrder = db.orders.find(o => 
      ((targetUserId && (o.userId === targetUserId || o.clerkUserId === targetUserId)) || 
       (targetEmail && o.customerEmail && o.customerEmail.toLowerCase() === targetEmail)) &&
      (o.status === 'pending_approval' || o.status === 'pending_payment')
    );

    if (!user || !user.subscription || user.subscription.status !== 'active') {
      if (pendingOrder) {
        return res.json({
          success: true,
          status: 'pending_approval',
          pendingOrder: {
            id: pendingOrder.id,
            tier: pendingOrder.tier,
            type: pendingOrder.type,
            createdAt: pendingOrder.createdAt,
            paymentUrl: pendingOrder.paymentUrl
          }
        });
      }
      return res.json({ success: true, status: 'none' });
    }

    // User is active, get live balance from clientKey
    const clientRecord = db.clientKeys.find(c => c.clientKey === user.subscription.clientKey);
    const balance = clientRecord ? Number(clientRecord.remainingBalance) : Number(user.subscription.remainingBalance || 0);
    const total = clientRecord ? Number(clientRecord.initialBalance) : Number(user.subscription.initialBalance || 0);
    const safeBalance = isNaN(balance) ? 0 : balance;
    const safeTotal = isNaN(total) || total <= 0 ? 50 : total;
    const used = Math.max(0, Number((safeTotal - safeBalance).toFixed(4)));

    res.json({
      success: true,
      status: 'active',
      subscription: {
        tier: user.subscription.tier || safeTotal,
        model: (clientRecord && clientRecord.model) || user.subscription.model || 'gpt-6.1-sol',
        clientKey: user.subscription.clientKey,
        initialBalance: safeTotal,
        remainingBalance: safeBalance,
        usedBalance: used,
        percentageRemaining: safeTotal > 0 ? Number(((safeBalance / safeTotal) * 100).toFixed(1)) : 100,
        paidVia: user.subscription.paidVia || 'direct',
        activatedAt: user.subscription.activatedAt || new Date().toISOString(),
        baseUrl: 'https://ai.subsc.tech/v1'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1. Create Vodafone Cash Payment Link (Sha7nawy Gateway v2)
app.post('/api/payment/vodafone/create', async (req, res) => {
  try {
    const { tier, model, customerName, customerEmail, clerkUserId } = req.body;
    const numTier = Number(tier) || 100;
    const db = readDB();
    const rate = db.settings.egpRate || 54;
    const amountEGP = numTier * rate;

    const orderId = `ORD-VF-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const returnUrl = `https://ai.subsc.tech/dashboard?orderId=${orderId}&vfcash=1`;

    const link = await createSha7nawyLink({
      orderId,
      amount: amountEGP,
      customerName: customerName || 'عميل SubscAPI',
      customerEmail: customerEmail || undefined,
      description: `اشتراك SubscAPI - باقة ${numTier}$ (${model || 'AI'})`,
      successUrl: returnUrl,
      failUrl: returnUrl,
      webhookUrl: `https://ai.subsc.tech/api/payment/webhook/sha7nawy`
    });

    if (!db.orders) db.orders = [];
    db.orders.unshift({
      id: orderId,
      type: 'vodafone_cash',
      tier: numTier,
      model: model || 'gpt-6.1-sol',
      amountUSD: numTier,
      amountEGP: amountEGP,
      customerName: customerName || 'عميل فودافون كاش',
      customerEmail: customerEmail || '',
      clerkUserId: clerkUserId || '',
      status: 'pending_payment',
      paymentUrl: link.paymentUrl,
      createdAt: new Date().toISOString()
    });
    writeDB(db);

    res.json({
      success: true,
      orderId,
      amountEGP,
      paymentUrl: link.paymentUrl
    });
  } catch (err) {
    console.error('Vodafone Cash link error:', err);
    res.status(500).json({ success: false, error: err.message || 'فشل توليد رابط دفع فودافون كاش' });
  }
});

// Check Vodafone Cash Payment Status
app.get('/api/payment/vodafone/check/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const db = readDB();
    if (!db.orders) db.orders = [];

    const order = db.orders.find(o => o.id === orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'الطلب غير موجود' });
    }

    if (order.status === 'completed') {
      const user = db.users.find(u => u.clerkUserId === order.clerkUserId || (order.customerEmail && u.email === order.customerEmail));
      return res.json({ success: true, status: 'completed', subscription: user?.subscription });
    }

    // Query Sha7nawy
    const statusData = await checkSha7nawyStatus(orderId);
    if (statusData.paid) {
      // Auto-Provision Key!
      const provisionResult = provisionUserSubscription(db, {
        clerkUserId: order.clerkUserId,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        tier: order.tier,
        model: order.model,
        paymentMethod: 'vodafone_cash',
        paymentRef: statusData.reference || orderId,
        amountPaid: order.amountEGP
      });

      order.status = 'completed';
      order.completedAt = new Date().toISOString();
      order.paymentReference = statusData.reference;
      writeDB(db);

      return res.json({
        success: true,
        status: 'completed',
        clientKey: provisionResult.clientKey,
        baseUrl: 'https://ai.subsc.tech/v1'
      });
    }

    res.json({
      success: true,
      status: order.status,
      message: 'في انتظار تأكيد السحب من فودافون كاش'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sha7nawy Webhook
app.post('/api/payment/webhook/sha7nawy', (req, res) => {
  try {
    const body = req.body || {};
    const data = body.data || {};
    const orderId = data.order_id;
    const status = data.status;

    if (orderId && (status === 'completed' || status === 'paid')) {
      const db = readDB();
      if (!db.orders) db.orders = [];
      const order = db.orders.find(o => o.id === orderId);
      if (order && order.status !== 'completed') {
        provisionUserSubscription(db, {
          clerkUserId: order.clerkUserId,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          tier: order.tier,
          paymentMethod: 'vodafone_cash',
          paymentRef: data.reference || data.transaction_id || orderId,
          amountPaid: order.amountEGP
        });
        order.status = 'completed';
        order.completedAt = new Date().toISOString();
        writeDB(db);
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.json({ success: false });
  }
});

// 2. Bybit USDT Deposit Verification
app.post('/api/payment/bybit/verify', async (req, res) => {
  try {
    const { txId, tier, model, clerkUserId, customerName, customerEmail } = req.body;
    const numTier = Number(tier) || 100;

    if (!txId) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال معرف المعاملة (TxID / Hash)' });
    }

    const cleanTxId = txId.trim();
    const db = readDB();
    if (!db.orders) db.orders = [];

    // Check if this txID was already used
    const existing = db.orders.find(o => o.txID && o.txID.toLowerCase() === cleanTxId.toLowerCase() && o.status === 'completed');
    if (existing) {
      return res.status(400).json({ success: false, error: 'معرف المعاملة هذا تم استخدامه مسبقاً وتفعيله.' });
    }

    // Verify on Bybit API
    const verifyResult = await verifyBybitDeposit({
      txId: cleanTxId,
      expectedMinAmount: numTier,
      expectedCoin: 'USDT'
    });

    if (!verifyResult.valid) {
      return res.status(400).json({ success: false, error: verifyResult.error });
    }

    // Verification passed! Provision key immediately
    const provisionResult = provisionUserSubscription(db, {
      clerkUserId,
      customerName,
      customerEmail,
      tier: numTier,
      model: model || 'gpt-6.1-sol',
      paymentMethod: 'bybit_crypto',
      paymentRef: verifyResult.txID,
      amountPaid: verifyResult.amount
    });

    const orderId = `ORD-BYBIT-${Date.now().toString(36)}`;
    db.orders.unshift({
      id: orderId,
      type: 'bybit_crypto',
      tier: numTier,
      model: model || 'gpt-6.1-sol',
      amountUSD: verifyResult.amount,
      txID: verifyResult.txID,
      chain: verifyResult.chain,
      customerName: customerName || 'عميل Bybit',
      customerEmail: customerEmail || '',
      clerkUserId: clerkUserId || '',
      status: 'completed',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    });

    writeDB(db);

    res.json({
      success: true,
      status: 'active',
      clientKey: provisionResult.clientKey,
      baseUrl: 'https://ai.subsc.tech/v1',
      message: 'تم التحقق من تحويل Bybit بنجاح وتم تفعيل اشتراكك وإصدار المفتاح! 🚀'
    });
  } catch (err) {
    console.error('Bybit verify error:', err);
    res.status(500).json({ success: false, error: err.message || 'حدث خطأ أثناء التحقق من Bybit' });
  }
});

// 3. InstaPay / Manual Transfer Submission
app.post('/api/payment/instapay/submit', (req, res) => {
  try {
    const { tier, model, clerkUserId, customerName, customerEmail, senderName, senderPhone, transactionRef, notes } = req.body;
    const numTier = Number(tier) || 100;

    if (!senderName && !transactionRef && !senderPhone) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال اسم المحول أو الرقم المرجعي للتحويل' });
    }

    const db = readDB();
    if (!db.orders) db.orders = [];
    if (!db.users) db.users = [];

    const orderId = `ORD-INSTA-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
    const rate = db.settings.egpRate || 54;
    const amountEGP = numTier * rate;

    const newOrder = {
      id: orderId,
      type: 'instapay_manual',
      tier: numTier,
      model: model || 'gpt-6.1-sol',
      amountUSD: numTier,
      amountEGP: amountEGP,
      customerName: customerName || senderName || 'عميل انستاباي',
      customerEmail: customerEmail || '',
      clerkUserId: clerkUserId || '',
      senderName: senderName || '',
      senderPhone: senderPhone || '',
      transactionRef: transactionRef || '',
      notes: notes || '',
      status: 'pending_approval',
      createdAt: new Date().toISOString()
    };

    db.orders.unshift(newOrder);

    // Update user state to pending_approval
    let user = db.users.find(u => (clerkUserId && u.clerkUserId === clerkUserId) || (customerEmail && u.email === customerEmail));
    if (!user) {
      user = {
        id: 'usr_' + crypto.randomBytes(6).toString('hex'),
        clerkUserId: clerkUserId || '',
        email: customerEmail || '',
        name: customerName || senderName,
        createdAt: new Date().toISOString()
      };
      db.users.push(user);
    }
    user.subscription = {
      status: 'pending_approval',
      tier: numTier,
      model: model || 'gpt-6.1-sol',
      orderId: orderId,
      requestedAt: new Date().toISOString()
    };

    writeDB(db);

    res.json({
      success: true,
      status: 'pending_approval',
      orderId,
      message: 'تم استلام بيانات التحويل بنجاح! طلبك قيد المراجعة والانتظار من الإدارة وسيتم تفعيل حسابك فور تأكيد التحويل.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Pending Orders
app.get('/api/admin/pending-orders', requireAdmin, (req, res) => {
  const db = readDB();
  if (!db.orders) db.orders = [];
  const pending = db.orders.filter(o => o.status === 'pending_approval');
  res.json({ success: true, orders: pending });
});

// Admin Approve Order
app.post('/api/admin/orders/:orderId/approve', requireAdmin, (req, res) => {
  try {
    const { orderId } = req.params;
    const db = readDB();
    if (!db.orders) db.orders = [];

    const order = db.orders.find(o => o.id === orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'الطلب غير موجود' });
    }

    const provisionResult = provisionUserSubscription(db, {
      clerkUserId: order.clerkUserId,
      customerName: order.customerName || order.senderName,
      customerEmail: order.customerEmail,
      tier: order.tier,
      model: order.model,
      paymentMethod: order.type || 'instapay_manual',
      paymentRef: order.transactionRef || order.id,
      amountPaid: order.amountEGP || order.tier
    });

    order.status = 'completed';
    order.approvedAt = new Date().toISOString();
    writeDB(db);

    res.json({
      success: true,
      message: 'تمت الموافقة وتفعيل الاشتراك وإصدار المفتاح للعميل بنجاح! 🚀',
      clientKey: provisionResult.clientKey
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Reject Order
app.post('/api/admin/orders/:orderId/reject', requireAdmin, (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const db = readDB();
    if (!db.orders) db.orders = [];

    const order = db.orders.find(o => o.id === orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'الطلب غير موجود' });
    }

    order.status = 'rejected';
    order.rejectReason = reason || 'لم يتم تأكيد وصول التحويل';
    order.rejectedAt = new Date().toISOString();

    // Reset user subscription status if pending
    const user = db.users.find(u => u.clerkUserId === order.clerkUserId || (order.customerEmail && u.email === order.customerEmail));
    if (user && user.subscription?.status === 'pending_approval') {
      user.subscription = { status: 'none', message: order.rejectReason };
    }

    writeDB(db);
    res.json({ success: true, message: 'تم رفض الطلب' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------
// CORPORATE / ENTERPRISE REGISTRATION REQUESTS (NO PAYMENT REQUIRED)
// -----------------------------------------------------------------

// Public Corporate Request Submission
app.post('/api/corporate/request', (req, res) => {
  try {
    const { companyName, contactName, phone, email, packageId, desiredQuota, notes } = req.body;
    if (!companyName || !phone) {
      return res.status(400).json({ success: false, error: 'اسم الشركة ورقم الهاتف/الواتساب مطلوبان' });
    }

    const db = readDB();
    if (!db.corporateRequests) db.corporateRequests = [];

    const newReq = {
      id: 'corp_' + crypto.randomBytes(6).toString('hex'),
      companyName: companyName.trim(),
      contactName: (contactName || '').trim(),
      phone: phone.trim(),
      email: (email || '').trim(),
      packageId: packageId || 'pkg_500',
      desiredQuota: Number(desiredQuota) || 500,
      notes: (notes || '').trim(),
      status: 'pending',
      createdAt: new Date().toISOString(),
      clientKey: null,
      approvedAt: null
    };

    db.corporateRequests.unshift(newReq);
    writeDB(db);

    res.json({
      success: true,
      message: 'تم استلام طلب شركتكم بنجاح! سيقوم فريق SubscAPI بالتواصل معكم وتفعيل الحساب مباشرة.',
      requestId: newReq.id
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Get Corporate Requests
app.get('/api/admin/corporate-requests', requireAdmin, (req, res) => {
  const db = readDB();
  res.json({ success: true, requests: db.corporateRequests || [] });
});

// Admin: Approve Corporate Request & Mint Key On-Demand
app.post('/api/admin/corporate-requests/:id/approve', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const db = readDB();
    if (!db.corporateRequests) db.corporateRequests = [];

    const reqItem = db.corporateRequests.find(r => r.id === id);
    if (!reqItem) {
      return res.status(404).json({ success: false, error: 'طلب الشركة غير موجود' });
    }

    const quota = Number(req.body.quota) || reqItem.desiredQuota || 500;
    const clientKey = generateClientApiKey(quota);

    const clientRecord = {
      id: 'cli_' + crypto.randomBytes(6).toString('hex'),
      clientKey: clientKey,
      inventoryKeyId: 'inv_subsc_engine_cloud_1',
      tier: quota,
      model: 'gpt-6.1-sol',
      customerName: `${reqItem.companyName} (${reqItem.contactName || 'مؤسسة'})`,
      customerContact: reqItem.phone || reqItem.email || '',
      status: 'active',
      initialBalance: quota,
      remainingBalance: quota,
      totalRequests: 0,
      totalTokens: 0,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      paidVia: 'corporate_approved',
      corporateRequestId: reqItem.id
    };

    if (!db.clientKeys) db.clientKeys = [];
    db.clientKeys.unshift(clientRecord);

    reqItem.status = 'approved';
    reqItem.clientKey = clientKey;
    reqItem.approvedAt = new Date().toISOString();
    reqItem.approvedQuota = quota;

    writeDB(db);

    res.json({
      success: true,
      message: `تم قبول وتفعيل اشتراك ${reqItem.companyName} وإصدار المفتاح بنجاح!`,
      clientKey: clientKey,
      quota: quota,
      request: reqItem
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Reject Corporate Request
app.post('/api/admin/corporate-requests/:id/reject', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const db = readDB();
    if (!db.corporateRequests) db.corporateRequests = [];

    const reqItem = db.corporateRequests.find(r => r.id === id);
    if (!reqItem) {
      return res.status(404).json({ success: false, error: 'الطلب غير موجود' });
    }

    reqItem.status = 'rejected';
    reqItem.rejectReason = reason || 'تم رفض الطلب من قبل الإدارة';
    reqItem.rejectedAt = new Date().toISOString();

    writeDB(db);
    res.json({ success: true, message: 'تم رفض طلب الشركة', request: reqItem });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Check Cloud Engine Live Health
app.get('/api/admin/engine-health', requireAdmin, async (req, res) => {
  try {
    const startTime = Date.now();
    const resp = await fetch('https://subsc-engine-test.onrender.com/health', { timeout: 6000 });
    const latency = Date.now() - startTime;
    const data = await resp.json();
    res.json({
      success: true,
      engine: data,
      latencyMs: latency,
      url: 'https://subsc-engine-test.onrender.com'
    });
  } catch (err) {
    res.json({
      success: false,
      error: err.message,
      url: 'https://subsc-engine-test.onrender.com'
    });
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
  
  const activeMasterEngines = (db.inventory || []).filter(i => i.status === 'available');
  const totalStockValue = activeMasterEngines.reduce((sum, i) => sum + (Number(i.currentBalance) || Number(i.initialBalance) || 0), 0);

  const totalAssignedValue = (db.inventory || [])
    .filter(i => i.status === 'assigned')
    .reduce((sum, i) => sum + (Number(i.initialBalance) || 0), 0);

  const totalRequests = (db.clientKeys || []).reduce((sum, c) => sum + (c.totalRequests || 0), 0);
  const totalTokens = (db.clientKeys || []).reduce((sum, c) => sum + (c.totalTokens || 0), 0);
  const totalDistributedBalance = (db.clientKeys || []).reduce((sum, c) => sum + (c.remainingBalance || 0), 0);

  const tierCapacities = {
    50: totalStockValue > 0 ? Math.floor(totalStockValue / 50) : 0,
    100: totalStockValue > 0 ? Math.floor(totalStockValue / 100) : 0,
    250: totalStockValue > 0 ? Math.floor(totalStockValue / 250) : 0,
    500: totalStockValue > 0 ? Math.floor(totalStockValue / 500) : 0
  };

  res.json({
    success: true,
    totalStockValue: Number(totalStockValue.toFixed(2)),
    totalValue: Number(totalStockValue.toFixed(2)),
    availableKeys: activeMasterEngines.length,
    masterEnginesCount: activeMasterEngines.length,
    activeClients: (db.clientKeys || []).filter(c => c.status === 'active').length,
    totalClients: (db.clientKeys || []).length,
    totalRequestsServed: totalRequests,
    totalTokensServed: totalTokens,
    totalDistributedBalance: Number(totalDistributedBalance.toFixed(2)),
    stockSummary: tierCapacities,
    stats: {
      totalStockValue: Number(totalStockValue.toFixed(2)),
      totalAssignedValue: Number(totalAssignedValue.toFixed(2)),
      totalInventoryKeys: db.inventory.length,
      availableKeysCount: activeMasterEngines.length,
      assignedKeysCount: db.inventory.filter(i => i.status === 'assigned').length,
      tierCounts: tierCapacities,
      totalClients: (db.clientKeys || []).length,
      totalRequestsServed: totalRequests,
      totalTokensServed: totalTokens
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
    const { upstreamKeys, tier, balance, baseUrl, label, group, model, duration } = req.body;
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

    const chosenModel = model || (label && label.includes('ASTRA') ? 'GPT ASTRA' : 'gpt-6.1-sol');
    const chosenDuration = duration || (numericTier === 50 ? '7D' : '30D');
    const chosenGroup = group || label || `${chosenModel} ${numericTier}$ ${chosenDuration}`;

    const added = [];
    for (const key of keyList) {
      const newInvItem = {
        id: 'inv_' + crypto.randomBytes(6).toString('hex'),
        upstreamKey: key,
        key: key,
        tier: numericTier,
        group: chosenGroup,
        model: chosenModel,
        duration: chosenDuration,
        initialBalance: initialBal,
        currentBalance: initialBal,
        balance: initialBal,
        currency: 'USD',
        baseUrl: targetUrl,
        status: 'available',
        label: chosenGroup,
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

// Sync All Inventory Keys Live
app.post('/api/admin/inventory/sync-all', requireAdmin, async (req, res) => {
  try {
    const db = readDB();
    const results = [];
    for (const item of db.inventory) {
      try {
        const target = (item.baseUrl || db.settings.defaultUpstreamUrl || 'https://api.xingchiapi.com/v1').replace(/\/+$/, '');
        const testUrl = `${target}/usage`;
        const resp = await fetch(testUrl, {
          headers: {
            'Authorization': `Bearer ${item.upstreamKey}`,
            'User-Agent': 'Cursor/0.45.0'
          },
          signal: AbortSignal.timeout(5000)
        });
        if (resp.ok) {
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
          results.push({ id: item.id, ok: true, balance: currentBal });
        } else {
          results.push({ id: item.id, ok: false, status: resp.status });
        }
      } catch (err) {
        results.push({ id: item.id, ok: false, error: err.message });
      }
    }
    writeDB(db);
    res.json({ success: true, count: results.length, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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

// Manually create a new client key from Admin
app.post('/api/admin/clients', requireAdmin, (req, res) => {
  try {
    const { customerName, customerContact, tier, customBalance, model } = req.body;
    const db = readDB();
    const numericTier = Number(tier) || 100;
    const numericBalance = Number(customBalance) || numericTier;
    const clientKey = generateClientApiKey(numericTier);

    // Pick healthy master engine
    const availableMasters = (db.inventory || []).filter(i => i.status === 'available');
    const assignedInv = availableMasters.length > 0 ? availableMasters[Math.floor(Math.random() * availableMasters.length)] : null;

    const newClient = {
      id: 'cli_' + crypto.randomBytes(6).toString('hex'),
      clientKey: clientKey,
      inventoryKeyId: assignedInv ? assignedInv.id : null,
      tier: numericTier,
      model: model || 'gpt-6.1-sol',
      customerName: customerName || 'عميل مخصص',
      customerContact: customerContact || '',
      status: 'active',
      initialBalance: numericBalance,
      remainingBalance: numericBalance,
      totalRequests: 0,
      totalTokens: 0,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      paidVia: 'admin_manual'
    };

    if (!db.clientKeys) db.clientKeys = [];
    db.clientKeys.unshift(newClient);
    writeDB(db);

    res.json({ success: true, client: newClient });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Adjust Client Balance
app.post('/api/admin/clients/:id/adjust-balance', requireAdmin, (req, res) => {
  try {
    const { amount, mode } = req.body; // mode: 'add' | 'set'
    const db = readDB();
    const client = db.clientKeys.find(c => c.id === req.params.id);
    if (!client) {
      return res.status(404).json({ success: false, error: 'العميل غير موجود' });
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount)) {
      return res.status(400).json({ success: false, error: 'المبلغ غير صالح' });
    }

    if (mode === 'add') {
      client.remainingBalance = Number((client.remainingBalance + numericAmount).toFixed(4));
    } else {
      client.remainingBalance = Number(numericAmount.toFixed(4));
    }

    if (client.remainingBalance > 0 && client.status === 'depleted') {
      client.status = 'active';
    }

    writeDB(db);
    res.json({ success: true, client });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete Client Key
app.delete('/api/admin/clients/:id', requireAdmin, (req, res) => {
  try {
    const db = readDB();
    const idx = db.clientKeys.findIndex(c => c.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'العميل غير موجود' });
    }
    const removed = db.clientKeys.splice(idx, 1)[0];
    writeDB(db);
    res.json({ success: true, removedId: removed.id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Ping / Healthcheck Master Engines
app.post('/api/admin/engines/healthcheck', requireAdmin, async (req, res) => {
  try {
    const db = readDB();
    const availableMasters = db.inventory.filter(i => i.status === 'available');
    const results = [];

    for (const engine of availableMasters) {
      const start = Date.now();
      const targetBase = (engine.baseUrl || 'https://subsc-engine-test.onrender.com/v1').replace(/\/+$/, '');
      try {
        const resp = await fetch(`${targetBase}/responses`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${engine.upstreamKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Cursor/0.45.0'
          },
          body: JSON.stringify({
            model: 'gpt-6.1-sol',
            input: 'Say ok in 1 word',
            stream: false
          }),
          signal: AbortSignal.timeout(10000)
        });
        const latency = Date.now() - start;
        results.push({
          id: engine.id,
          label: engine.label,
          status: resp.ok ? 'healthy' : 'error',
          statusCode: resp.status,
          latencyMs: latency
        });
      } catch (err) {
        results.push({
          id: engine.id,
          label: engine.label,
          status: 'timeout',
          error: err.message,
          latencyMs: Date.now() - start
        });
      }
    }

    res.json({ success: true, engines: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
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

// Package Management CRUD (Admin)
app.get('/api/admin/packages', requireAdmin, (req, res) => {
  const db = readDB();
  res.json({ success: true, packages: db.packages || [] });
});

app.post('/api/admin/packages', requireAdmin, (req, res) => {
  try {
    const { id, tier, name, nameEn, duration, badge, priceUSD, priceEGP, description, models, features } = req.body;
    const db = readDB();
    if (!db.packages) db.packages = [];

    const existingIdx = id ? db.packages.findIndex(p => p.id === id) : -1;
    const pkgData = {
      id: id || `pkg_${tier}_${Date.now().toString(36)}`,
      tier: Number(tier) || 100,
      name: name || `باقة ${tier}$`,
      nameEn: nameEn || `${tier}$ Tier`,
      duration: duration || '30 يوم',
      badge: badge || '',
      amount: Number(tier) || 100,
      priceUSD: Number(priceUSD) || Number(tier) || 100,
      priceEGP: Number(priceEGP) || (Number(tier) * (db.settings.egpRate || 54)),
      description: description || '',
      models: Array.isArray(models) ? models : (models ? String(models).split(',').map(m => m.trim()).filter(Boolean) : ['GPT ASTRA', 'gpt-6.1-sol']),
      features: Array.isArray(features) ? features : (features ? String(features).split('\n').map(f => f.trim()).filter(Boolean) : [])
    };

    if (existingIdx !== -1) {
      db.packages[existingIdx] = { ...db.packages[existingIdx], ...pkgData };
    } else {
      db.packages.push(pkgData);
    }

    writeDB(db);
    res.json({ success: true, package: pkgData, packages: db.packages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/packages/:id', requireAdmin, (req, res) => {
  const db = readDB();
  if (!db.packages) db.packages = [];
  db.packages = db.packages.filter(p => p.id !== req.params.id);
  writeDB(db);
  res.json({ success: true, packages: db.packages });
});

// Database Export / Backup endpoint for Admin
app.get('/api/admin/db/export', requireAdmin, (req, res) => {
  try {
    const db = readDB();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="subscapi-db-${timestamp}.json"`);
    res.send(JSON.stringify(db, null, 2));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Database Import / Restore endpoint for Admin
app.post('/api/admin/db/import', requireAdmin, (req, res) => {
  try {
    const incomingData = req.body;
    if (!incomingData || typeof incomingData !== 'object') {
      return res.status(400).json({ success: false, error: 'بيانات قاعدة البيانات غير صالحة' });
    }
    if (!incomingData.inventory && !incomingData.clientKeys) {
      return res.status(400).json({ success: false, error: 'الملف لا يحتوي على حقول SubscAPI المطلوبة' });
    }

    writeDB(incomingData);
    res.json({
      success: true,
      message: 'تمت استعادة قاعدة البيانات بنجاح',
      inventoryCount: incomingData.inventory ? incomingData.inventory.length : 0,
      clientKeysCount: incomingData.clientKeys ? incomingData.clientKeys.length : 0
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Database Status endpoint
app.get('/api/admin/db/status', requireAdmin, (req, res) => {
  const db = readDB();
  const isPersistent = fs.existsSync('/var/data');
  res.json({
    success: true,
    storage: isPersistent ? 'Render Persistent Disk (/var/data)' : 'Local File Storage',
    inventoryCount: db.inventory ? db.inventory.length : 0,
    clientKeysCount: db.clientKeys ? db.clientKeys.length : 0,
    usersCount: db.users ? db.users.length : 0,
    ordersCount: db.orders ? db.orders.length : 0
  });
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

// Start Server with High-Concurrency & Zero-Downtime Socket Configuration
const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 SubscAPI High-Capacity Platform is RUNNING!`);
  console.log(`🌐 Website & Frontend: http://localhost:${PORT}`);
  console.log(`⚡ API Gateway: http://localhost:${PORT}/v1`);
  console.log(`⚡ Max Concurrency: 5,000 Simultaneous Connections`);
  console.log(`=======================================================`);
});

// Production Keep-Alive & Timeout Tuning for 100+ Concurrent Users
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.maxConnections = 5000;
