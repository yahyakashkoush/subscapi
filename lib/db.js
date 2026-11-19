const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_FILE = path.join(__dirname, '../data/db.json');

// Initial Seed Data
const defaultData = {
  settings: {
    siteName: 'SubscAPI',
    siteDomain: 'subscapi.com',
    defaultUpstreamUrl: 'https://api.xingchiapi.com/v1',
    defaultHeaders: {
      'x-openai-actor-authorization': 'local-image-extension'
    },
    adminPassword: 'admin', // Can be changed in settings
    egpRate: 54
  },
  inventory: [
    {
      id: 'inv_' + crypto.randomBytes(6).toString('hex'),
      upstreamKey: 'sk-e808c6ee360b9fbc37273c7d4b905a12fd91eca3814655521e5ac3c3c6ff8901',
      tier: 100,
      initialBalance: 100.0,
      currentBalance: 99.9996,
      currency: 'USD',
      baseUrl: 'https://api.xingchiapi.com/v1',
      status: 'available', // available | assigned | depleted | reserved
      label: 'مفتاح Starters 100$ - دفعة أولى (متاح)',
      addedAt: new Date().toISOString(),
      lastChecked: new Date().toISOString(),
      assignedTo: null
    },
    {
      id: 'inv_' + crypto.randomBytes(6).toString('hex'),
      upstreamKey: 'sk-e808c6ee360b9fbc37273c7d4b905a12fd91eca3814655521e5ac3c3c6ff8902',
      tier: 200,
      initialBalance: 200.0,
      currentBalance: 200.0,
      currency: 'USD',
      baseUrl: 'https://api.xingchiapi.com/v1',
      status: 'available',
      label: 'مفتاح Pro 200$ - دفعة أولى (متاح)',
      addedAt: new Date().toISOString(),
      lastChecked: new Date().toISOString(),
      assignedTo: null
    },
    {
      id: 'inv_' + crypto.randomBytes(6).toString('hex'),
      upstreamKey: 'sk-e808c6ee360b9fbc37273c7d4b905a12fd91eca3814655521e5ac3c3c6ff8903',
      tier: 500,
      initialBalance: 500.0,
      currentBalance: 500.0,
      currency: 'USD',
      baseUrl: 'https://api.xingchiapi.com/v1',
      status: 'available',
      label: 'مفتاح Enterprise 500$ - دفعة أولى (متاح)',
      addedAt: new Date().toISOString(),
      lastChecked: new Date().toISOString(),
      assignedTo: null
    }
  ],
  clientKeys: [],
  packages: [
    {
      id: 'pkg_100',
      tier: 100,
      name: 'باقة المطورين (Starter)',
      nameEn: 'Starter 100$',
      badge: 'الأنسب للبداية',
      priceUSD: 100,
      priceEGP: 5400,
      description: 'رصيد 100$ كامل لدعم نماذج الذكاء الاصطناعي الأقوى بدون قيود على عدد الطلبات.',
      features: [
        'رصيد 100 دولار كامل غير منقوص',
        'دعم نموذج gpt-6.1-sol وجميع نماذج OpenAI',
        'توجيه مباشر فائق السرعة (Latency < 20ms)',
        'متوافق 100% مع Cursor و Cline و VSCode و Python',
        'تسليم وتفعيل فوري للمفتاح في ثوانٍ'
      ],
      popular: false
    },
    {
      id: 'pkg_200',
      tier: 200,
      name: 'باقة المحترفين (Pro Developer)',
      nameEn: 'Pro 200$',
      badge: 'الأكثر طلباً 🔥',
      priceUSD: 200,
      priceEGP: 10800,
      description: 'الباقة المفضلة للمبرمجين والمطورين وفرق العمل لإنجاز المشاريع البرمجية بكفاءة عالية.',
      features: [
        'رصيد 200 دولار كامل للمشاريع المكثفة',
        'حدود طلبات مضاعفة RPM / TPM لسرعة البرمجة',
        'دعم الـ Streaming بدون أي تقطيع أو تأخير',
        'أولوية توجيه السيرفرات (High Priority Routing)',
        'تسليم وتفعيل فوري للمفتاح'
      ],
      popular: true
    },
    {
      id: 'pkg_500',
      tier: 500,
      name: 'باقة الشركات والاستوديوهات (Enterprise)',
      nameEn: 'Enterprise 500$',
      badge: 'أعلى قيمة وحصة 👑',
      priceUSD: 500,
      priceEGP: 27000,
      description: 'حصة ضخمة صممت خصيصاً للشركات واستخدام الوكلاء المتعددين (Multi-Agents) والمهام الكبرى.',
      features: [
        'رصيد 500 دولار كامل بدون أي اقتطاعات',
        'أعلى سقف لتدفق التوكنات (Unlimited Concurrency)',
        'سيرفرات مخصصة تضمن استقرار بنسبة 99.99%',
        'دعم فني خاص على مدار الساعة',
        'تسليم وتفعيل فوري للمفتاح'
      ],
      popular: false
    }
  ]
};

