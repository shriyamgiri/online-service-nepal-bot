const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// ==============================
// 🔧 SETTINGS
// ==============================
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN      = 'onlineservicenepal123';
const ADMIN_ID          = process.env.ADMIN_ID;
const REVIEW_LINK       = 'https://www.facebook.com/onlineservicenepalNo.1/reviews';
const SESSION_TIMEOUT   = 45 * 60 * 1000; // 45 minutes
const GEMINI_KEY        = process.env.GEMINI_API_KEY;
const GEMINI_URL        = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

// ==============================
// 🤖 Gemini Intent Classifier Prompt
// ==============================
const INTENT_PROMPT = `You are an intent classifier for "Online Service Nepal".
Classify the customer message into EXACTLY ONE of these intents:
GOOGLE_PRICE - asking about Google INR Redeem Code price or want to buy
APPLE_PRICE - asking about Apple iTunes price or want to buy
RECHARGE - asking about Indian Mobile Recharge
TRANSLATION - asking about Document Translation
FAQ_DELIVERY - asking about delivery time or how long it takes
FAQ_NEPAL - asking if Google/Apple codes work in Nepal
FAQ_PAYMENT - asking about payment methods (eSewa/Khalti/Bank)
OUT_OF_SCOPE - anything not related to our digital services

Reply with ONLY the intent word. Nothing else. No explanation.`;

// ==============================
// 💳 QR CODE URLs
// ==============================
const QR_CODES = {
  esewa:  'https://drive.google.com/uc?export=view&id=1NoIUX3PqTLzIc2kx9lH7NxwxljqxR9cb',
  khalti: 'https://drive.google.com/uc?export=view&id=1N67wvplKTe7ttjHXsZRLMVIOII94gd3H',
  bank:   'BANK_QR_COMING_SOON'
};

// ==============================
// 💾 State & Tracking
// ==============================
const userState    = {};
const userLastSeen = {};
const knownUsers   = {};

// ==============================
// 💓 Health Check
// ==============================
app.get('/health', (req, res) => {
  res.status(200).send('✅ Bot is Running!');
});

// ==============================
// ✅ Webhook Verification
// ==============================
app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
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
      const event    = entry.messaging[0];
      const senderId = event.sender.id;
      if (event.message)  handleMessage(senderId, event.message);
      if (event.postback) handlePostback(senderId, event.postback);
    });
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
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
  if (nepalHour >= 5  && nepalHour < 12) return '🌅 Good Morning';
  if (nepalHour >= 12 && nepalHour < 17) return '☀️ Good Afternoon';
  if (nepalHour >= 17 && nepalHour < 21) return '🌆 Good Evening';
  return '🌙 Good Night';
}

