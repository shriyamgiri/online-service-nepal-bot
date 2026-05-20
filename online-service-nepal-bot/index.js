const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// ==============================
// 🔧 YOUR SETTINGS
// ==============================
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = 'onlineservicenepal123';
const ADMIN_ID = process.env.ADMIN_ID;
const REVIEW_LINK = 'https://www.facebook.com/onlineservicenepalNo.1/reviews';
const SESSION_TIMEOUT = 45 * 60 * 1000; // 45 minutes
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

// ==============================
// 🤖 Gemini AI System Prompt
// ==============================
const AI_SYSTEM_PROMPT = `You are a helpful assistant for "Online Service Nepal" - a digital services business in Nepal.

PRODUCTS & PRICES:
1. Google Play Redeem Code (INDIA REGION ONLY)
   - Trial Pack: INR 10 @ NRs.25 (Recommended for first time users to check if their account works)
   - Regular: 50 INR @ NRs.95, 100 INR @ NRs.185, 150 INR @ NRs.275, 200 INR @ NRs.365, 250 INR @ NRs.455, 300 INR @ NRs.545, 500 INR @ NRs.885, 1000 INR @ NRs.1720

2. Apple iTunes Redeem Code (INDIA REGION ONLY)
   - 100 INR @ NRs.185, 150 INR @ NRs.275, 200 INR @ NRs.365, 250 INR @ NRs.455, 300 INR @ NRs.545, 500 INR @ NRs.885, 1000 INR @ NRs.1720

3. Indian Mobile Recharge
   - Operators: Airtel, Jio, Vi, BSNL
   - Prices vary - our team will contact after order

4. Document Translation
   - Citizenship, Educational Documents, Land Owner Certificate, Tax Clearance, Property Tax Receipt, Verification From Ward Office, Others

PAYMENT METHODS: eSewa, Khalti, Bank Transfer
DELIVERY TIME: 10-15 minutes after payment confirmation from our end

IMPORTANT RULES:
- Reply in the SAME language customer uses (Nepali, English or mixed)
- Keep replies SHORT and to the point (max 3-4 lines)
- NEVER make up information not listed above
- NEVER discuss unrelated topics
- Always end with a helpful navigation hint

REGION RESTRICTIONS:
- Google Play codes work ONLY with INDIA-based Google Play accounts
- Apple iTunes codes work ONLY with INDIA-based Apple ID accounts
- If customer asks for OTHER regions (US, UK, Nepal, Australia, etc.) → Reply: "Sorry, we only sell codes for India region. 😊 Our Google Play and Apple iTunes codes work only with India-based accounts. Type MENU to see our services!"

SPECIFIC FAQ ANSWERS:
- If asked about delivery time / "kati time lagxa" / "kahile painxa" → Reply: "Payment confirm bhayepachi 10-15 minutes bhitra tapaiko order complete hunxa! ⏱️ Type MENU if you need anything else 😊"
- If asked if Google India code works in Nepal / "Nepal ma kaam garxa?" → Reply: "Hami recommend garxau ki pahila hamro Trial Pack try garnus (INR 10 @ NRs.25) to check if your Google Play account works in Nepal! Type 3 to order Trial Pack 😊"
- If asked about OTHER regions (US/UK/Nepal/etc codes) / "US ko code xa?" / "America ko lagi?" → Reply: "Sorry, we only sell codes for India region. 😊 Our codes work only with India-based accounts. Type MENU to see our services!"
- If customer says thanks/ok/bye → Reply warmly and say "Type MENU if you need anything else! 😊"
- If question is completely unrelated → Reply: "Sorry, I can only help with our digital services! 😊 Type 1 to Browse Services or Type 2 to Talk to Our Team"
- If asked about price → Show relevant price list and guide to order`;

// ==============================
// 💳 QR CODE URLs
// ==============================
const QR_CODES = {
  esewa:  'https://drive.google.com/uc?export=view&id=1NoIUX3PqTLzIc2kx9lH7NxwxljqxR9cb',
  khalti: 'https://drive.google.com/uc?export=view&id=1N67wvplKTe7ttjHXsZRLMVIOII94gd3H',
  bank:   'BANK_QR_COMING_SOON'
};

// ==============================
// 💾 User State & Tracking
// ==============================
const userState = {};
const userLastSeen = {};
const knownUsers = {};

