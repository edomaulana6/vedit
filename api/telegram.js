export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).send('Method Not Allowed');

  const { message } = request.body;
  if (!message) return response.status(200).send('OK');

  const chatId = message.chat.id;
  const groqApiKey = process.env.GROQ_API_KEY;
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  
  // Deteksi jenis pesan
  const userText = message.text || message.caption || "";
  const isPhoto = message.photo || message.document?.mime_type?.startsWith('image/');
  const isAudio = message.audio || message.voice;
  const isVideo = message.video || message.document?.mime_type?.startsWith('video/');

  // Beri tahu AI apa yang dikirim user
  let mediaInfo = "";
  if (isPhoto) mediaInfo = "[User mengirim sebuah GAMBAR/FOTO]";
  if (isAudio) mediaInfo = "[User mengirim sebuah FILE AUDIO/MUSIK]";
  if (isVideo) mediaInfo = "[User mengirim sebuah VIDEO]";

  let botReply = "";

  try {
    if (userText || mediaInfo) {
      // Gabungkan teks user dengan info media
      const promptToAI = `${userText} ${mediaInfo}`.trim();

      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b', 
          messages: [
            { 
              role: 'system', 
              content: 'Kamu adalah asisten AI VEdit. Kamu SANGAT JUJUR. Kamu BELUM BISA mengedit video secara otomatis. Jika user mengirim gambar/audio/video, pahami bahwa kamu menerimanya, tapi jelaskan dengan sopan bahwa mesin render video belum terpasang. Jangan pernah berjanji akan merender atau mengirim video dalam waktu tertentu (jangan berhalusinasi). Jawablah dengan santai dan cerdas.' 
            },
            { role: 'user', content: promptToAI }
          ],
          temperature: 0.5, // Dibuat lebih rendah agar tidak banyak ngarang
        })
      });

      const groqData = await groqResponse.json();
      botReply = groqData.choices[0]?.message?.content || 'Aku mendengar instruksimu.';

    } else {
      botReply = "Aku menerima pesanmu, tapi sepertinya bukan teks atau media yang bisa aku baca.";
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