// ==============================
// 💬 Handle Messages
// ==============================
async function handleMessage(senderId, message) {
  const text    = (message.text || '').toLowerCase().trim();
  const rawText = (message.text || '').trim();

  console.log('👤 Sender:', senderId, '| Msg:', rawText);

  // ─── Image/Screenshot ───
  if (message.attachments && message.attachments[0].type === 'image') {
    if (userState[senderId] && userState[senderId].waitingForPaymentConfirm) return;
    userState[senderId] = { ...userState[senderId], waitingForPaymentConfirm: true };
    return sendText(senderId,
      `📸 We received your image!\n\n` +
      `Is this a payment screenshot?\n\n` +
      `1️⃣  Yes — Payment Screenshot\n` +
      `2️⃣  No — Something Else`
    );
  }

  // ─── Payment screenshot confirmation ───
  if (userState[senderId] && userState[senderId].waitingForPaymentConfirm) {
    if (text === '1') {
      const lastOrder = userState[senderId].lastOrder || 'your order';
      userState[senderId] = { waitingForOrder: true, lastOrder };
      sendText(ADMIN_ID,
        `💰 Payment Confirmed!\n\n` +
        `👤 Customer ID: ${senderId}\n` +
        `🛒 Order: ${lastOrder}\n\n` +
        `⬇️ To complete:\nCOMPLETE ${senderId} ${lastOrder}`
      );
      return sendText(senderId,
        `📸 Payment Screenshot Received!\n\n` +
        `✅ Thank you for your payment!\n\n` +
        `Our team will verify and process\nyour order shortly! 🙏\n\n` +
        `— Online Service Nepal\n\n` +
        `Feel free to send any follow up message! 😊`
      );
    }
    if (text === '2') {
      delete userState[senderId].waitingForPaymentConfirm;
      return sendText(senderId,
        `No problem! 😊\n\n` +
        `1️⃣  Browse Services 🛒\n` +
        `2️⃣  Talk to Our Team 💬`
      );
    }
    return sendText(senderId, `Please reply:\n1️⃣  Yes\n2️⃣  No`);
  }

  // ─── After payment — allow follow up freely ───
  if (userState[senderId] && userState[senderId].waitingForOrder) {
    if (['menu', 'hi', 'hello', 'start'].includes(text)) {
      delete userState[senderId];
      return sendWelcome(senderId);
    }
    // Silent — Admin handles from inbox
    console.log(`📩 Follow up from ${senderId}: ${rawText} — waiting for admin reply`);
    return;
  }

  // ─── Admin COMPLETE command ───
  if (senderId === ADMIN_ID && rawText.toUpperCase().startsWith('COMPLETE')) {
    const parts        = rawText.split(' ');
    const customerId   = parts[1];
    const orderDetails = parts.slice(2).join(' ');
    if (customerId && orderDetails) {
      delete userState[customerId];
      sendText(customerId,
        `✅ Your Order is Completed!\n\n📦 ${orderDetails}\n\n` +
        `Thank you for choosing Online Service Nepal! 🙏\n\n` +
        `⭐ Happy with our service? Leave us a review:\n👉 ${REVIEW_LINK}\n\n` +
        `Your review helps us serve you better! 🇳🇵`
      );
      return sendText(ADMIN_ID, `✅ Order completed for: ${customerId}`);
    }
    return sendText(ADMIN_ID, `⚠️ Format: COMPLETE [CustomerID] [OrderDetails]`);
  }

  // ─── Session timeout ───
  const sessionExpired = checkSession(senderId);
  if (sessionExpired) {
    return sendText(senderId,
      `👋 Welcome back!\n\n${getGreeting()}! Your previous session has expired.\n\nLet's start fresh! 😊`
    ).then(() => sendWelcome(senderId));
  }

  // ─── Waiting for human (out of scope) — SILENT ───
  if (userState[senderId] && userState[senderId].waitingForHuman) {
    // Complete silence — admin replies from inbox
    console.log(`🔕 Silent mode for ${senderId}: ${rawText}`);
    return;
  }

  // ─── Waiting for mobile number ───
  if (userState[senderId] && userState[senderId].waitingForPhone) {
    const operator = userState[senderId].operator;
    userState[senderId] = { waitingForPlan: true, operator, phone: rawText };
    return sendText(senderId,
      `📱 Mobile Number: ${rawText}\n\nPlease type your preferred recharge plan:\n\n` +
      `Example:\n▪️ 28 days 1.5GB/day\n▪️ 239 plan\n\nType your plan below:`
    );
  }

  // ─── Waiting for recharge plan ───
  if (userState[senderId] && userState[senderId].waitingForPlan) {
    const { operator, phone } = userState[senderId];
    delete userState[senderId];
    return sendText(senderId,
      `✅ Order Received!\n\n📶 Operator: ${operator}\n📞 Mobile: ${phone}\n📋 Plan: ${rawText}\n\n` +
      `Our team will contact you shortly! 🙏\n\n— Online Service Nepal\n\nReply MENU anytime.`
    );
  }

  // ─── Payment method ───
  if (userState[senderId] && userState[senderId].waitingForPayment) {
    const { orderSummary } = userState[senderId];
    if (text === '1') { delete userState[senderId]; return sendPaymentDetails(senderId, 'eSewa', QR_CODES.esewa, orderSummary); }
    if (text === '2') { delete userState[senderId]; return sendPaymentDetails(senderId, 'Khalti', QR_CODES.khalti, orderSummary); }
    if (text === '3') { delete userState[senderId]; return sendPaymentDetails(senderId, 'Bank Transfer', QR_CODES.bank, orderSummary); }
    if (text === '0') { delete userState[senderId]; return sendMainMenu(senderId); }
    return sendPaymentMenu(senderId, 'Please reply 1, 2 or 3:');
  }

  // ─── Google Pack ───
  if (userState[senderId] && userState[senderId].waitingForGooglePack) {
    if (text === '1') return sendGoogleTrialPack(senderId);
    if (text === '2') return sendGoogleRegularPack(senderId);
    if (text === '0') { delete userState[senderId]; return sendServicesMenu(senderId); }
    return sendGoogleMenuText(senderId);
  }

  // ─── Google Trial ───
  if (userState[senderId] && userState[senderId].waitingForGoogleTrial) {
    if (text === '1') {
      userState[senderId] = {
        waitingForPayment: true,
        lastOrder: 'Google INR Trial Pack - INR 10 @ NRs.25',
        orderSummary: '🎮 Google INR Redeem Code\n▪️ Trial Pack - INR 10 @ NRs.25'
      };
      return sendPaymentMenu(senderId, `🎮 Trial Pack ✅ INR 10 @ NRs.25\n\nSelect payment:`);
    }
    if (text === '0') { delete userState[senderId]; return sendGoogleMenuText(senderId); }
    return sendGoogleTrialPack(senderId);
  }

  // ─── Google Regular ───
  if (userState[senderId] && userState[senderId].waitingForGoogleRegular) {
    const prices = {
      '1':'50 INR @ NRs.95','2':'100 INR @ NRs.185','3':'150 INR @ NRs.275',
      '4':'200 INR @ NRs.365','5':'250 INR @ NRs.455','6':'300 INR @ NRs.545',
      '7':'500 INR @ NRs.885','8':'1000 INR @ NRs.1720'
    };
    if (text === '0') { delete userState[senderId]; return sendGoogleMenuText(senderId); }
    const selected = prices[text];
    if (selected) {
      userState[senderId] = {
        waitingForPayment: true,
        lastOrder: `Google INR Regular - ${selected}`,
        orderSummary: `🎮 Google INR Redeem Code\n▪️ ${selected}`
      };
      return sendPaymentMenu(senderId,
        `🎮 Regular Pack ✅ ${selected}\n\n⚠️ Requires India based Google Play account.\n\nSelect payment:`
      );
    }
    return sendGoogleRegularPack(senderId);
  }

  // ─── Apple ───
  if (userState[senderId] && userState[senderId].waitingForApple) {
    const prices = {
      '1':'100 INR @ NRs.185','2':'150 INR @ NRs.275','3':'200 INR @ NRs.365',
      '4':'250 INR @ NRs.455','5':'300 INR @ NRs.545','6':'500 INR @ NRs.885',
      '7':'1000 INR @ NRs.1720'
    };
    if (text === '0') { delete userState[senderId]; return sendServicesMenu(senderId); }
    const selected = prices[text];
    if (selected) {
      userState[senderId] = {
        waitingForPayment: true,
        lastOrder: `Apple iTunes - ${selected}`,
        orderSummary: `🍎 Apple iTunes Redeem Code\n▪️ ${selected}`
      };
      return sendPaymentMenu(senderId,
        `🍎 Apple iTunes ✅ ${selected}\n\n⚠️ Requires India based Apple ID.\n\nSelect payment:`
      );
    }
    return sendAppleMenuText(senderId);
  }

  // ─── Operator ───
  if (userState[senderId] && userState[senderId].waitingForOperator) {
    const operators = {'1':'Airtel','2':'Jio','3':'Vi','4':'BSNL'};
    if (text === '0') { delete userState[senderId]; return sendServicesMenu(senderId); }
    const operator = operators[text];
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
      '1':'Citizenship','2':'Educational Documents','3':'Land Owner Certificate',
      '4':'Tax Clearance','5':'Property Tax Receipt',
      '6':'Verification From Ward Office','7':'Others'
    };
    if (text === '0') { delete userState[senderId]; return sendServicesMenu(senderId); }
    const doc = docs[text];
    if (doc) {
      delete userState[senderId];
      return sendText(senderId,
        `📄 Document Translation\n✅ Selected: ${doc}\n\n` +
        `Our team will contact you shortly! 🙏\n\n— Online Service Nepal\n\nReply MENU to go back.`
      );
    }
    return sendTranslationMenuText(senderId);
  }

  // ─── Support query ───
  if (userState[senderId] && userState[senderId].waitingForSupport) {
    delete userState[senderId];
    userState[senderId] = { waitingForHuman: true };
    return sendText(senderId,
      `✅ Thank you for reaching out!\n\n` +
      `💬 Your message has been received.\n\n` +
      `Our team will contact you shortly! 🙏\n\n` +
      `— Online Service Nepal`
    );
  }

  // ─── Main triggers ───
  if (['hi','hello','namaste','hey','start','menu'].includes(text)) return sendWelcome(senderId);
  if (text === '1') return sendServicesMenu(senderId);
  if (text === '2') return sendSupportMenu(senderId);
  if (text === '3') return sendGoogleMenuText(senderId);
  if (text === '4') return sendAppleMenuText(senderId);
  if (text === '5') return sendRechargeMenuText(senderId);
  if (text === '6') return sendTranslationMenuText(senderId);

  // ─── Smart Intent Classification via Gemini ───
  const intent = await classifyIntent(rawText);
  return handleIntent(senderId, intent);
}

