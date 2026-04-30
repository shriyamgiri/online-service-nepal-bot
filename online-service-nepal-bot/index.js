const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// ==============================
// 🔧 YOUR SETTINGS — FILL THESE
// ==============================
const PAGE_ACCESS_TOKEN = 'EAAU7o8WbgJsBRf69vaXXiCmumZBHeNiX1Mj39eaZAveWlWDLdu7V2AEhZCYmD3Eci1ISNI5cTk1vzN5To7X5fJmUy1EdLJ527BOmn8PtsAuXfbMS6JnOW4sraIVq1JcxtgEpV4r9I8cAMZBkqYUOqNUMyoM80NqxT2iBK5rbZCStnsCkaYxDek6mvGhq0pVmkVlmCnhsoygZDZD'; // From Facebook Developer App
const VERIFY_TOKEN = 'onlineservicenepal123';        // You can change this

// ==============================
// 💾 User State (tracks each user's step)
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

  // If waiting for mobile number input
  if (userState[senderId] && userState[senderId].waitingForPhone) {
    const operator = userState[senderId].operator;
    delete userState[senderId];
    return sendText(senderId,
      `✅ Thank you!\n\n` +
      `📶 Operator: ${operator}\n` +
      `📱 Mobile: ${message.text}\n\n` +
      `Our team will contact you shortly! 🙏\n\n` +
      `— Online Service Nepal`
    );
  }

  // Greetings trigger main menu
  if (['hi','hello','namaste','hey','start','menu'].includes(text)) {
    sendMainMenu(senderId);
  } else {
    sendMainMenu(senderId);
  }
}

// ==============================
// 🔘 Handle Button Clicks
// ==============================
function handlePostback(senderId, postback) {
  const payload = postback.payload;

  if (payload === 'MAIN_MENU')           return sendMainMenu(senderId);
  if (payload === 'PRODUCT_GOOGLE')      return sendGoogleMenu(senderId);
  if (payload === 'PRODUCT_APPLE')       return sendAppleMenu(senderId);
  if (payload === 'PRODUCT_RECHARGE')    return sendRechargeMenu(senderId);
  if (payload === 'PRODUCT_TRANSLATION') return sendTranslationMenu(senderId);
  if (payload === 'GOOGLE_TRIAL')        return sendGoogleTrial(senderId);
  if (payload === 'GOOGLE_REGULAR')      return sendGoogleRegular(senderId);
  if (payload === 'PROCEED_PAY')         return sendPaymentDetails(senderId);

  if (payload.startsWith('GOOGLE_PRICE_')) return sendPriceConfirm(senderId, payload, 'Google INR Redeem Code 🎮');
  if (payload.startsWith('APPLE_PRICE_'))  return sendPriceConfirm(senderId, payload, 'Apple iTunes Redeem Code 🍎');

  if (payload.startsWith('OPERATOR_')) {
    const operator = payload.replace('OPERATOR_', '');
    userState[senderId] = { waitingForPhone: true, operator };
    return sendText(senderId, `📱 Please type your ${operator} mobile number:`);
  }

  if (payload.startsWith('DOC_')) {
    const docMap = {
      DOC_CITIZENSHIP:  'Citizenship',
      DOC_EDUCATIONAL:  'Educational Documents',
      DOC_LAND:         'Land Owner Certificate',
      DOC_TAX:          'Tax Clearance',
      DOC_PROPERTY:     'Property Tax Receipt',
      DOC_WARD:         'Verification From Ward Office',
      DOC_OTHERS:       'Others'
    };
    const doc = docMap[payload] || 'Document';
    return sendText(senderId,
      `✅ Thank you!\n\n` +
      `📄 Document Type: ${doc}\n\n` +
      `Our team will contact you shortly! 🙏\n\n` +
      `— Online Service Nepal`
    );
  }
}

