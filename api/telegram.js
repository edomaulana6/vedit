// api/telegram.js
export default async function handler(request, response) {
  // 1. Pastikan ini request POST dari Telegram
  if (request.method !== 'POST') {
    return response.status(405).send('Method Not Allowed');
  }

  const { message } = request.body;

  // Jika tidak ada pesan teks, abaikan
  if (!message || !message.text) {
    return response.status(200).send('OK');
  }

  const chatId = message.chat.id;
  const userText = message.text;

  // 2. Ambil API Key dari Environment Variable Vercel
  const groqApiKey = process.env.GROQ_API_KEY;
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!groqApiKey || !telegramToken) {
    console.error('API Key atau Token Bot belum diset.');
    return response.status(500).send('Configuration Error');
  }

  try {
    // 3. Kirim pesan user ke Groq API
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        // Kamu bisa ganti model di sini
        model: 'openai/gpt-oss-120b', 
        messages: [
          { role: 'system', content: 'Kamu adalah asisten AI yang membantu untuk aplikasi edit video VEdit. Jawab dengan singkat dan ramah.' },
          { role: 'user', content: userText }
        ],
        temperature: 0.7,
        max_tokens: 1024
      })
    });

    if (!groqResponse.ok) {
      throw new Error(`Groq Error: ${groqResponse.status}`);
    }

    const groqData = await groqResponse.json();
    const aiReply = groqData.choices[0]?.message?.content || 'Maaf, aku tidak bisa menjawab itu.';

    // 4. Kirim balik jawaban AI ke Telegram
    await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: aiReply
      })
    });

    return response.status(200).send('OK');

  } catch (error) {
    console.error('Error:', error);
    // Kirim pesan error ke user jika AI gagal
    await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: 'Maaf, otak AI-ku sedang sibuk. Coba lagi nanti ya!'
      })
    });
    return response.status(500).send('Error');
  }
}