// ==============================
// 🔘 Postback
// ==============================
function handlePostback(senderId) { sendWelcome(senderId); }

// ==============================
// 👋 Welcome — Structured (No AI)
// ==============================
function sendWelcome(senderId) {
  const greeting    = getGreeting();
  const isReturning = knownUsers[senderId];
  knownUsers[senderId] = true;
  userState[senderId]  = {};
  sendText(senderId,
    isReturning
      ? `👋 Welcome Back!\n${greeting}! Great to see you again! 🙏\n\n1️⃣  Browse Services 🛒\n2️⃣  Talk to Our Team 💬\n\nType 1 or 2 to continue...`
      : `🙏 ${greeting}!\nWelcome to Online Service Nepal! 🇳🇵\n\nWe provide fast & reliable digital services.\n\n1️⃣  Browse Services 🛒\n2️⃣  Talk to Our Team 💬\n\nType 1 or 2 to continue...`
  );
}

function sendMainMenu(senderId) {
  userState[senderId] = {};
  sendText(senderId,
    `How can we help you today?\n\n1️⃣  Browse Services 🛒\n2️⃣  Talk to Our Team 💬\n\nType 1 or 2...`
  );
}

function sendServicesMenu(senderId) {
  userState[senderId] = { inServices: true };
  sendText(senderId,
    `🛒 Our Services\n\n3️⃣  Google INR Redeem Code 🎮\n4️⃣  Apple iTunes Redeem Code 🍎\n` +
    `5️⃣  Indian Mobile Recharge 📱\n6️⃣  Document Translation 📄\n\n0️⃣  Back to Main Menu`
  );
}

