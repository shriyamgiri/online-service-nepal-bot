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

// ==============================
// 💳 QR CODE URLs (Replace with your Google Drive URLs)
// ==============================
const QR_CODES = {
  esewa:  'https://drive.google.com/uc?export=view&id=1NoIUX3PqTLzIc2kx9lH7NxwxljqxR9cb',
  khalti: 'https://drive.google.com/uc?export=view&id=1N67wvplKTe7ttjHXsZRLMVIOII94gd3H',
  bank:   'BANK_QR_COMING_SOON'
};

// ==============================
// 💾 User State
// ==============================
const userState = {};

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
// 💬 Handle Text Messages
// ==============================
function handleMessage(senderId, message) {
  const text = (message.text || '').toLowerCase().trim();

  // ─── Waiting for mobile number ───
  if (userState[senderId] && userState[senderId].waitingForPhone) {
    const operator = userState[senderId].operator;
    userState[senderId] = { waitingForPlan: true, operator, phone: message.text };
    return sendText(senderId,
      `📱 Mobile Number: ${message.text}\n\n` +
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
    userState[senderId] = {
      waitingForPayment: true,
      orderSummary: `📱 Mobile Recharge\n📶 Operator: ${operator}\n📞 Number: ${phone}\n📋 Plan: ${message.text}`
    };
    return sendPaymentMenu(senderId,
      `✅ Order Summary:\n\n` +
      `📶 Operator: ${operator}\n` +
      `📞 Mobile: ${phone}\n` +
      `📋 Plan: ${message.text}\n\n` +
      `Now select payment method:`
    );
  }

  // ─── Waiting for payment method ───
  if (userState[senderId] && userState[senderId].waitingForPayment) {
    const { orderSummary } = userState[senderId];
    if (text === '1') {
      delete userState[senderId];
      return sendPaymentDetails(senderId, 'eSewa', QR_CODES.esewa, orderSummary);
    }
    if (text === '2') {
      delete userState[senderId];
      return sendPaymentDetails(senderId, 'Khalti', QR_CODES.khalti, orderSummary);
    }
    if (text === '3') {
      delete userState[senderId];
      return sendPaymentDetails(senderId, 'Bank Transfer', QR_CODES.bank, orderSummary);
    }
    if (text === '0') {
      delete userState[senderId];
      return sendMainMenu(senderId);
    }
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
        `🎮 Google INR Redeem Code\n✅ Selected: ${selected}\n\n⚠️ Requires India based Google Play account.\n\nSelect payment method:`
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
        `🍎 Apple iTunes Redeem Code\n✅ Selected: ${selected}\n\n⚠️ Requires India based Apple ID account.\n\nSelect payment method:`
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

  // ─── Main triggers ───
  if (['hi', 'hello', 'namaste', 'hey', 'start', 'menu'].includes(text)) {
    return sendMainMenu(senderId);
  }

  if (text === '1') return sendGoogleMenuText(senderId);
  if (text === '2') return sendAppleMenuText(senderId);
  if (text === '3') return sendRechargeMenuText(senderId);
  if (text === '4') return sendTranslationMenuText(senderId);

  sendMainMenu(senderId);
}

// ==============================
// 🔘 Handle Postbacks
// ==============================
function handlePostback(senderId) {
  sendMainMenu(senderId);
}

// ==============================
// 🏠 Main Menu
// ==============================
function sendMainMenu(senderId) {
  userState[senderId] = {};
  sendText(senderId,
    '🙏 Hello! Namaste!\n' +
    'Welcome to Online Service Nepal! 🇳🇵\n\n' +
    'Please reply with a number:\n\n' +
    '1️⃣  Google INR Redeem Code 🎮\n' +
    '2️⃣  Apple iTunes Redeem Code 🍎\n' +
    '3️⃣  Indian Mobile Recharge 📱\n' +
    '4️⃣  Document Translation 📄\n\n' +
    'Type the number to continue...'
  );
}

// ==============================
// 🎮 Google INR Menu
// ==============================
function sendGoogleMenuText(senderId) {
  userState[senderId] = { waitingForGoogle: true };
  sendText(senderId,
    '🎮 Google INR Redeem Code\n\n' +
    'Reply with number to select:\n\n' +
    '1️⃣  Trial Pack - INR 10 @ NRs.25\n' +
    '2️⃣  50 INR @ NRs.95\n' +
    '3️⃣  100 INR @ NRs.185\n' +
    '4️⃣  150 INR @ NRs.275\n' +
    '5️⃣  200 INR @ NRs.365\n' +
    '6️⃣  250 INR @ NRs.455\n' +
    '7️⃣  300 INR @ NRs.545\n' +
    '8️⃣  500 INR @ NRs.885\n' +
    '9️⃣  1000 INR @ NRs.1720\n\n' +
    '0️⃣  Back to Main Menu'
  );
}

// ==============================
// 🍎 Apple iTunes Menu
// ==============================
function sendAppleMenuText(senderId) {
  userState[senderId] = { waitingForApple: true };
  sendText(senderId,
    '🍎 Apple iTunes Redeem Code\n\n' +
    'Reply with number to select:\n\n' +
    '1️⃣  100 INR @ NRs.185\n' +
    '2️⃣  150 INR @ NRs.275\n' +
    '3️⃣  200 INR @ NRs.365\n' +
    '4️⃣  250 INR @ NRs.455\n' +
    '5️⃣  300 INR @ NRs.545\n' +
    '6️⃣  500 INR @ NRs.885\n' +
    '7️⃣  1000 INR @ NRs.1720\n\n' +
    '0️⃣  Back to Main Menu'
  );
}

// ==============================
// 📱 Mobile Recharge Menu
// ==============================
function sendRechargeMenuText(senderId) {
  userState[senderId] = { waitingForOperator: true };
  sendText(senderId,
    '📱 Indian Mobile Recharge\n\n' +
    'Reply with operator number:\n\n' +
    '1️⃣  Airtel\n' +
    '2️⃣  Jio\n' +
    '3️⃣  Vi\n' +
    '4️⃣  BSNL\n\n' +
    '0️⃣  Back to Main Menu'
  );
}

// ==============================
// 📄 Document Translation Menu
// ==============================
function sendTranslationMenuText(senderId) {
  userState[senderId] = { waitingForDoc: true };
  sendText(senderId,
    '📄 Official Document Translation\n\n' +
    'Reply with number to select:\n\n' +
    '1️⃣  Citizenship\n' +
    '2️⃣  Educational Documents\n' +
    '3️⃣  Land Owner Certificate\n' +
    '4️⃣  Tax Clearance\n' +
    '5️⃣  Property Tax Receipt\n' +
    '6️⃣  Verification From Ward Office\n' +
    '7️⃣  Others\n\n' +
    '0️⃣  Back to Main Menu'
  );
}

// ==============================
// 💳 Payment Menu
// ==============================
function sendPaymentMenu(senderId, intro) {
  sendText(senderId,
    `${intro}\n\n` +
    '1️⃣  eSewa\n' +
    '2️⃣  Khalti\n' +
    '3️⃣  Bank Transfer\n\n' +
    '0️⃣  Back to Main Menu'
  );
}

// ==============================
// 💳 Send Payment Details + QR
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
  // Send QR code image
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