// Read Database
function readDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      writeDB(defaultData);
      return defaultData;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    console.error('Error reading db.json:', error);
    return defaultData;
  }
}

// Write Database
function writeDB(data) {
  try {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Error writing db.json:', error);
    return false;
  }
}

// Generate secure API key for clients
function generateClientApiKey(tier) {
  const hash = crypto.randomBytes(16).toString('hex');
  return `sk-subsc-${tier}u-${hash}`;
}

// Allocate a key from inventory and activate a user's subscription
function provisionUserSubscription(db, { clerkUserId, customerName, customerEmail, tier, paymentMethod, paymentRef, amountPaid }) {
  if (!db.users) db.users = [];
  if (!db.orders) db.orders = [];
  if (!db.clientKeys) db.clientKeys = [];

  // Find available key in inventory matching tier, or any available key
  const inv = db.inventory.find(i => i.tier === tier && i.status === 'available') ||
              db.inventory.find(i => i.status === 'available');

  let invId = null;
  if (inv) {
    inv.status = 'assigned';
    inv.assignedTo = customerName || customerEmail || 'مستخدم جديد';
    inv.assignedAt = new Date().toISOString();
    invId = inv.id;
  }

  // Generate new unique client key
  const clientKey = generateClientApiKey(tier);
  const newClientRecord = {
    id: 'cli_' + crypto.randomBytes(6).toString('hex'),
    clientKey: clientKey,
    inventoryKeyId: invId,
    tier: tier,
    customerName: customerName || 'مستخدم SubscAPI',
    customerContact: customerEmail || '',
    clerkUserId: clerkUserId || '',
    status: 'active',
    initialBalance: tier,
    remainingBalance: tier,
    totalRequests: 0,
    totalTokens: 0,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    paidVia: paymentMethod || 'direct',
    paymentRef: paymentRef || ''
  };

  db.clientKeys.unshift(newClientRecord);

  // Update or insert user
  let user = null;
  if (clerkUserId) {
    user = db.users.find(u => u.clerkUserId === clerkUserId);
  }
  if (!user && customerEmail) {
    user = db.users.find(u => u.email === customerEmail);
  }

  if (!user) {
    user = {
      id: 'usr_' + crypto.randomBytes(6).toString('hex'),
      clerkUserId: clerkUserId || '',
      email: customerEmail || '',
      name: customerName || 'مستخدم SubscAPI',
      createdAt: new Date().toISOString()
    };
    db.users.push(user);
  } else {
    if (clerkUserId) user.clerkUserId = clerkUserId;
    if (customerName) user.name = customerName;
    if (customerEmail) user.email = customerEmail;
  }

  user.subscription = {
    status: 'active',
    tier: tier,
    clientKey: clientKey,
    initialBalance: tier,
    remainingBalance: tier,
    paidVia: paymentMethod,
    paymentRef: paymentRef,
    activatedAt: new Date().toISOString()
  };

  return {
    clientKey,
    user,
    clientRecord: newClientRecord
  };
}

module.exports = {
  readDB,
  writeDB,
  generateClientApiKey,
  provisionUserSubscription
};
