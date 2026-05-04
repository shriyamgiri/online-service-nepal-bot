const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// ==============================
// 🔧 YOUR SETTINGS
// ==============================
const PAGE_ACCESS_TOKEN = 'EAAU7o8WbgJsBRf69vaXXiCmumZBHeNiX1Mj39eaZAveWlWDLdu7V2AEhZCYmD3Eci1ISNI5cTk1vzN5To7X5fJmUy1EdLJ527BOmn8PtsAuXfbMS6JnOW4sraIVq1JcxtgEpV4r9I8cAMZBkqYUOqNUMyoM80NqxT2iBK5rbZCStnsCkaYxDek6mvGhq0pVmkVlmCnhsoygZDZD';
const VERIFY_TOKEN = 'onlineservicenepal123';
const ADMIN_ID = '4217659478305444';
const REVIEW_LINK = 'https://www.facebook.com/onlineservicenepalNo.1/reviews';
const SESSION_TIMEOUT = 45 * 60 * 1000; // 45 minutes

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
app.post('/health', (req, res) => {
  res.start(200).send('Bot is Running!');
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
app.post('/health', (req, res) => {
  res.start(200).send('Bot is Running!'); 
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
function handleMessage(senderId, message) {
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
      `📸 We received your image!\n\n` +
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
        lastOrder: 'Google INR Trial Pack - INR 10 @ NRs.25',
        orderSummary: '🎮 Google INR Redeem Code\n▪️ Trial Pack - INR 10 @ NRs.25'
      };
      return sendPaymentMenu(senderId,
        `🎮 Google INR - Trial Pack\n✅ Selected: INR 10 @ NRs.25\n\nSelect payment method:`
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
        lastOrder: `Google INR Regular - ${selected}`,
        orderSummary: `🎮 Google INR Redeem Code\n▪️ ${selected}`
      };
      return sendPaymentMenu(senderId,
        `🎮 Google INR - Regular Pack\n✅ Selected: ${selected}\n\n` +
        `⚠️ Requires India based Google Play account.\n\nSelect payment method:`
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
    `3️⃣  Google INR Redeem Code 🎮\n` +
    `4️⃣  Apple iTunes Redeem Code 🍎\n` +
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
// 🎮 Google INR Menu (Pack Selection)
// ==============================
function sendGoogleMenuText(senderId) {
  userState[senderId] = { waitingForGooglePack: true };
  sendText(senderId,
    `🎮 Google INR Redeem Code\n\n` +
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
    `🎮 Google INR Redeem Code\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `⚠️ Before Buying This!!!\n\n` +
    `Try our exclusive "Trial Pack" to check\n` +
    `your Google Indian Play Account is\n` +
    `working in Nepal.\n\n` +
    `▪️ INR 10 for NRs. 25/-\n\n` +
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
    `🎮 Google INR Redeem Code\n` +
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
    `⚠️ Requires India based Google Play account.\n` +
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
    `🍎 Apple iTunes Redeem Code\n\n` +
    `Reply with number to select:\n\n` +
    `1️⃣  100 INR @ NRs.185\n` +
    `2️⃣  150 INR @ NRs.275\n` +
    `3️⃣  200 INR @ NRs.365\n` +
    `4️⃣  250 INR @ NRs.455\n` +
    `5️⃣  300 INR @ NRs.545\n` +
    `6️⃣  500 INR @ NRs.885\n` +
    `7️⃣  1000 INR @ NRs.1720\n\n` +
    `⚠️ Requires India based Apple ID account.\n\n` +
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