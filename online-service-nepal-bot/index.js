const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// ==============================
// 🔧 YOUR SETTINGS
// ==============================
const PAGE_ACCESS_TOKEN = 'EAAU7o8WbgJsBRf69vaXXiCmumZBHeNiX1Mj39eaZAveWlWDLdu7V2AEhZCYmD3Eci1ISNI5cTk1vzN5To7X5fJmUy1EdLJ527BOmn8PtsAuXfbMS6JnOW4sraIVq1JcxtgEpV4r9I8cAMZBkqYUOqNUMyoM80NqxT2iBK5rbZCStnsCkaYxDek6mvGhq0pVmkVlmCnhsoygZDZD'; // Paste your token here
const VERIFY_TOKEN = 'onlineservicenepal123';
const ADMIN_ID = '3296330223785000'; // Your personal Facebook user ID
const REVIEW_LINK = 'https://www.facebook.com/onlineservicenepalNo.1/reviews';
const SESSION_TIMEOUT = 45 * 60 * 1000; // 45 minutes in milliseconds

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
const userLastSeen = {};   // tracks last message time
const knownUsers = {};     // tracks if user has chatted before

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
// ⏱️ Session Timeout Checker
// ==============================
function checkSession(senderId) {
  const now = Date.now();
  const lastSeen = userLastSeen[senderId];

  if (lastSeen && (now - lastSeen) > SESSION_TIMEOUT) {
    // Session expired — reset
    delete userState[senderId];
    userLastSeen[senderId] = now;
    return true; // session was expired
  }

  userLastSeen[senderId] = now;
  return false; // session is still active
}

// ==============================
// 🌅 Time Based Greeting
// ==============================
function getGreeting() {
  const hour = new Date().getUTCHours() + 5; // Nepal is UTC+5:45
  const mins = 45;
  const nepalHour = (hour + Math.floor(mins / 60)) % 24;

  if (nepalHour >= 5 && nepalHour < 12)  return '🌅 Good Morning';
  if (nepalHour >= 12 && nepalHour < 17) return '☀️ Good Afternoon';
  if (nepalHour >= 17 && nepalHour < 21) return '🌆 Good Evening';
  return '🌙 Good Night';
}