// ==============================
// 🏠 Main Menu
// ==============================
function sendMainMenu(senderId) {
  sendButtonTemplate(senderId,
    '🙏 Hello! Namaste!\nWelcome to Online Service Nepal!\n\nHow may I help you today?\nPlease choose a product:',
    [
      { type: 'postback', title: '🎮 Google INR Redeem Code', payload: 'PRODUCT_GOOGLE' },
      { type: 'postback', title: '🍎 Apple iTunes Redeem Code', payload: 'PRODUCT_APPLE' },
      { type: 'postback', title: '📱 Indian Mobile Recharge',   payload: 'PRODUCT_RECHARGE' }
    ]
  ).then(() => {
    sendButtonTemplate(senderId, 'More options:', [
      { type: 'postback', title: '📄 Document Translation', payload: 'PRODUCT_TRANSLATION' }
    ]);
  });
}

// ==============================
// 🎮 Google INR Redeem Code
// ==============================
function sendGoogleMenu(senderId) {
  sendButtonTemplate(senderId,
    '🎮 Google INR Redeem Code\n\nPlease select a pack:',
    [
      { type: 'postback', title: '🔹 Trial Pack (INR 10 = NRs.25)', payload: 'GOOGLE_TRIAL' },
      { type: 'postback', title: '🔸 Regular Pack',                  payload: 'GOOGLE_REGULAR' },
      { type: 'postback', title: '🔙 Go Back',                       payload: 'MAIN_MENU' }
    ]
  );
}

function sendGoogleTrial(senderId) {
  sendButtonTemplate(senderId,
    '🎮 Google INR Redeem Code\n🔹 Trial Pack\n\n▪️ INR 10 @ NRs. 25/-\n\n⚠️ Note: Requires India based Google Play account.',
    [
      { type: 'postback', title: '✅ Proceed to Pay', payload: 'PROCEED_PAY' },
      { type: 'postback', title: '🔙 Go Back',        payload: 'PRODUCT_GOOGLE' }
    ]
  );
}

function sendGoogleRegular(senderId) {
  sendQuickReplies(senderId,
    '🎮 Google INR Redeem Code\n🔸 Regular Pack\n\nPlease select amount:',
    [
      { title: '50 INR = NRs.95',     payload: 'GOOGLE_PRICE_50_95' },
      { title: '100 INR = NRs.185',   payload: 'GOOGLE_PRICE_100_185' },
      { title: '150 INR = NRs.275',   payload: 'GOOGLE_PRICE_150_275' },
      { title: '200 INR = NRs.365',   payload: 'GOOGLE_PRICE_200_365' },
      { title: '250 INR = NRs.455',   payload: 'GOOGLE_PRICE_250_455' },
      { title: '300 INR = NRs.545',   payload: 'GOOGLE_PRICE_300_545' },
      { title: '500 INR = NRs.885',   payload: 'GOOGLE_PRICE_500_885' },
      { title: '1000 INR = NRs.1720', payload: 'GOOGLE_PRICE_1000_1720' },
      { title: '🔙 Go Back',          payload: 'PRODUCT_GOOGLE' }
    ]
  );
}

// ==============================
// 🍎 Apple iTunes Redeem Code
// ==============================
function sendAppleMenu(senderId) {
  sendQuickReplies(senderId,
    '🍎 Apple iTunes Redeem Code\n\nPlease select amount:',
    [
      { title: '100 INR = NRs.185',   payload: 'APPLE_PRICE_100_185' },
      { title: '150 INR = NRs.275',   payload: 'APPLE_PRICE_150_275' },
      { title: '200 INR = NRs.365',   payload: 'APPLE_PRICE_200_365' },
      { title: '250 INR = NRs.455',   payload: 'APPLE_PRICE_250_455' },
      { title: '300 INR = NRs.545',   payload: 'APPLE_PRICE_300_545' },
      { title: '500 INR = NRs.885',   payload: 'APPLE_PRICE_500_885' },
      { title: '1000 INR = NRs.1720', payload: 'APPLE_PRICE_1000_1720' },
      { title: '🔙 Go Back',          payload: 'MAIN_MENU' }
    ]
  );
}