function sendSupportMenu(senderId) {
  userState[senderId] = { waitingForSupport: true };
  sendText(senderId,
    `💬 Talk to Our Team\n\nPlease describe your query below\nand we will get back to you shortly:\n\nType your message now... 👇`
  );
}

function sendGoogleMenuText(senderId) {
  userState[senderId] = { waitingForGooglePack: true };
  sendText(senderId,
    `🎮 Google INR Redeem Code\n\n1️⃣  Trial Pack\n2️⃣  Regular Pack\n\n0️⃣  Back to Services`
  );
}

function sendGoogleTrialPack(senderId) {
  userState[senderId] = { waitingForGoogleTrial: true };
  sendText(senderId,
    `🎮 Google INR Redeem Code\n━━━━━━━━━━━━━━━━━━━━\n⚠️ Before Buying This!!!\n\n` +
    `Try our exclusive "Trial Pack" to check your Google Indian Play Account is working in Nepal.\n\n` +
    `▪️ INR 10 for NRs. 25/-\n\n🚫 Non-Refundable.\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `1️⃣  Proceed to Buy\n0️⃣  Back`
  );
}

function sendGoogleRegularPack(senderId) {
  userState[senderId] = { waitingForGoogleRegular: true };
  sendText(senderId,
    `🎮 Google INR Redeem Code\n━━━━━━━━━━━━━━━━━━━━\n🔸 Regular Pack\n\n` +
    `1️⃣  50 INR @ NRs.95\n2️⃣  100 INR @ NRs.185\n3️⃣  150 INR @ NRs.275\n4️⃣  200 INR @ NRs.365\n` +
    `5️⃣  250 INR @ NRs.455\n6️⃣  300 INR @ NRs.545\n7️⃣  500 INR @ NRs.885\n8️⃣  1000 INR @ NRs.1720\n\n` +
    `⚠️ Requires India based Google Play account.\n🚫 Non-Refundable.\n━━━━━━━━━━━━━━━━━━━━\n\n0️⃣  Back`
  );
}

function sendAppleMenuText(senderId) {
  userState[senderId] = { waitingForApple: true };
  sendText(senderId,
    `🍎 Apple iTunes Redeem Code\n\n1️⃣  100 INR @ NRs.185\n2️⃣  150 INR @ NRs.275\n3️⃣  200 INR @ NRs.365\n` +
    `4️⃣  250 INR @ NRs.455\n5️⃣  300 INR @ NRs.545\n6️⃣  500 INR @ NRs.885\n7️⃣  1000 INR @ NRs.1720\n\n` +
    `⚠️ Requires India based Apple ID.\n\n0️⃣  Back to Services`
  );
}

function sendRechargeMenuText(senderId) {
  userState[senderId] = { waitingForOperator: true };
  sendText(senderId,
    `📱 Indian Mobile Recharge\n\n1️⃣  Airtel\n2️⃣  Jio\n3️⃣  Vi\n4️⃣  BSNL\n\n0️⃣  Back to Services`
  );
}

function sendTranslationMenuText(senderId) {
  userState[senderId] = { waitingForDoc: true };
  sendText(senderId,
    `📄 Official Document Translation\n\n1️⃣  Citizenship\n2️⃣  Educational Documents\n3️⃣  Land Owner Certificate\n` +
    `4️⃣  Tax Clearance\n5️⃣  Property Tax Receipt\n6️⃣  Verification From Ward Office\n7️⃣  Others\n\n` +
    `0️⃣  Back to Services`
  );
}

function sendPaymentMenu(senderId, intro) {
  sendText(senderId,
    `${intro}\n\n1️⃣  eSewa\n2️⃣  Khalti\n3️⃣  Bank Transfer\n\n0️⃣  Back to Main Menu`
  );
}

function sendPaymentDetails(senderId, method, qrUrl, orderSummary) {
  if (qrUrl !== 'BANK_QR_COMING_SOON') {
    return sendText(senderId,
      `✅ Order Summary:\n${orderSummary}\n\n💳 Payment: ${method}\n\n` +
      `📸 Tap link to view QR & scan to pay:\n👉 ${qrUrl}\n\n` +
      `After payment send screenshot 🙏\n\n— Online Service Nepal`
    );
  }
  return sendText(senderId,
    `✅ Order Summary:\n${orderSummary}\n\n💳 Bank Transfer\n\nOur team will send bank details shortly! 🙏`
  );
}

// ==============================
// 🤖 Gemini Intent Classifier
// ==============================
async function classifyIntent(userMessage) {
  if (!GEMINI_KEY) return 'OUT_OF_SCOPE';
  try {
    const response = await axios.post(GEMINI_URL, {
      contents: [{ parts: [{ text: INTENT_PROMPT + '\n\nCustomer message: ' + userMessage }] }]
    });
    const intent = response.data.candidates[0].content.parts[0].text.trim().toUpperCase();
    console.log(`🤖 Intent classified: ${intent}`);
    const validIntents = ['GOOGLE_PRICE','APPLE_PRICE','RECHARGE','TRANSLATION','FAQ_DELIVERY','FAQ_NEPAL','FAQ_PAYMENT','OUT_OF_SCOPE'];
    return validIntents.includes(intent) ? intent : 'OUT_OF_SCOPE';
  } catch (err) {
    console.error('❌ Gemini error:', err.response?.status, err.response?.data?.error?.message);
    return 'OUT_OF_SCOPE';
  }
}

// ==============================
// 🎯 Handle Intent
// ==============================
async function handleIntent(senderId, intent) {
  switch(intent) {
    case 'GOOGLE_PRICE':
      return sendGoogleMenuText(senderId);
    case 'APPLE_PRICE':
      return sendAppleMenuText(senderId);
    case 'RECHARGE':
      return sendRechargeMenuText(senderId);
    case 'TRANSLATION':
      return sendTranslationMenuText(senderId);
    case 'FAQ_DELIVERY':
      return sendText(senderId,
        `⏱️ After payment confirmation from our end, it takes 10-15 minutes to complete your order!\n\nType MENU to browse our services 😊`
      );
    case 'FAQ_NEPAL':
      return sendText(senderId,
        `Great question! 😊\n\nWe recommend trying our exclusive Trial Pack first to check if your Google Indian Play Account works in Nepal!\n\n▪️ INR 10 @ NRs.25 only\n\nType 3 to order Trial Pack now! 🎮`
      );
    case 'FAQ_PAYMENT':
      return sendText(senderId,
        `💳 We accept the following payment methods:\n\n✅ eSewa\n✅ Khalti\n✅ Bank Transfer\n\nType 1 to Browse Services and proceed to payment! 😊`
      );
    case 'OUT_OF_SCOPE':
    default:
      userState[senderId] = { waitingForHuman: true };
      return sendText(senderId,
        `Thanks for your message! 🙏\n\nOur team will get back to you shortly.\n\n— Online Service Nepal\n\nReply MENU anytime to browse our services 😊`
      );
  }
}

function sendText(senderId, text) {
  return axios.post(
    `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
    { recipient: { id: senderId }, message: { text } }
  ).catch(err => console.error('❌ Send error:', JSON.stringify(err.response?.data)));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Online Service Nepal Bot running on port ${PORT}`));