// ==============================
// ✅ Webhook Verification
// ==============================
// ==============================
// 💓 Health Check for UptimeRobot
// ==============================
app.get('/health', (req, res) => {
  res.status(200).send('✅ Bot is Running!');
});

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
// ⏱️ Session Timeout Checker
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
// 💬 Handle Text Messages
// ==============================
async function handleMessage(senderId, message) {
  const text    = (message.text || '').toLowerCase().trim();
  const rawText = (message.text || '').trim();

  // ─── Log Sender ID ───
  console.log('👤 Sender ID:', senderId);

  // ─── Customer sent image/screenshot ───
  if (message.attachments && message.attachments[0].type === 'image') {
    if (userState[senderId] && userState[senderId].waitingForPaymentConfirm) return;
    userState[senderId] = {
      ...userState[senderId],
      waitingForPaymentConfirm: true
    };
    return sendText(senderId,
      `We received your image!\n\n` +
      `Is this a payment screenshot?\n\n` +
      `1️⃣  Yes — Payment Screenshot\n` +
      `2️⃣  No — Something Else`
    );
  }

  // ─── Waiting for payment screenshot confirmation ───
  if (userState[senderId] && userState[senderId].waitingForPaymentConfirm) {
    if (text === '1') {
      const lastOrder = userState[senderId].lastOrder || 'your order';
      userState[senderId] = { waitingForOrder: true, lastOrder };
      // Notify admin
      sendText(ADMIN_ID,
        `💰 Payment Confirmed!\n\n` +
        `👤 Customer ID: ${senderId}\n` +
        `🛒 Last Order: ${lastOrder}\n\n` +
        `⬇️ Copy & send this to complete:\n` +
        `COMPLETE ${senderId} ${lastOrder}`
      );
      return sendText(senderId,
        `📸 Payment Screenshot Received!\n\n` +
        `✅ Thank you for your payment!\n\n` +
        `Our team will verify and process\n` +
        `your order shortly! 🙏\n\n` +
        `— Online Service Nepal\n\n` +
        `Feel free to send any follow up\n` +
        `message if needed! 😊`
      );
    }
    if (text === '2') {
      delete userState[senderId].waitingForPaymentConfirm;
      return sendText(senderId,
        `No problem! 😊\n\n` +
        `What would you like to do?\n\n` +
        `1️⃣  Browse Services 🛒\n` +
        `2️⃣  Talk to Our Team 💬\n\n` +
        `Type 1 or 2 to continue...`
      );
    }
    return sendText(senderId,
      `Please reply:\n` +
      `1️⃣  Yes — Payment Screenshot\n` +
      `2️⃣  No — Something Else`
    );
  }

  // ─── Waiting for order (after payment confirmed) ───
  // Customer can send follow up messages freely
  if (userState[senderId] && userState[senderId].waitingForOrder) {
    if (['menu', 'hi', 'hello', 'start'].includes(text)) {
      delete userState[senderId];
      return sendWelcome(senderId);
    }
    return sendText(senderId,
      `✅ Your message has been received!\n\n` +
      `Our team will get back to you shortly! 🙏\n\n` +
      `— Online Service Nepal`
    );
  }

  // ─── Admin COMPLETE command ───
  if (senderId === ADMIN_ID && rawText.toUpperCase().startsWith('COMPLETE')) {
    const parts = rawText.split(' ');
    const customerId  = parts[1];
    const orderDetails = parts.slice(2).join(' ');
    if (customerId && orderDetails) {
      delete userState[customerId]; // clear customer session
      sendText(customerId,
        `✅ Your Order is Completed!\n\n` +
        `📦 ${orderDetails}\n\n` +
        `Thank you for choosing Online Service Nepal! 🙏\n\n` +
        `⭐ Happy with our service? Please take 30 seconds to leave us a review:\n\n` +
        `👉 ${REVIEW_LINK}\n\n` +
        `Your review helps us serve you better! 🇳🇵`
      );
      return sendText(ADMIN_ID, `✅ Order completed for customer: ${customerId}`);
    }
    return sendText(ADMIN_ID, `⚠️ Format: COMPLETE [CustomerID] [OrderDetails]`);
  }

  // ─── Check session timeout ───
  const sessionExpired = checkSession(senderId);
  if (sessionExpired) {
    const greeting = getGreeting();
    return sendText(senderId,
      `👋 Welcome back!\n\n` +
      `${greeting}! Your previous session has expired.\n\n` +
      `Let's start fresh! 😊`
    ).then(() => sendWelcome(senderId));
  }

  // ─── Waiting for mobile number ───
  if (userState[senderId] && userState[senderId].waitingForPhone) {
    const operator = userState[senderId].operator;
    userState[senderId] = { waitingForPlan: true, operator, phone: rawText };
    return sendText(senderId,
      `📱 Mobile Number: ${rawText}\n\n` +
      `Please type your preferred recharge plan:\n\n` +
      `Example:\n` +
      `▪️ 28 days 1.5GB/day\n` +
      `▪️ 84 days unlimited\n` +
      `▪️ 239 plan\n\n` +
      `Type your plan or amount below:`
    );
  }

  // ─── Waiting for recharge plan ───
  if (userState[senderId] && userState[senderId].waitingForPlan) {
    const { operator, phone } = userState[senderId];
    delete userState[senderId];
    return sendText(senderId,
      `✅ Order Received!\n\n` +
      `📶 Operator: ${operator}\n` +
      `📞 Mobile: ${phone}\n` +
      `📋 Plan: ${rawText}\n\n` +
      `Our team will contact you shortly! 🙏\n\n` +
      `— Online Service Nepal\n\n` +
      `Reply MENU to go back to main menu.`
    );
  }

  // ─── Waiting for payment method ───
  if (userState[senderId] && userState[senderId].waitingForPayment) {
    const { orderSummary } = userState[senderId];
    if (text === '1') { delete userState[senderId]; return sendPaymentDetails(senderId, 'eSewa', QR_CODES.esewa, orderSummary); }
    if (text === '2') { delete userState[senderId]; return sendPaymentDetails(senderId, 'Khalti', QR_CODES.khalti, orderSummary); }
    if (text === '3') { delete userState[senderId]; return sendPaymentDetails(senderId, 'Bank Transfer', QR_CODES.bank, orderSummary); }
    if (text === '0') { delete userState[senderId]; return sendMainMenu(senderId); }
    return sendPaymentMenu(senderId, 'Please reply 1, 2 or 3 to select payment:');
  }

  // ─── Waiting for Google Pack Type ───
  if (userState[senderId] && userState[senderId].waitingForGooglePack) {
    if (text === '1') return sendGoogleTrialPack(senderId);
    if (text === '2') return sendGoogleRegularPack(senderId);
    if (text === '0') { delete userState[senderId]; return sendServicesMenu(senderId); }
    return sendGoogleMenuText(senderId);
  }

  // ─── Waiting for Google Trial confirmation ───
  if (userState[senderId] && userState[senderId].waitingForGoogleTrial) {
    if (text === '1') {
      userState[senderId] = {
        waitingForPayment: true,
        lastOrder: 'Google Play Trial Pack - INR 10 @ NRs.25',
        orderSummary: '🎮 Google Play Redeem Code (India Region)\n▪️ Trial Pack - INR 10 @ NRs.25'
      };
      return sendPaymentMenu(senderId,
        `🎮 Google Play - Trial Pack\n✅ Selected: INR 10 @ NRs.25\n\nSelect payment method:`
      );
    }
    if (text === '0') { delete userState[senderId]; return sendGoogleMenuText(senderId); }
    return sendGoogleTrialPack(senderId);
  }

  // ─── Waiting for Google Regular amount ───
  if (userState[senderId] && userState[senderId].waitingForGoogleRegular) {
    const googlePrices = {
      '1': '50 INR @ NRs.95',
      '2': '100 INR @ NRs.185',
      '3': '150 INR @ NRs.275',
      '4': '200 INR @ NRs.365',
      '5': '250 INR @ NRs.455',
      '6': '300 INR @ NRs.545',
      '7': '500 INR @ NRs.885',
      '8': '1000 INR @ NRs.1720'
    };
    if (text === '0') { delete userState[senderId]; return sendGoogleMenuText(senderId); }
    const selected = googlePrices[text];
    if (selected) {
      userState[senderId] = {
        waitingForPayment: true,
        lastOrder: `Google Play Regular - ${selected}`,
        orderSummary: `🎮 Google Play Redeem Code (India Region)\n▪️ ${selected}`
      };
      return sendPaymentMenu(senderId,
        `🎮 Google Play - Regular Pack\n✅ Selected: ${selected}\n\n` +
        `⚠️ India Region Only - Requires India-based Google Play account.\n\nSelect payment method:`
      );
    }
    return sendGoogleRegularPack(senderId);
  }

  // ─── Waiting for Apple amount ───
  if (userState[senderId] && userState[senderId].waitingForApple) {
    const applePrices = {
      '1': '100 INR @ NRs.185',
      '2': '150 INR @ NRs.275',
      '3': '200 INR @ NRs.365',
      '4': '250 INR @ NRs.455',
      '5': '300 INR @ NRs.545',
      '6': '500 INR @ NRs.885',
      '7': '1000 INR @ NRs.1720'
    };
    if (text === '0') { delete userState[senderId]; return sendServicesMenu(senderId); }
    const selected = applePrices[text];
    if (selected) {
      userState[senderId] = {
        waitingForPayment: true,
        lastOrder: `Apple iTunes - ${selected}`,
        orderSummary: `🍎 Apple iTunes Redeem Code (India Region)\n▪️ ${selected}`
      };
      return sendPaymentMenu(senderId,
        `🍎 Apple iTunes Redeem Code\n✅ Selected: ${selected}\n\n` +
        `⚠️ India Region Only - Requires India-based Apple ID account.\n\nSelect payment method:`
      );
    }
    return sendAppleMenuText(senderId);
  }

  // ─── Waiting for Operator ───
  if (userState[senderId] && userState[senderId].waitingForOperator) {
    const operators = { '1': 'Airtel', '2': 'Jio', '3': 'Vi', '4': 'BSNL' };
    if (text === '0') { delete userState[senderId]; return sendServicesMenu(senderId); }
    const operator = operators[text];
    if (operator) {
      delete userState[senderId];
      userState[senderId] = { waitingForPhone: true, operator };
      return sendText(senderId, `📶 Operator: ${operator}\n\nPlease type your mobile number:`);
    }
    return sendRechargeMenuText(senderId);
  }

  // ─── Waiting for Document type ───
  if (userState[senderId] && userState[senderId].waitingForDoc) {
    const docs = {
      '1': 'Citizenship',
      '2': 'Educational Documents',
      '3': 'Land Owner Certificate',
      '4': 'Tax Clearance',
      '5': 'Property Tax Receipt',
      '6': 'Verification From Ward Office',
      '7': 'Others'
    };
    if (text === '0') { delete userState[senderId]; return sendServicesMenu(senderId); }
    const doc = docs[text];
    if (doc) {
      delete userState[senderId];
      return sendText(senderId,
        `📄 Document Translation\n✅ Selected: ${doc}\n\n` +
        `Our team will contact you shortly! 🙏\n\n` +
        `— Online Service Nepal\n\nReply MENU to go back.`
      );
    }
    return sendTranslationMenuText(senderId);
  }

  // ─── Waiting for support query ───
  if (userState[senderId] && userState[senderId].waitingForSupport) {
    delete userState[senderId];
    return sendText(senderId,
      `✅ Thank you for reaching out!\n\n` +
      `💬 Your message has been received.\n\n` +
      `Our team will contact you shortly! 🙏\n\n` +
      `— Online Service Nepal\n\nReply MENU to go back to main menu.`
    );
  }

  // ─── Main triggers ───
  if (['hi', 'hello', 'namaste', 'hey', 'start', 'menu'].includes(text)) {
    return sendWelcome(senderId);
  }

  // ─── Main option selection ───
  if (text === '1') return sendServicesMenu(senderId);
  if (text === '2') return sendSupportMenu(senderId);

  // ─── Services option selection ───
  if (text === '3') return sendGoogleMenuText(senderId);
  if (text === '4') return sendAppleMenuText(senderId);
  if (text === '5') return sendRechargeMenuText(senderId);
  if (text === '6') return sendTranslationMenuText(senderId);

  // ─── AI Fallback for unknown messages ───
  getAIReply(rawText).then(aiReply => {
    sendText(senderId, aiReply);
  });
}

