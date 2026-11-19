const crypto = require('crypto');

// Sha7nawy Gateway Config
const SHA7NAWY = {
  baseUrl: process.env.SHA7NAWY_BASE_URL || 'https://gate.sha7nawy.com',
  publicKey: process.env.SHA7NAWY_PUBLIC_KEY || 'm8ah6ClVOBL9c2kFYP5G62TlIfn1mKpavCXL9NCy5JzjrWOdk4ACMMBsisa7GXbHoKdcpZ4z4L2mn4nHOSNTnK8PNIDLi1l4UXPS',
  secretKey: process.env.SHA7NAWY_SECRET_KEY || 'q9RzRj3eygz5UyQ9S82XU3n1bK4mSMR7kiRFo6qY6VTtfkxUqJmQRrxuXIV4Vn6pbvxiZt6o5BdTgHLHwl8x90TUO4lq6gMEDVCz'
};

// Bybit Config
const BYBIT = {
  baseUrl: 'https://api.bybit.com',
  apiKey: process.env.BYBIT_API_KEY || 'VDAPFWRYn5EsG8KEp6',
  apiSecret: process.env.BYBIT_API_SECRET || 'Yy1ncuiRYWkE7cLJRfYQVhaazE4wvkpD96b7',
  depositAddresses: {
    TRC20: {
      chain: 'TRX',
      network: 'TRON (TRC20)',
      address: 'TJFRGx8Jj9ohxyxh6tJYAcvMBEY7fwEdwP',
      recommended: true
    },
    BEP20: {
      chain: 'BSC',
      network: 'BNB Smart Chain (BEP20)',
      address: '0xf216f46778047d7f566d135c0abf50d6765586e7',
      recommended: true
    },
    POLYGON: {
      chain: 'MATIC',
      network: 'Polygon PoS',
      address: '0xf216f46778047d7f566d135c0abf50d6765586e7'
    },
    SOL: {
      chain: 'SOL',
      network: 'Solana',
      address: 'J1GDckg4kV8qLZxH1R57DEzQ3yrMvAimLvhjrUmF1x2D'
    }
  }
};

/**
 * Create Payment Link on Sha7nawy Gate
 */
async function createSha7nawyLink({ orderId, amount, customerName, customerEmail, description, successUrl, failUrl, webhookUrl }) {
  const payload = {
    order_id: orderId,
    amount: Number(amount),
    methods: ['vf_cash'],
    description: description || 'اشتراك SubscAPI للذكاء الاصطناعي',
    customer_name: customerName || 'عميل SubscAPI',
    customer_email: customerEmail || undefined,
    success_url: successUrl,
    fail_url: failUrl,
    webhook_url: webhookUrl
  };

  const response = await fetch(`${SHA7NAWY.baseUrl}/api/v2/payment-link/create`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': SHA7NAWY.publicKey
    },
    body: JSON.stringify(payload)
  });

  const resJson = await response.json();
  if (!response.ok || !resJson.success) {
    throw new Error(resJson.message || resJson.error || 'فشل إنشاء رابط دفع فودافون كاش');
  }

  return {
    token: resJson.data.token,
    paymentUrl: resJson.data.payment_url,
    orderId: resJson.data.order_id,
    amount: resJson.data.amount,
    currency: resJson.data.currency,
    status: resJson.data.status
  };
}

/**
 * Check Payment Status on Sha7nawy Gate (by order_id)
 */
async function checkSha7nawyStatus(orderId) {
  const response = await fetch(`${SHA7NAWY.baseUrl}/api/v2/payment-link/info/${orderId}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Authorization': SHA7NAWY.secretKey
    }
  });

  if (!response.ok) {
    return { paid: false, status: 'not_found' };
  }

  const resJson = await response.json();
  const data = resJson.data || resJson;
  const isPaid = data.status === 'paid' || data.status === 'completed';

  return {
    paid: isPaid,
    status: data.status,
    amount: data.amount,
    currency: data.currency,
    reference: data.reference,
    paidAt: data.paid_at
  };
}

/**
 * Verify Bybit USDT Deposit by TxID
 */
async function verifyBybitDeposit({ txId, expectedMinAmount, expectedCoin = 'USDT' }) {
  if (!txId || typeof txId !== 'string') {
    return { valid: false, error: 'يرجى إدخال معرف المعاملة (TxID / Hash)' };
  }

  const cleanTxId = txId.trim().toLowerCase();
  const timestamp = Date.now().toString();
  const recvWindow = '5000';
  const queryString = `coin=${expectedCoin}`;
  const sign = crypto
    .createHmac('sha256', BYBIT.apiSecret)
    .update(timestamp + BYBIT.apiKey + recvWindow + queryString)
    .digest('hex');

  const response = await fetch(`${BYBIT.baseUrl}/v5/asset/deposit/query-record?${queryString}`, {
    headers: {
      'X-BAPI-API-KEY': BYBIT.apiKey,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': recvWindow,
      'X-BAPI-SIGN': sign
    }
  });

  const resJson = await response.json();
  if (resJson.retCode !== 0) {
    return { valid: false, error: resJson.retMsg || 'تعذر الاتصال بواجهة Bybit' };
  }

  const rows = resJson.result?.rows || [];
  const match = rows.find(r => r.txID && r.txID.trim().toLowerCase() === cleanTxId);

  if (!match) {
    return {
      valid: false,
      error: 'لم يتم العثور على هذه المعاملة في سجل الإيداعات بعد. إذا قمت بالتحويل للتو، يرجى الانتظار دقيقة حتى تؤكدها شبكة البلوكتشين ثم أعد المحاولة.'
    };
  }

  // Check deposit status: 3 = success in Bybit API v5
  if (match.status !== 3) {
    return {
      valid: false,
      error: `المعاملة موجودة ولكنها قيد التأكيد (الحالة الحالية: ${match.status}). يرجى المحاولة بعد اكتمال التأكيدات.`
    };
  }

  const depositAmount = parseFloat(match.amount);
  if (expectedMinAmount && depositAmount < expectedMinAmount) {
    return {
      valid: false,
      error: `قيمة التحويل (${depositAmount} USDT) أقل من قيمة الباقة المطلوبة (${expectedMinAmount} USDT).`
    };
  }

  return {
    valid: true,
    amount: depositAmount,
    coin: match.coin,
    chain: match.chain,
    txID: match.txID,
    successAt: match.successAt,
    fromAddress: match.fromAddress,
    toAddress: match.toAddress
  };
}

module.exports = {
  SHA7NAWY,
  BYBIT,
  createSha7nawyLink,
  checkSha7nawyStatus,
  verifyBybitDeposit
};
