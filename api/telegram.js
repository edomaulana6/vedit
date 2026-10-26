export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).send('Method Not Allowed');

  const { message } = request.body;
  if (!message) return response.status(200).send('OK');

  const chatId = message.chat.id;
  const groqApiKey = process.env.GROQ_API_KEY;
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  
  // Ambil teks (bisa dari chat biasa, atau caption di gambar/video)
  const userText = message.text || message.caption || "";
  
  // Deteksi jika user mengirim audio
  const isAudio = message.audio || message.voice;

  let botReply = "";

  try {
    if (isAudio) {
      // Kalau yang dikirim audio, balas dengan pesan konfirmasi
      botReply = "Wih, musiknya udah masuk nih! 🎵 Sekarang kirim videonya (boleh pakai caption instruksi editnya) biar aku gabungkan.";
      
    } else if (userText) {
      // Kalau ada teks atau caption, kirim ke Groq AI
      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b', 
          messages: [
            { role: 'system', content: 'Kamu adalah asisten editor video AI. User mungkin mengirim gambar/video dengan instruksi. Jawab dengan ramah dan konfirmasi instruksinya.' },
            { role: 'user', content: userText }
          ],
          temperature: 0.7,
        })
      });

      const groqData = await groqResponse.json();
      botReply = groqData.choices[0]?.message?.content || 'Aku mengerti instruksinya, tapi otakku agak bingung.';

    } else {
      // Kalau kirim media tanpa teks sama sekali
      botReply = "Gambar/videonya udah aku terima. Tapi tolong kasih caption instruksi ya, mau diapain ini?";
    }

    // Kirim balik ke Telegram
    await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: botReply,
        reply_to_message_id: message.message_id
      })
    });

    return response.status(200).send('OK');

  } catch (error) {
    console.error('Error:', error);
    return response.status(500).send('Error');
  }
}