// ==============================
// 🔘 Handle Postbacks
// ==============================
function handlePostback(senderId) {
  sendWelcome(senderId);
}

// ==============================
// 👋 Welcome Message
// ==============================
function sendWelcome(senderId) {
  const greeting   = getGreeting();
  const isReturning = knownUsers[senderId];
  knownUsers[senderId] = true;
  userState[senderId]  = {};

  if (isReturning) {
    sendText(senderId,
      `👋 Welcome Back!\n` +
      `${greeting}! Great to see you again! 🙏\n\n` +
      `How can we help you today?\n\n` +
      `1️⃣  Browse Services 🛒\n` +
      `2️⃣  Talk to Our Team 💬\n\n` +
      `Type 1 or 2 to continue...`
    );
  } else {
    sendText(senderId,
      `🙏 ${greeting}!\n` +
      `Welcome to Online Service Nepal! 🇳🇵\n\n` +
      `We provide fast & reliable digital services.\n\n` +
      `How can we help you today?\n\n` +
      `1️⃣  Browse Services 🛒\n` +
      `2️⃣  Talk to Our Team 💬\n\n` +
      `Type 1 or 2 to continue...`
    );
  }
}

// ==============================
// 🏠 Main Menu
// ==============================
function sendMainMenu(senderId) {
  userState[senderId] = {};
  sendText(senderId,
    `How can we help you today?\n\n` +
    `1️⃣  Browse Services 🛒\n` +
    `2️⃣  Talk to Our Team 💬\n\n` +
    `Type 1 or 2 to continue...`
  );
}

