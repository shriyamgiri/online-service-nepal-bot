const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// ==============================
// 🔧 SETTINGS
// ==============================
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = 'onlineservicenepal123';
const ADMIN_ID = process.env.ADMIN_ID;
const REVIEW_LINK = 'https://www.facebook.com/onlineservicenepalNo.1/reviews';
const SESSION_TIMEOUT = 45 * 60 * 1000;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

// 🛒 Your Lovable website base URL (set in .env as WEBSITE_URL)
// Example: https://your-lovable-site.lovable.app
const WEBSITE_URL = process.env.WEBSITE_URL || 'https://your-lovable-site.com';

// ==============================
// 🤖 Gemini Intent Prompt
// ==============================
const INTENT_PROMPT = `You are an intent classifier for "Online Service Nepal".
Classify the customer message into EXACTLY ONE of these intents:
GOOGLE_PRICE - ONLY if specifically asking about Google Play/Google INR codes
APPLE_PRICE - ONLY if specifically asking about Apple/iTunes/iOS codes
SPOTIFY - asking about Spotify subscription or price
KUKUFM - asking about KuKu FM subscription
SERVICES - asking about gift cards in general or what products/services are available
RECHARGE - asking about Indian Mobile Recharge
TRANSLATION - asking about Document Translation
FAQ_DELIVERY - asking about delivery time or how long it takes
FAQ_NEPAL - asking if Google/Apple codes work in Nepal
FAQ_PAYMENT - asking about payment methods (eSewa/Khalti/Bank)
OUT_OF_SCOPE - anything not related to our digital services
Reply with ONLY the intent word. Nothing else.`;

// ==============================
// 💳 QR CODE URLs
// ==============================
const QR_CODES = {
  esewa: 'https://drive.google.com/uc?export=view&id=1NoIUX3PqTLzIc2kx9lH7NxwxljqxR9cb',
  khalti: 'https://drive.google.com/uc?export=view&id=1N67wvplKTe7ttjHXsZRLMVIOII94gd3H',
  bank: 'BANK_QR_COMING_SOON'
};

// ==============================
// 💰 Price Lists
// ==============================
const GOOGLE_PRICES = {
  '1': { label: '50 INR  = NRs.95', inr: 50 },
  '2': { label: '100 INR = NRs.185', inr: 100 },
  '3': { label: '150 INR = NRs.275', inr: 150 },
  '4': { label: '200 INR = NRs.365', inr: 200 },
  '5': { label: '250 INR = NRs.455', inr: 250 },
  '6': { label: '300 INR = NRs.545', inr: 300 },
  '7': { label: '500 INR = NRs.885', inr: 500 },
  '8': { label: '1000 INR = NRs.1720', inr: 1000 }
};

const APPLE_PRICES = {
  '1': { label: '100 INR = NRs.185', inr: 100 },
  '2': { label: '150 INR = NRs.275', inr: 150 },
  '3': { label: '200 INR = NRs.365', inr: 200 },
  '4': { label: '250 INR = NRs.455', inr: 250 },
  '5': { label: '300 INR = NRs.545', inr: 300 },
  '6': { label: '500 INR = NRs.885', inr: 500 },
  '7': { label: '1000 INR = NRs.1720', inr: 1000 }
};

const SPOTIFY_PLANS = {
  '1': { label: '1 Month Plan = NRs.239', nrs: 239 },
  '2': { label: '1 Year Plan  = NRs.2369', nrs: 2369 }
};

// ==============================
// 💾 State & Tracking
// ==============================
const userState = {};
const userLastSeen = {};
const knownUsers = {};

// ==============================
// 💓 Health Check
// ==============================
app.get('/health', (req, res) => res.status(200).send('✅ Bot is Running!'));

