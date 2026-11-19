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
  const userEmail = (req.headers['x-clerk-user-email'] || req.query.clerkEmail || '').trim().toLowerCase();
  const db = readDB();
  const validToken = db.settings.adminPassword || 'admin';
  const adminEmails = (db.settings.adminEmails || ['yahyaemad999@gmail.com']).map(e => e.toLowerCase());

  if ((userEmail && adminEmails.includes(userEmail)) || (token && (token === validToken || adminEmails.includes(token.toLowerCase())))) {
    return next();
  }

  return res.status(401).json({ success: false, error: 'غير مصرح لك بدخول لوحة الإدارة. مخصص فقط لـ yahyaemad999@gmail.com' });
}

// -----------------------------------------------------------------
// PUBLIC / CLIENT API (Compatible with Lovable & Legacy frontend)
// -----------------------------------------------------------------

// Get Public Packages & Stock Availability
app.get('/api/packages', (req, res) => {
  const db = readDB();
  
  // Calculate inventory counts per tier and per model
  const stockCounts = {};
  const modelStockCounts = {};

  (db.inventory || []).forEach(item => {
    if (item.status === 'available') {
      const tierKey = item.tier;
      stockCounts[tierKey] = (stockCounts[tierKey] || 0) + 1;

      const mKey = `${item.tier}_${(item.model || '').toLowerCase().trim()}`;
      modelStockCounts[mKey] = (modelStockCounts[mKey] || 0) + 1;
    }
  });

  const packagesList = (db.packages && db.packages.length > 0) ? db.packages : [
    {
      id: 'pkg_50',
      tier: 50,
      name: 'باقة الانطلاق 50$',
      nameEn: 'Starter 50$',
      duration: '7 أيام (7D)',
      badge: 'أسرع تفعيل',
      amount: 50,
      priceUSD: 50,
      priceEGP: 2700,
      description: 'رصيد 50$ كامل مخصص للأدوات وتطوير المشاريع الصغيرة والسريعة.',
      models: ['GPT ASTRA', 'gpt-6.1-sol'],
      features: [
        'رصيد استخدام حقيقي بقيمة 50 دولار',
        'صلاحية استخدام لمدة 7 أيام كاملة',
        'اختيار النموذج المناسب (ASTRA أو gpt-6.1-sol)',
        'متوافق مع Cursor وWindsurf وCline وRoo Code',
        'استجابة فورية بدون تقطيع وسرعة فائقة'
      ]
    },
    {
      id: 'pkg_100',
      tier: 100,
      name: 'باقة المحترفين 100$',
      nameEn: 'Pro 100$',
      duration: '30 يوم (30D)',
      badge: 'الأكثر طلباً ⭐',
      amount: 100,
      priceUSD: 100,
      priceEGP: 5400,
      description: 'رصيد 100$ كامل لدعم إنجاز المشروعات البرمجية والعمل اليومي المستمر.',
      models: ['GPT ASTRA', 'gpt-6.1-sol'],
      features: [
        'رصيد استخدام حقيقي بقيمة 100 دولار',
        'صلاحية استخدام لمدة 30 يوماً',
        'اختيار النموذج المناسب (ASTRA أو gpt-6.1-sol)',
        'سقف استخدام مفتوح ومعدل استدعاءات سريع',
        'دعم كامل لجميع أدوات التطوير ومكتبات OpenAI'
      ]
    },
    {
      id: 'pkg_250',
      tier: 250,
      name: 'باقة النخبة والفرق 250$',
      nameEn: 'Elite 250$',
      duration: '30 يوم (30D)',
      badge: 'أعلى أداء وأكبر حصة',
      amount: 250,
      priceUSD: 250,
      priceEGP: 13500,
      description: 'رصيد 250$ كامل للمطورين المحترفين وفرق العمل والشركات الناشئة.',
      models: ['GPT ASTRA', 'gpt-6.1-sol'],
      features: [
        'رصيد استخدام حقيقي ضخم بقيمة 250 دولار',
        'صلاحية استخدام لمدة 30 يوماً',
        'اختيار النموذج المناسب (ASTRA أو gpt-6.1-sol)',
        'أولوية معالجة قصوى وسرعة استجابة فائقة',
        'دعم فني مخصص على مدار الساعة'
      ]
    }
  ];

  const packagesWithStock = packagesList.map(pkg => {
    const tierStock = stockCounts[pkg.tier] || 0;
    const modelDetails = (pkg.models || ['GPT ASTRA', 'gpt-6.1-sol']).map(m => {
      const count = modelStockCounts[`${pkg.tier}_${m.toLowerCase().trim()}`] || 0;
      return {
        id: m,
        name: m,
        stockCount: count,
        inStock: count > 0
      };
    });

    return {
      ...pkg,
      amount: pkg.tier,
      stockCount: tierStock,
      stock: tierStock,
      availableStock: tierStock,
      inStock: tierStock > 0,
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

// Get Current User Subscription Status (via Clerk User ID or Email)
app.get('/api/user/subscription', (req, res) => {
  try {
    const clerkUserId = req.headers['x-clerk-user-id'] || req.query.clerkUserId;
    const email = req.headers['x-clerk-user-email'] || req.query.email;
    const db = readDB();

    if (!clerkUserId && !email) {
      return res.json({ success: true, status: 'unauthenticated' });
    }

    if (!db.users) db.users = [];
    if (!db.orders) db.orders = [];

    let user = db.users.find(u => (clerkUserId && u.clerkUserId === clerkUserId) || (email && u.email === email));
    
    // Also look for pending orders
    const pendingOrder = db.orders.find(o => 
      ((clerkUserId && o.clerkUserId === clerkUserId) || (email && o.customerEmail === email)) &&
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
    const balance = clientRecord ? clientRecord.remainingBalance : user.subscription.remainingBalance;
    const total = clientRecord ? clientRecord.initialBalance : user.subscription.initialBalance;

    res.json({
      success: true,
      status: 'active',
      subscription: {
        tier: user.subscription.tier,
        clientKey: user.subscription.clientKey,
        initialBalance: total,
        remainingBalance: balance,
        usedBalance: Number((total - balance).toFixed(4)),
        percentageRemaining: total > 0 ? Number(((balance / total) * 100).toFixed(1)) : 100,
        paidVia: user.subscription.paidVia,
        activatedAt: user.subscription.activatedAt,
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