// ==============================
// 🛒 Services Menu
// ==============================
function sendServicesMenu(senderId) {
  userState[senderId] = { inServices: true };
  sendText(senderId,
    `🛒 Our Services\n\n` +
    `Please reply with a number:\n\n` +
    `3️⃣  Google Play Redeem Code (India Region) 🎮\n` +
    `4️⃣  Apple iTunes Redeem Code (India Region) 🍎\n` +
    `5️⃣  Indian Mobile Recharge 📱\n` +
    `6️⃣  Document Translation 📄\n\n` +
    `0️⃣  Back to Main Menu`
  );
}

// ==============================
// 💬 Support Menu
// ==============================
function sendSupportMenu(senderId) {
  userState[senderId] = { waitingForSupport: true };
  sendText(senderId,
    `💬 Talk to Our Team\n\n` +
    `Please describe your query below\n` +
    `and we will get back to you shortly:\n\n` +
    `Type your message now... 👇`
  );
}

// ==============================
// 🎮 Google Play Redeem Code Menu
// ==============================
function sendGoogleMenuText(senderId) {
  userState[senderId] = { waitingForGooglePack: true };
  sendText(senderId,
    `🎮 Google Play Redeem Code\n` +
    `⚠️ India Region Only\n\n` +
    `Please select a pack:\n\n` +
    `1️⃣  Trial Pack\n` +
    `2️⃣  Regular Pack\n\n` +
    `0️⃣  Back to Services`
  );
}