// ==============================
// 💰 Price Confirm + Pay
// ==============================
function sendPriceConfirm(senderId, payload, productName) {
  const parts = payload.split('_');
  const inr   = parts[parts.length - 2];
  const nrs   = parts[parts.length - 1];
  const back  = payload.startsWith('GOOGLE') ? 'GOOGLE_REGULAR' : 'PRODUCT_APPLE';

  sendButtonTemplate(senderId,
    `${productName}\n\n▪️ Amount: INR ${inr} @ NRs. ${nrs}/-\n\n⚠️ Note: Requires India based account.`,
    [
      { type: 'postback', title: '✅ Proceed to Pay', payload: 'PROCEED_PAY' },
      { type: 'postback', title: '🔙 Go Back',        payload: back }
    ]
  );
}

function sendPaymentDetails(senderId) {
  sendText(senderId,
    `💳 Payment Details\n\n` +
    `We Accept:\n` +
    `✅ eSewa\n` +
    `✅ Khalti\n` +
    `✅ Bank Deposit\n\n` +
    `📌 Please send payment & share the screenshot.\n` +
    `Our team will verify and send your code shortly! 🙏\n\n` +
    `Thank you for choosing Online Service Nepal! 🇳🇵`
  );
}

// ==============================
// 📱 Indian Mobile Recharge
// ==============================
function sendRechargeMenu(senderId) {
  sendButtonTemplate(senderId,
    '📱 Indian Mobile Recharge\n\nPlease select your operator:',
    [
      { type: 'postback', title: '📶 Airtel', payload: 'OPERATOR_Airtel' },
      { type: 'postback', title: '📶 Jio',    payload: 'OPERATOR_Jio' },
      { type: 'postback', title: '📶 Vi',     payload: 'OPERATOR_Vi' }
    ]
  ).then(() => {
    sendButtonTemplate(senderId, 'More operators:', [
      { type: 'postback', title: '📶 BSNL',    payload: 'OPERATOR_BSNL' },
      { type: 'postback', title: '🔙 Go Back', payload: 'MAIN_MENU' }
    ]);
  });
}

// ==============================
// 📄 Document Translation
// ==============================
function sendTranslationMenu(senderId) {
  sendQuickReplies(senderId,
    '📄 Official Document Translation\n\nPlease select document type:',
    [
      { title: '🪪 Citizenship',         payload: 'DOC_CITIZENSHIP' },
      { title: '🎓 Educational Docs',    payload: 'DOC_EDUCATIONAL' },
      { title: '🏠 Land Owner Cert.',    payload: 'DOC_LAND' },
      { title: '💰 Tax Clearance',       payload: 'DOC_TAX' },
      { title: '🧾 Property Tax',        payload: 'DOC_PROPERTY' },
      { title: '🏢 Ward Office Verify',  payload: 'DOC_WARD' },
      { title: '📋 Others',              payload: 'DOC_OTHERS' },
      { title: '🔙 Go Back',             payload: 'MAIN_MENU' }
    ]
  );
}

// ==============================
// 🛠️ Helper Functions
// ==============================
function sendText(senderId, text) {
  return sendMessage(senderId, { text });
}

function sendButtonTemplate(senderId, text, buttons) {
  return sendMessage(senderId, {
    attachment: {
      type: 'template',
      payload: { template_type: 'button', text, buttons }
    }
  });
}

function sendQuickReplies(senderId, text, options) {
  return sendMessage(senderId, {
    text,
    quick_replies: options.map(opt => ({
      content_type: 'text',
      title:   opt.title,
      payload: opt.payload
    }))
  });
}

function sendMessage(senderId, message) {
  return axios.post(
    `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
    { recipient: { id: senderId }, message }
  ).catch(err => console.error('❌ Send error:', JSON.stringify(err.response?.data)));
}

// ==============================
// 🚀 Start Server
// ==============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Online Service Nepal Bot running on port ${PORT}`);
});