// ==============================
// 💬 Handle Text Messages
// ==============================
function handleMessage(senderId, message) {
  const text = (message.text || '').toLowerCase().trim();
  const rawText = (message.text || '').trim();

  // ─── Log Sender ID (to find Admin ID) ───
  console.log('👤 Sender ID:', senderId);

  // ─── Customer sent an image/screenshot ───
  if (message.attachments && message.attachments[0].type === 'image') {
    // If already waiting for payment confirmation
    if (userState[senderId] && userState[senderId].waitingForPaymentConfirm) {
      return; // already asked, wait for yes/no
    }
    userState[senderId] = { waitingForPaymentConfirm: true };
    return sendText(senderId,
      `📸 We received your image!\n\n` +
      `Is this a payment screenshot?\n\n` +
      `1️⃣  Yes — Payment Screenshot\n` +
      `2️⃣  No — Something Else`
    );
  }

  // ─── Waiting for payment screenshot confirmation ───
  if (userState[senderId] && userState[senderId].waitingForPaymentConfirm) {
    if (text === '1') {
      delete userState[senderId];
      return sendText(senderId,
        `📸 Payment Screenshot Received!\n\n` +
        `✅ Thank you for your payment!\n\n` +
        `Our team will verify and process\n` +
        `your order shortly! 🙏\n\n` +
        `— Online Service Nepal`
      );
    }
    if (text === '2') {
      delete userState[senderId];
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

  // ─── Admin COMPLETE command ───
  if (senderId === ADMIN_ID && rawText.toUpperCase().startsWith('COMPLETE')) {
    const parts = rawText.split(' ');
    const customerId = parts[1];
    const orderDetails = parts.slice(2).join(' ');
    if (customerId && orderDetails) {
      sendText(customerId,
        `✅ Your Order is Completed!\n\n` +
        `📦 ${orderDetails}\n\n` +
        `Thank you for choosing Online Service Nepal! 🙏\n\n` +
        `⭐ Happy with our service? Please take 30 seconds to leave us a review:\n\n` +
        `👉 ${REVIEW_LINK}\n\n` +
        `Your review helps us serve you better! 🇳🇵`
      );
      return sendText(senderId, `✅ Order completion sent to customer: ${customerId}`);
    }
    return sendText(senderId, `⚠️ Format: COMPLETE [CustomerID] [OrderDetails]`);
  }

  // ─── Check session timeout ───
  const sessionExpired = checkSession(senderId);
  if (sessionExpired) {
    const greeting = getGreeting();
    return sendText(senderId,
      `👋 Welcome back!\n\n` +
      `${greeting}! Your previous session has expired.\n\n` +
      `Let's start fresh! 😊\n\n` +
      `Reply MENU to see our options.`
    ).then(() => sendMainMenu(senderId));
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

  // ─── Waiting for Google amount ───
  if (userState[senderId] && userState[senderId].waitingForGoogle) {
    const googlePrices = {
      '1': 'Trial Pack - INR 10 @ NRs.25',
      '2': '50 INR @ NRs.95',
      '3': '100 INR @ NRs.185',
      '4': '150 INR @ NRs.275',
      '5': '200 INR @ NRs.365',
      '6': '250 INR @ NRs.455',
      '7': '300 INR @ NRs.545',
      '8': '500 INR @ NRs.885',
      '9': '1000 INR @ NRs.1720'
    };
    if (text === '0') { delete userState[senderId]; return sendMainMenu(senderId); }
    const selected = googlePrices[text];
    if (selected) {
      userState[senderId] = {
        waitingForPayment: true,
        orderSummary: `🎮 Google INR Redeem Code\n▪️ ${selected}`
      };
      return sendPaymentMenu(senderId,
        `🎮 Google INR Redeem Code\n✅ Selected: ${selected}\n\n` +
        `⚠️ Requires India based Google Play account.\n\nSelect payment method:`
      );
    }
    return sendGoogleMenuText(senderId);
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
    if (text === '0') { delete userState[senderId]; return sendMainMenu(senderId); }
    const selected = applePrices[text];
    if (selected) {
      userState[senderId] = {
        waitingForPayment: true,
        orderSummary: `🍎 Apple iTunes Redeem Code\n▪️ ${selected}`
      };
      return sendPaymentMenu(senderId,
        `🍎 Apple iTunes Redeem Code\n✅ Selected: ${selected}\n\n` +
        `⚠️ Requires India based Apple ID account.\n\nSelect payment method:`
      );
    }
    return sendAppleMenuText(senderId);
  }

  // ─── Waiting for Operator ───
  if (userState[senderId] && userState[senderId].waitingForOperator) {
    const operators = { '1': 'Airtel', '2': 'Jio', '3': 'Vi', '4': 'BSNL' };
    if (text === '0') { delete userState[senderId]; return sendMainMenu(senderId); }
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
    if (text === '0') { delete userState[senderId]; return sendMainMenu(senderId); }
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

  // ─── Main menu triggers ───
  if (['hi', 'hello', 'namaste', 'hey', 'start', 'menu'].includes(text)) {
    return sendWelcome(senderId);
  }

  // ─── Main option selection ───
  if (text === '1') return sendServicesMenu(senderId);
  if (text === '2') return sendSupportMenu(senderId);

  // ─── Services option selection ───
  if (text === 'a') return sendGoogleMenuText(senderId);
  if (text === 'b') return sendAppleMenuText(senderId);
  if (text === 'c') return sendRechargeMenuText(senderId);
  if (text === 'd') return sendTranslationMenuText(senderId);

  // Default
  sendWelcome(senderId);
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
  const greeting = getGreeting();
  const isReturning = knownUsers[senderId];
  knownUsers[senderId] = true;
  userState[senderId] = {};

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
// 🏠 Main Menu (after welcome)
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
    `Please reply with a letter:\n\n` +
    `A  Google INR Redeem Code 🎮\n` +
    `B  Apple iTunes Redeem Code 🍎\n` +
    `C  Indian Mobile Recharge 📱\n` +
    `D  Document Translation 📄\n\n` +
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
// 🎮 Google INR Menu
// ==============================
function sendGoogleMenuText(senderId) {
  userState[senderId] = { waitingForGoogle: true };
  sendText(senderId,
    `🎮 Google INR Redeem Code\n\n` +
    `Reply with number to select:\n\n` +
    `1️⃣  Trial Pack - INR 10 @ NRs.25\n` +
    `2️⃣  50 INR @ NRs.95\n` +
    `3️⃣  100 INR @ NRs.185\n` +
    `4️⃣  150 INR @ NRs.275\n` +
    `5️⃣  200 INR @ NRs.365\n` +
    `6️⃣  250 INR @ NRs.455\n` +
    `7️⃣  300 INR @ NRs.545\n` +
    `8️⃣  500 INR @ NRs.885\n` +
    `9️⃣  1000 INR @ NRs.1720\n\n` +
    `0️⃣  Back to Main Menu`
  );
}

// ==============================
// 🍎 Apple iTunes Menu
// ==============================
function sendAppleMenuText(senderId) {
  userState[senderId] = { waitingForApple: true };
  sendText(senderId,
    `🍎 Apple iTunes Redeem Code\n\n` +
    `Reply with number to select:\n\n` +
    `1️⃣  100 INR @ NRs.185\n` +
    `2️⃣  150 INR @ NRs.275\n` +
    `3️⃣  200 INR @ NRs.365\n` +
    `4️⃣  250 INR @ NRs.455\n` +
    `5️⃣  300 INR @ NRs.545\n` +
    `6️⃣  500 INR @ NRs.885\n` +
    `7️⃣  1000 INR @ NRs.1720\n\n` +
    `0️⃣  Back to Main Menu`
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
    `0️⃣  Back to Main Menu`
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
    `0️⃣  Back to Main Menu`
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
      `🏦 Bank Transfer details:\n` +
      `Our team will send you the bank details shortly! 🙏`
    );
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