// ==============================
// 🎮 Google Trial Pack
// ==============================
function sendGoogleTrialPack(senderId) {
  userState[senderId] = { waitingForGoogleTrial: true };
  sendText(senderId,
    `🎮 Google Play Redeem Code\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `⚠️ Before Buying This!!!\n\n` +
    `Try our exclusive "Trial Pack" to check\n` +
    `your Google Indian Play Account is\n` +
    `working in Nepal.\n\n` +
    `▪️ INR 10 for NRs. 25/-\n\n` +
    `⚠️ India Region Only - Requires India-based Google Play account\n` +
    `🚫 Non-Refundable.\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `1️⃣  Proceed to Buy\n` +
    `0️⃣  Back`
  );
}

// ==============================
// 🎮 Google Regular Pack
// ==============================
function sendGoogleRegularPack(senderId) {
  userState[senderId] = { waitingForGoogleRegular: true };
  sendText(senderId,
    `🎮 Google Play Redeem Code\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🔸 Regular Pack\n\n` +
    `Reply with number to select:\n\n` +
    `1️⃣  50 INR @ NRs.95\n` +
    `2️⃣  100 INR @ NRs.185\n` +
    `3️⃣  150 INR @ NRs.275\n` +
    `4️⃣  200 INR @ NRs.365\n` +
    `5️⃣  250 INR @ NRs.455\n` +
    `6️⃣  300 INR @ NRs.545\n` +
    `7️⃣  500 INR @ NRs.885\n` +
    `8️⃣  1000 INR @ NRs.1720\n\n` +
    `⚠️ India Region Only - Requires India-based Google Play account\n` +
    `🚫 Non-Refundable.\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `0️⃣  Back`
  );
}

// ==============================
// 🍎 Apple iTunes Menu
// ==============================
function sendAppleMenuText(senderId) {
  userState[senderId] = { waitingForApple: true };
  sendText(senderId,
    `🍎 Apple iTunes Redeem Code\n` +
    `⚠️ India Region Only\n\n` +
    `Reply with number to select:\n\n` +
    `1️⃣  100 INR @ NRs.185\n` +
    `2️⃣  150 INR @ NRs.275\n` +
    `3️⃣  200 INR @ NRs.365\n` +
    `4️⃣  250 INR @ NRs.455\n` +
    `5️⃣  300 INR @ NRs.545\n` +
    `6️⃣  500 INR @ NRs.885\n` +
    `7️⃣  1000 INR @ NRs.1720\n\n` +
    `⚠️ Requires India-based Apple ID account\n\n` +
    `0️⃣  Back to Services`
  );
}

// ==============================
// 📱 Mobile Recharge Menu
// ==============================
function sendRechargeMenuText(senderId) {
  userState[senderId] = { waitingForOperator: true };
  sendText(senderId,
    `📱 Indian Mobile Recharge\n\n` +
    `Reply with operator number:\n\n` +
    `1️⃣  Airtel\n` +
    `2️⃣  Jio\n` +
    `3️⃣  Vi\n` +
    `4️⃣  BSNL\n\n` +
    `0️⃣  Back to Services`
  );
}

// ==============================
// 📄 Document Translation Menu
// ==============================
function sendTranslationMenuText(senderId) {
  userState[senderId] = { waitingForDoc: true };
  sendText(senderId,
    `📄 Official Document Translation\n\n` +
    `Reply with number to select:\n\n` +
    `1️⃣  Citizenship\n` +
    `2️⃣  Educational Documents\n` +
    `3️⃣  Land Owner Certificate\n` +
    `4️⃣  Tax Clearance\n` +
    `5️⃣  Property Tax Receipt\n` +
    `6️⃣  Verification From Ward Office\n` +
    `7️⃣  Others\n\n` +
    `0️⃣  Back to Services`
  );
}

// ==============================
// 💳 Payment Menu
// ==============================
function sendPaymentMenu(senderId, intro) {
  sendText(senderId,
    `${intro}\n\n` +
    `1️⃣  eSewa\n` +
    `2️⃣  Khalti\n` +
    `3️⃣  Bank Transfer\n\n` +
    `0️⃣  Back to Main Menu`
  );
}

// ==============================
// 💳 Payment Details + QR
// ==============================
function sendPaymentDetails(senderId, method, qrUrl, orderSummary) {
  sendText(senderId,
    `✅ Order Summary:\n${orderSummary}\n\n` +
    `💳 Payment Method: ${method}\n\n` +
    `📸 Scan the QR code below to pay.\n` +
    `After payment, please send us the screenshot.\n` +
    `Our team will verify and process your order shortly! 🙏\n\n` +
    `— Online Service Nepal`
  );
  if (qrUrl !== 'BANK_QR_COMING_SOON') {
    return axios.post(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        recipient: { id: senderId },
        message: {
          attachment: {
            type: 'image',
            payload: { url: qrUrl, is_reusable: true }
          }
        }
      }
    ).catch(err => console.error('❌ QR Send error:', JSON.stringify(err.response?.data)));
  } else {
    sendText(senderId,
      `🏦 Bank Transfer:\n` +
      `Our team will send you the bank details shortly! 🙏`
    );
  }
}

// ==============================
// 🤖 Gemini AI Function
// ==============================
async function getAIReply(userMessage) {
  try {
    const response = await axios.post(GEMINI_URL, {
      contents: [{
        parts: [{
          text: AI_SYSTEM_PROMPT + '\n\nCustomer message: ' + userMessage
        }]
      }]
    });
    const reply = response.data.candidates[0].content.parts[0].text;
    return reply.trim();
  } catch (err) {
    console.error('❌ Gemini error:', err.response?.data || err.message);
    return "Sorry, I am having trouble understanding that right now! 😊\n\nType 1 to Browse Services\nType 2 to Talk to Our Team\nType MENU to start over!";
  }
}

// ==============================
// 🛠️ Helper Function
// ==============================
function sendText(senderId, text) {
  return axios.post(
    `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
    { recipient: { id: senderId }, message: { text } }
  ).catch(err => console.error('❌ Send error:', JSON.stringify(err.response?.data)));
}

// ==============================
// 🚀 Start Server
// ==============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Online Service Nepal Bot running on port ${PORT}`);
});