// ==============================
// ✅ Webhook Verification
// ==============================
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified!');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ==============================
// 📩 Receive Messages
// ==============================
app.post('/webhook', (req, res) => {
  const body = req.body;
  if (body.object === 'page') {
    body.entry.forEach(entry => {
      const event = entry.messaging[0];
      const senderId = event.sender.id;
      if (event.message) handleMessage(senderId, event.message);
      if (event.postback) handlePostback(senderId, event.postback);
    });
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// ==============================
// 🛒 ORDER WEBHOOK
// Called by your Lovable website when user confirms their order.
//
// Expected POST body from Lovable:
// {
//   "psid": "123456789",          ← FB Page-Scoped User ID (passed in redirect URL)
//   "customerName": "Ram Sharma",
//   "items": [
//     { "name": "Product A", "qty": 2, "price": 500 },
//     { "name": "Product B", "qty": 1, "price": 300 }
//   ],
//   "total": 1300,
//   "notes": "Optional note"       ← optional
// }
// ==============================
app.post('/order-webhook', async (req, res) => {
  try {
    const { psid, customerName, items, total, notes } = req.body;

    // Validate required fields
    if (!psid || !items || !total) {
      return res.status(400).json({ error: 'Missing required fields: psid, items, total' });
    }

    console.log(`\n🛒 New Order from PSID: ${psid}`);

    // Build readable item list
    const itemLines = items
      .map(i => `  • ${i.name} x${i.qty || 1} — NRs.${i.price}`)
      .join('\n');

    const orderSummary =
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🛒 ORDER PREVIEW\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      (customerName ? `👤 Name: ${customerName}\n` : '') +
      `\n📦 Items:\n${itemLines}\n` +
      `\n💰 Total: NRs.${total}` +
      (notes ? `\n📝 Notes: ${notes}` : '') +
      `\n━━━━━━━━━━━━━━━━━━━━\n` +
      `⏳ Please wait — our admin will confirm your order and share payment details shortly! 🙏\n\n` +
      `— Online Service Nepal`;

    // Save order in userState so admin can reference it
    userState[psid] = {
      waitingForAdminAccept: true,
      orderSummary: orderSummary,
      orderData: { customerName, items, total, notes }
    };

    // 1️⃣ Send order preview to customer in Messenger
    await sendText(psid, orderSummary);

    // 2️⃣ Notify admin with full details + accept command
    const adminMsg =
      `🔔 NEW ORDER RECEIVED!\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 Customer PSID: ${psid}\n` +
      (customerName ? `📛 Name: ${customerName}\n` : '') +
      `\n📦 Items:\n${itemLines}\n` +
      `💰 Total: NRs.${total}` +
      (notes ? `\n📝 Notes: ${notes}` : '') +
      `\n━━━━━━━━━━━━━━━━━━━━\n` +
      `✅ To accept & send payment details:\n` +
      `ACCEPT ${psid}\n\n` +
      `❌ To reject order:\n` +
      `REJECT ${psid}`;

    await sendText(ADMIN_ID, adminMsg).catch(() =>
      console.log('⚠️ Admin notify failed — check ADMIN_ID in .env')
    );

    res.status(200).json({ success: true, message: 'Order received and sent to Messenger' });

  } catch (err) {
    console.error('❌ Order webhook error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==============================
// ⏱️ Session Timeout
// ==============================
function checkSession(senderId) {
  const now = Date.now();
  const lastSeen = userLastSeen[senderId];
  if (lastSeen && (now - lastSeen) > SESSION_TIMEOUT) {
    delete userState[senderId];
    userLastSeen[senderId] = now;
    return true;
  }
  userLastSeen[senderId] = now;
  return false;
}

// ==============================
// 🌅 Time Based Greeting
// ==============================
function getGreeting() {
  const nepalHour = (new Date().getUTCHours() + 5) % 24;
  if (nepalHour >= 5 && nepalHour < 12) return '🌅 Good Morning';
  if (nepalHour >= 12 && nepalHour < 17) return '☀️ Good Afternoon';
  if (nepalHour >= 17 && nepalHour < 21) return '🌆 Good Evening';
  return '🌙 Good Night';
}

// ==============================
// 🔢 Smart Price Matcher
// ==============================
function matchPrice(input, priceList) {
  const numbers = input.match(/\d+/g);
  if (!numbers) return null;
  const inputNum = parseInt(numbers[0]);
  const directKey = String(inputNum);
  if (priceList[directKey]) return { key: directKey, ...priceList[directKey] };
  for (const [key, val] of Object.entries(priceList)) {
    if (val.inr === inputNum || val.nrs === inputNum) return { key, ...val };
  }
  return null;
}

// ==============================
// 🔤 Smart Text Matcher
// ==============================
function matchText(input, options) {
  const t = input.toLowerCase().trim();
  for (const [key, keywords] of Object.entries(options)) {
    if (keywords.some(k => t.includes(k))) return key;
  }
  return null;
}

const MAIN_MENU_KEYWORDS = {
  '1': ['browse', 'service', 'product', 'buy', 'order', 'shop', 'purchase', 'google', 'apple', 'recharge', 'document', 'translate', 'spotify'],
  '2': ['team', 'support', 'help', 'talk', 'agent', 'human', 'chat', 'connect', 'query', 'question', 'problem']
};

const SERVICES_KEYWORDS = {
  '3': ['google', 'play', 'gplay', 'inr', 'redeem'],
  '4': ['apple', 'itunes', 'ios', 'iphone', 'ipad'],
  '5': ['recharge', 'mobile', 'airtel', 'jio', 'vi', 'bsnl', 'sim', 'phone', 'data'],
  '6': ['document', 'translate', 'translation', 'citizenship', 'nagarikta', 'land', 'tax', 'ward', 'educational'],
  '7': ['spotify']
};

const GOOGLE_PACK_KEYWORDS = {
  '1': ['trial', 'test', 'try', 'check', 'small', 'first', '10 inr', 'inr 10'],
  '2': ['regular', 'main', 'full', 'big', 'large', 'normal']
};

const OPERATOR_KEYWORDS = {
  '1': ['airtel'],
  '2': ['jio'],
  '3': ['vi', 'vodafone', 'idea'],
  '4': ['bsnl']
};

const PAYMENT_KEYWORDS = {
  '1': ['esewa', 'e-sewa', 'e sewa'],
  '2': ['khalti'],
  '3': ['bank', 'transfer', 'deposit', 'account']
};

const DOC_KEYWORDS = {
  '1': ['citizenship', 'nagarikta', 'citizen'],
  '2': ['education', 'educational', 'degree', 'certificate', 'school', 'college', 'academic'],
  '3': ['land', 'jagga', 'owner', 'property owner'],
  '4': ['tax clearance', 'tax clear'],
  '5': ['property tax', 'property'],
  '6': ['ward', 'office', 'verification', 'verify'],
  '7': ['other', 'others', 'else', 'different', 'misc']
};

// ==============================
// 🤖 Gemini Intent Classifier
// ==============================
async function classifyIntent(userMessage) {
  if (!GEMINI_KEY) return 'OUT_OF_SCOPE';
  try {
    const response = await axios.post(GEMINI_URL, {
      contents: [{ parts: [{ text: INTENT_PROMPT + '\n\nCustomer: ' + userMessage }] }]
    });
    const intent = response.data.candidates[0].content.parts[0].text.trim().toUpperCase();
    const valid = ['GOOGLE_PRICE', 'APPLE_PRICE', 'SPOTIFY', 'KUKUFM', 'SERVICES', 'RECHARGE',
      'TRANSLATION', 'FAQ_DELIVERY', 'FAQ_NEPAL', 'FAQ_PAYMENT', 'OUT_OF_SCOPE'];
    const result = valid.includes(intent) ? intent : 'OUT_OF_SCOPE';
    console.log(`🤖 Intent: ${result}`);
    return result;
  } catch (err) {
    console.error('❌ Gemini error:', err.response?.status);
    return 'OUT_OF_SCOPE';
  }
}

// ==============================
// 🎯 Handle Intent
// ==============================
async function handleIntent(senderId, intent) {
  switch (intent) {
    case 'SERVICES': return sendServicesMenu(senderId);
    case 'GOOGLE_PRICE': return sendGoogleMenuText(senderId);
    case 'APPLE_PRICE': return sendAppleMenuText(senderId);
    case 'SPOTIFY': return sendSpotifyMenu(senderId);
    case 'RECHARGE': return sendRechargeMenuText(senderId);
    case 'TRANSLATION': return sendTranslationMenuText(senderId);
    case 'FAQ_DELIVERY':
      return sendText(senderId,
        `⏱️ After payment confirmation from our end, it takes 10-15 minutes to complete your order!\n\nType MENU to browse our services 😊`
      );
    case 'FAQ_NEPAL':
      return sendText(senderId,
        `Great question! 😊\n\nWe recommend trying our exclusive Trial Pack first to check if your Google Indian Play Account works in Nepal!\n\n▪️ INR 10 @ NRs.25 only\n\nType 3 → then 1 to order Trial Pack now! 🎮`
      );
    case 'FAQ_PAYMENT':
      return sendText(senderId,
        `💳 We accept the following payment methods:\n\n✅ eSewa\n✅ Khalti\n✅ Bank Transfer\n\nType 1 to Browse Services and proceed to payment! 😊`
      );
    case 'KUKUFM':
      userState[senderId] = { waitingForHuman: true };
      return sendText(senderId,
        `🎙️ Great news! We are offering KuKu FM subscriptions!\n\nOur team will get back to you shortly with the available plans and pricing! 🙏\n\n— Online Service Nepal`
      );
    case 'OUT_OF_SCOPE':
    default:
      userState[senderId] = { waitingForHuman: true };
      return sendText(senderId,
        `Thanks for your message! 🙏\n\nOur team will get back to you shortly.\n\n— Online Service Nepal\n\nReply MENU anytime to browse our services 😊`
      );
  }
}

// ==============================
// 💬 Handle Messages
// ==============================
async function handleMessage(senderId, message) {
  const text = (message.text || '').toLowerCase().trim();
  const rawText = (message.text || '').trim();

  console.log('👤 Sender:', senderId, '| Msg:', rawText);

  // ─── Image/Screenshot ───
  if (message.attachments && message.attachments[0].type === 'image') {
    if (userState[senderId] && userState[senderId].waitingForPaymentConfirm) return;
    userState[senderId] = { ...userState[senderId], waitingForPaymentConfirm: true };
    return sendText(senderId,
      `📸 We received your image!\n\nIs this a payment screenshot?\n\n1️⃣  Yes — Payment Screenshot\n2️⃣  No — Something Else`
    );
  }

  // ─── Payment screenshot confirmation ───
  if (userState[senderId] && userState[senderId].waitingForPaymentConfirm) {
    const isYes = ['1', 'yes', 'yeah', 'yep', 'hoo', 'ho', 'ha', 'payment', 'confirm', 'haan', 'ya', 'y', 'ok', 'okay', 'sure'].includes(text);
    const isNo = ['2', 'no', 'nope', 'nahi', 'na', 'n', 'not'].includes(text);
    if (isYes) {
      const lastOrder = userState[senderId].lastOrder || 'your order';
      userState[senderId] = { waitingForOrder: true, lastOrder };
      console.log(`\n💰 PAYMENT: Customer ${senderId} | Order: ${lastOrder}`);
      sendText(ADMIN_ID,
        `💰 Payment Confirmed!\n\n👤 Customer ID: ${senderId}\n🛒 Order: ${lastOrder}\n\n⬇️ To complete:\nCOMPLETE ${senderId} ${lastOrder}`
      ).catch(() => console.log(`⚠️ Admin notify failed — check logs`));
      return sendText(senderId,
        `📸 Payment Screenshot Received!\n\n✅ Thank you for your payment!\n\nOur team will verify and process your order shortly! 🙏\n\n— Online Service Nepal\n\nFeel free to send any follow up message! 😊`
      );
    }
    if (isNo) {
      delete userState[senderId].waitingForPaymentConfirm;
      return sendText(senderId, `No problem! 😊\n\n1️⃣  Browse Services 🛒\n2️⃣  Talk to Our Team 💬`);
    }
    delete userState[senderId].waitingForPaymentConfirm;
    // Fall through to normal message handling
  }

  // ─── After payment — free follow up ───
  if (userState[senderId] && userState[senderId].waitingForOrder) {
    if (['menu', 'hi', 'hello', 'start'].includes(text)) {
      delete userState[senderId];
      return sendWelcome(senderId);
    }
    console.log(`📩 Follow up from ${senderId}: ${rawText}`);
    return;
  }

  // ─── Customer waiting for admin to accept their website order ───
  if (userState[senderId] && userState[senderId].waitingForAdminAccept) {
    if (['menu', 'hi', 'hello', 'start'].includes(text)) {
      delete userState[senderId];
      return sendWelcome(senderId);
    }
    // Let them know we got their message, order is still pending
    return sendText(senderId,
      `⏳ Your order is still being reviewed by our team!\n\nWe'll send you payment details very soon. 🙏\n\nType MENU to go back to the main menu.`
    );
  }

  // ─── Admin Commands ───
  if (senderId === ADMIN_ID) {

    // COMPLETE command (existing)
    if (rawText.toUpperCase().startsWith('COMPLETE')) {
      const parts = rawText.split(' ');
      const customerId = parts[1];
      const orderDetails = parts.slice(2).join(' ');
      if (customerId && orderDetails) {
        delete userState[customerId];
        sendText(customerId,
          `✅ Your Order is Completed!\n\n📦 ${orderDetails}\n\nThank you for choosing Online Service Nepal! 🙏\n\n⭐ Happy with our service? Leave us a review:\n👉 ${REVIEW_LINK}\n\nYour review helps us serve you better! 🇳🇵`
        );
        return sendText(ADMIN_ID, `✅ Order completed for: ${customerId}`);
      }
      return sendText(ADMIN_ID, `⚠️ Format: COMPLETE [CustomerID] [OrderDetails]`);
    }

    // ACCEPT command (new — for website orders)
    // Usage: ACCEPT [customerPSID]
    if (rawText.toUpperCase().startsWith('ACCEPT')) {
      const parts = rawText.split(' ');
      const customerId = parts[1];
      if (!customerId) {
        return sendText(ADMIN_ID, `⚠️ Format: ACCEPT [CustomerPSID]`);
      }
      const customerOrder = userState[customerId];
      if (!customerOrder || !customerOrder.waitingForAdminAccept) {
        return sendText(ADMIN_ID, `⚠️ No pending website order found for PSID: ${customerId}`);
      }
      // Move customer to waitingForPayment stage
      const { orderData } = customerOrder;
      const orderSummaryShort =
        `Website Order — NRs.${orderData.total}` +
        (orderData.customerName ? ` (${orderData.customerName})` : '');

      userState[customerId] = {
        waitingForPayment: true,
        lastOrder: orderSummaryShort,
        orderSummary: `🛒 Website Order\n💰 Total: NRs.${orderData.total}`
      };

      // Tell customer to choose payment
      await sendText(customerId,
        `✅ Great news! Your order has been accepted!\n\n` +
        `💰 Total: NRs.${orderData.total}\n\n` +
        `Please select your payment method:\n\n` +
        `1️⃣  eSewa\n2️⃣  Khalti\n3️⃣  Bank Transfer\n\n` +
        `0️⃣  Cancel Order`
      );

      return sendText(ADMIN_ID, `✅ Order accepted for PSID: ${customerId}. Customer is now choosing payment.`);
    }

    // REJECT command (new — for website orders)
    // Usage: REJECT [customerPSID]
    if (rawText.toUpperCase().startsWith('REJECT')) {
      const parts = rawText.split(' ');
      const customerId = parts[1];
      if (!customerId) {
        return sendText(ADMIN_ID, `⚠️ Format: REJECT [CustomerPSID]`);
      }
      delete userState[customerId];
      await sendText(customerId,
        `❌ Sorry, we were unable to process your order at this time.\n\n` +
        `Please contact our support team or try again.\n\n` +
        `Type MENU to browse our services. 🙏`
      );
      return sendText(ADMIN_ID, `✅ Order rejected for PSID: ${customerId}. Customer notified.`);
    }
  }

  // ─── Session timeout ───
  const sessionExpired = checkSession(senderId);
  if (sessionExpired) {
    return sendText(senderId,
      `👋 Welcome back!\n\n${getGreeting()}! Your previous session has expired.\n\nLet's start fresh! 😊`
    ).then(() => sendWelcome(senderId));
  }

  // ─── ALWAYS handle MENU/HI first ───
  if (['hi', 'hello', 'namaste', 'hey', 'start', 'menu'].includes(text)) {
    return sendWelcome(senderId);
  }

  // ─── Silent mode ───
  if (userState[senderId] && userState[senderId].waitingForHuman) {
    console.log(`🔕 Silent for ${senderId}: ${rawText}`);
    return;
  }

  // ─── Waiting for mobile number ───
  if (userState[senderId] && userState[senderId].waitingForPhone) {
    const operator = userState[senderId].operator;
    userState[senderId] = { waitingForPlan: true, operator, phone: rawText };
    return sendText(senderId,
      `📱 Mobile Number: ${rawText}\n\nPlease type your preferred recharge plan:\n\nExample:\n▪️ 28 days 1.5GB/day\n▪️ 239 plan\n\nType your plan below:`
    );
  }

  // ─── Waiting for recharge plan ───
  if (userState[senderId] && userState[senderId].waitingForPlan) {
    const { operator, phone } = userState[senderId];
    delete userState[senderId];
    return sendText(senderId,
      `✅ Order Received!\n\n📶 Operator: ${operator}\n📞 Mobile: ${phone}\n📋 Plan: ${rawText}\n\nOur team will contact you shortly! 🙏\n\n— Online Service Nepal\n\nReply MENU anytime.`
    );
  }

  // ─── Payment method ───
  if (userState[senderId] && userState[senderId].waitingForPayment) {
    const { orderSummary } = userState[senderId];
    if (text === '0') { delete userState[senderId]; return sendMainMenu(senderId); }
    const payKey = matchText(rawText, PAYMENT_KEYWORDS) || text;
    if (payKey === '1') { delete userState[senderId]; return sendPaymentDetails(senderId, 'eSewa', QR_CODES.esewa, orderSummary); }
    if (payKey === '2') { delete userState[senderId]; return sendPaymentDetails(senderId, 'Khalti', QR_CODES.khalti, orderSummary); }
    if (payKey === '3') { delete userState[senderId]; return sendPaymentDetails(senderId, 'Bank Transfer', QR_CODES.bank, orderSummary); }
    return sendPaymentMenu(senderId, 'Please reply 1, 2 or 3:');
  }

  // ─── Google Pack ───
  if (userState[senderId] && userState[senderId].waitingForGooglePack) {
    if (text === '0') { delete userState[senderId]; return sendServicesMenu(senderId); }
    if (['apple', 'itunes', 'ios', 'iphone', 'ipad'].some(w => text.includes(w))) {
      delete userState[senderId]; return sendAppleMenuText(senderId);
    }
    if (['gift card', 'service', 'product', 'other', 'else'].some(w => text.includes(w))) {
      delete userState[senderId]; return sendServicesMenu(senderId);
    }
    const gPack = matchText(rawText, GOOGLE_PACK_KEYWORDS) || text;
    if (gPack === '1') return sendGoogleTrialPack(senderId);
    if (gPack === '2') return sendGoogleRegularPack(senderId);
    return sendGoogleMenuText(senderId);
  }

  // ─── Google Trial ───
  if (userState[senderId] && userState[senderId].waitingForGoogleTrial) {
    if (text === '0') { delete userState[senderId]; return sendGoogleMenuText(senderId); }
    const isYesTrial = ['1', 'yes', 'proceed', 'buy', 'order', 'ok', 'okay', 'sure'].includes(text);
    if (isYesTrial) {
      userState[senderId] = {
        waitingForPayment: true,
        lastOrder: 'Google INR Trial Pack - INR 10 @ NRs.25',
        orderSummary: '🎮 Google INR Redeem Code\n▪️ Trial Pack - INR 10 @ NRs.25'
      };
      return sendPaymentMenu(senderId, `🎮 Trial Pack ✅ INR 10 @ NRs.25\n\nSelect payment:`);
    }
    return sendGoogleTrialPack(senderId);
  }

  // ─── Google Regular ───
  if (userState[senderId] && userState[senderId].waitingForGoogleRegular) {
    if (text === '0') { delete userState[senderId]; return sendGoogleMenuText(senderId); }
    const match = matchPrice(rawText, GOOGLE_PRICES);
    if (match) {
      userState[senderId] = {
        waitingForPayment: true,
        lastOrder: `Google INR Regular - ${match.label}`,
        orderSummary: `🎮 Google INR Redeem Code\n▪️ ${match.label}`
      };
      return sendPaymentMenu(senderId,
        `🎮 Regular Pack ✅ ${match.label}\n\n⚠️ Requires India based Google Play account.\n\nSelect payment:`
      );
    }
    return sendText(senderId,
      `❓ Please type the number to select:\n\n` +
      `1️⃣  50 INR  = NRs.95\n2️⃣  100 INR = NRs.185\n3️⃣  150 INR = NRs.275\n` +
      `4️⃣  200 INR = NRs.365\n5️⃣  250 INR = NRs.455\n6️⃣  300 INR = NRs.545\n` +
      `7️⃣  500 INR = NRs.885\n8️⃣  1000 INR = NRs.1720\n\n` +
      `💡 Just type 1, 2, 3... to continue!\n\n0️⃣  Back`
    );
  }

  // ─── Apple ───
  if (userState[senderId] && userState[senderId].waitingForApple) {
    if (text === '0') { delete userState[senderId]; return sendServicesMenu(senderId); }
    if (['google', 'play', 'gplay'].some(w => text.includes(w))) {
      delete userState[senderId]; return sendGoogleMenuText(senderId);
    }
    const match = matchPrice(rawText, APPLE_PRICES);
    if (match) {
      userState[senderId] = {
        waitingForPayment: true,
        lastOrder: `Apple iTunes - ${match.label}`,
        orderSummary: `🍎 Apple iTunes Redeem Code\n▪️ ${match.label}`
      };
      return sendPaymentMenu(senderId, `🍎 Apple iTunes ✅ ${match.label}\n\n⚠️ Requires India based Apple ID.\n\nSelect payment:`);
    }
    return sendText(senderId,
      `❓ Please type the number to select:\n\n` +
      `1️⃣  100 INR = NRs.185\n2️⃣  150 INR = NRs.275\n3️⃣  200 INR = NRs.365\n` +
      `4️⃣  250 INR = NRs.455\n5️⃣  300 INR = NRs.545\n6️⃣  500 INR = NRs.885\n7️⃣  1000 INR = NRs.1720\n\n` +
      `💡 Just type 1, 2, 3... to continue!\n\n0️⃣  Back to Services`
    );
  }

  // ─── Spotify Plan Selection ───
  if (userState[senderId] && userState[senderId].waitingForSpotify) {
    if (text === '0') { delete userState[senderId]; return sendServicesMenu(senderId); }
    const match = matchPrice(rawText, SPOTIFY_PLANS);
    if (match) {
      userState[senderId] = {
        waitingForPayment: true,
        lastOrder: `Spotify Premium - ${match.label}`,
        orderSummary: `🎵 Spotify Premium Subscription\n▪️ ${match.label}`
      };
      return sendPaymentMenu(senderId,
        `🎵 Spotify Premium ✅ ${match.label}\n\nSelect payment:`
      );
    }
    return sendSpotifyMenu(senderId);
  }

  // ─── Operator ───
  if (userState[senderId] && userState[senderId].waitingForOperator) {
    const operators = { '1': 'Airtel', '2': 'Jio', '3': 'Vi', '4': 'BSNL' };
    if (text === '0') { delete userState[senderId]; return sendServicesMenu(senderId); }
    const opKey = matchText(rawText, OPERATOR_KEYWORDS) || text;
    const operator = operators[opKey];
    if (operator) {
      delete userState[senderId];
      userState[senderId] = { waitingForPhone: true, operator };
      return sendText(senderId, `📶 Operator: ${operator}\n\nPlease type your mobile number:`);
    }
    return sendRechargeMenuText(senderId);
  }

  // ─── Document ───
  if (userState[senderId] && userState[senderId].waitingForDoc) {
    const docs = {
      '1': 'Citizenship', '2': 'Educational Documents', '3': 'Land Owner Certificate',
      '4': 'Tax Clearance', '5': 'Property Tax Receipt',
      '6': 'Verification From Ward Office', '7': 'Others'
    };
    if (text === '0') { delete userState[senderId]; return sendServicesMenu(senderId); }
    const docKey = matchText(rawText, DOC_KEYWORDS) || text;
    const doc = docs[docKey];
    if (doc) {
      delete userState[senderId];
      return sendText(senderId,
        `📄 Document Translation\n✅ Selected: ${doc}\n\nOur team will contact you shortly! 🙏\n\n— Online Service Nepal\n\nReply MENU to go back.`
      );
    }
    return sendTranslationMenuText(senderId);
  }

  // ─── Support query ───
  if (userState[senderId] && userState[senderId].waitingForSupport) {
    userState[senderId] = { waitingForHuman: true };
    return sendText(senderId,
      `✅ Thank you for reaching out!\n\n💬 Our team has received your message and will get back to you shortly! 🙏\n\n— Online Service Nepal`
    );
  }

  // ─── Smart text matching for main menu ───
  const mainKey = matchText(rawText, MAIN_MENU_KEYWORDS) || text;
  if (mainKey === '1' || text === '1') {
    const svcKey = matchText(rawText, SERVICES_KEYWORDS);
    if (svcKey === '3') return sendGoogleMenuText(senderId);
    if (svcKey === '4') return sendAppleMenuText(senderId);
    if (svcKey === '5') return sendRechargeMenuText(senderId);
    if (svcKey === '6') return sendTranslationMenuText(senderId);
    if (svcKey === '7') return sendSpotifyMenu(senderId);
    return sendServicesMenu(senderId);
  }
  if (mainKey === '2' || text === '2') return sendSupportMenu(senderId);
  if (text === '3') return sendGoogleMenuText(senderId);
  if (text === '4') return sendAppleMenuText(senderId);
  if (text === '5') return sendRechargeMenuText(senderId);
  if (text === '6') return sendTranslationMenuText(senderId);
  if (text === '7') return sendSpotifyMenu(senderId);

  // ─── Smart Intent via Gemini ───
  const intent = await classifyIntent(rawText);
  return handleIntent(senderId, intent);
}

// ==============================
// 🔘 Postback
// ==============================
function handlePostback(senderId) { sendWelcome(senderId); }

// ==============================
// 👋 Welcome  ← NOW SHOWS ORDER OPTION
// ==============================
function sendWelcome(senderId) {
  const greeting = getGreeting();
  const isReturning = knownUsers[senderId];
  knownUsers[senderId] = true;
  userState[senderId] = {};
  sendText(senderId,
    isReturning
      ? `👋 Welcome Back!\n${greeting}! Great to see you again! 🙏\n\n1️⃣  Place an Order 🛒\n2️⃣  Talk to Our Team 💬\n\nType 1 or 2 to continue...`
      : `🙏 ${greeting}!\nWelcome to Online Service Nepal! 🇳🇵\n\nWe provide fast & reliable digital services.\n\n1️⃣  Place an Order 🛒\n2️⃣  Talk to Our Team 💬\n\nType 1 or 2 to continue...`
  );
}

function sendMainMenu(senderId) {
  userState[senderId] = {};
  sendText(senderId, `How can we help you today?\n\n1️⃣  Place an Order 🛒\n2️⃣  Talk to Our Team 💬\n\nType 1 or 2...`);
}

function sendSupportMenu(senderId) {
  userState[senderId] = { waitingForSupport: true };
  sendText(senderId,
    `💬 Sure! Our team is here to help! 😊\n\nPlease describe what you need\nand we'll get back to you shortly!\n\nType your message now... 👇`
  );
}

// ─── Updated: Option 1 now redirects to website ───
function sendServicesMenu(senderId) {
  userState[senderId] = { inServices: true };
  const shopUrl = `${WEBSITE_URL}?psid=${senderId}`;
  sendText(senderId,
    `🛒 Ready to order?\n\n` +
    `👉 Visit our shop here:\n${shopUrl}\n\n` +
    `Browse products, add to cart, and click Continue — your order preview will appear right here in this chat!\n\n` +
    `Or choose from our digital services:\n\n` +
    `3️⃣  Google INR Redeem Code 🎮\n` +
    `4️⃣  Apple iTunes Redeem Code 🍎\n` +
    `5️⃣  Indian Mobile Recharge 📱\n` +
    `6️⃣  Document Translation 📄\n` +
    `7️⃣  Spotify Premium 🎵\n\n` +
    `0️⃣  Back to Main Menu`
  );
}

function sendGoogleMenuText(senderId) {
  userState[senderId] = { waitingForGooglePack: true };
  sendText(senderId, `🎮 Google INR Redeem Code\n\n1️⃣  Trial Pack\n2️⃣  Regular Pack\n\n0️⃣  Back to Services`);
}

function sendGoogleTrialPack(senderId) {
  userState[senderId] = { waitingForGoogleTrial: true };
  sendText(senderId,
    `🎮 Google INR Redeem Code\n━━━━━━━━━━━━━━━━━━━━\n⚠️ Before Buying This!!!\n\n` +
    `Try our exclusive "Trial Pack" to check your Google Indian Play Account is working in Nepal.\n\n` +
    `▪️ INR 10 for NRs. 25/-\n\n🚫 Non-Refundable.\n━━━━━━━━━━━━━━━━━━━━\n\n1️⃣  Proceed to Buy\n0️⃣  Back`
  );
}

function sendGoogleRegularPack(senderId) {
  userState[senderId] = { waitingForGoogleRegular: true };
  sendText(senderId,
    `🎮 Google INR Redeem Code\n━━━━━━━━━━━━━━━━━━━━\n🔸 Regular Pack\n\n` +
    `1️⃣  50 INR  = NRs.95\n2️⃣  100 INR = NRs.185\n3️⃣  150 INR = NRs.275\n4️⃣  200 INR = NRs.365\n` +
    `5️⃣  250 INR = NRs.455\n6️⃣  300 INR = NRs.545\n7️⃣  500 INR = NRs.885\n8️⃣  1000 INR = NRs.1720\n\n` +
    `💡 Type number (1-8) to select\n⚠️ Requires India based Google Play account.\n🚫 Non-Refundable.\n━━━━━━━━━━━━━━━━━━━━\n\n0️⃣  Back`
  );
}

function sendAppleMenuText(senderId) {
  userState[senderId] = { waitingForApple: true };
  sendText(senderId,
    `🍎 Apple iTunes Redeem Code\n\n` +
    `1️⃣  100 INR = NRs.185\n2️⃣  150 INR = NRs.275\n3️⃣  200 INR = NRs.365\n` +
    `4️⃣  250 INR = NRs.455\n5️⃣  300 INR = NRs.545\n6️⃣  500 INR = NRs.885\n7️⃣  1000 INR = NRs.1720\n\n` +
    `💡 Type number (1-7) to select\n⚠️ Requires India based Apple ID.\n\n0️⃣  Back to Services`
  );
}

function sendSpotifyMenu(senderId) {
  userState[senderId] = { waitingForSpotify: true };
  sendText(senderId,
    `🎵 Spotify Premium Subscription\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `1️⃣  1 Month Plan = NRs.239\n` +
    `2️⃣  1 Year Plan  = NRs.2369\n\n` +
    `💡 Type 1 or 2 to select\n━━━━━━━━━━━━━━━━━━━━\n\n0️⃣  Back to Services`
  );
}

function sendRechargeMenuText(senderId) {
  userState[senderId] = { waitingForOperator: true };
  sendText(senderId, `📱 Indian Mobile Recharge\n\n1️⃣  Airtel\n2️⃣  Jio\n3️⃣  Vi\n4️⃣  BSNL\n\n0️⃣  Back to Services`);
}

function sendTranslationMenuText(senderId) {
  userState[senderId] = { waitingForDoc: true };
  sendText(senderId,
    `📄 Official Document Translation\n\n1️⃣  Citizenship\n2️⃣  Educational Documents\n3️⃣  Land Owner Certificate\n` +
    `4️⃣  Tax Clearance\n5️⃣  Property Tax Receipt\n6️⃣  Verification From Ward Office\n7️⃣  Others\n\n0️⃣  Back to Services`
  );
}

function sendPaymentMenu(senderId, intro) {
  sendText(senderId, `${intro}\n\n1️⃣  eSewa\n2️⃣  Khalti\n3️⃣  Bank Transfer\n\n0️⃣  Back to Main Menu`);
}

function sendPaymentDetails(senderId, method, qrUrl, orderSummary) {
  if (qrUrl !== 'BANK_QR_COMING_SOON') {
    return sendText(senderId,
      `✅ Order Summary:\n${orderSummary}\n\n💳 Payment: ${method}\n\n📸 Tap link to view QR & scan to pay:\n👉 ${qrUrl}\n\nAfter payment send screenshot 🙏\n\n— Online Service Nepal`
    );
  }
  return sendText(senderId,
    `✅ Order Summary:\n${orderSummary}\n\n💳 Bank Transfer\n\nOur team will send bank details shortly! 🙏`
  );
}

function sendText(senderId, text) {
  return axios.post(
    `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
    { recipient: { id: senderId }, message: { text } }
  ).catch(err => console.error('❌ Send error:', JSON.stringify(err.response?.data)));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Online Service Nepal Bot running on port ${PORT}`));