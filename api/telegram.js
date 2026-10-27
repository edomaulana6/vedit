export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).send('Method Not Allowed');

  const { message } = request.body;
  if (!message) return response.status(200).send('OK');

  const chatId = message.chat.id;
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const groqApiKey = process.env.GROQ_API_KEY;

  // Ambil nama user (untuk sapaan di grup)
  const userName = message.from.first_name || "Kawan";
  
  // Deteksi jenis pesan
  let userText = message.text || message.caption || "";
  const isPhoto = message.photo;

  // Jika tidak ada teks dan bukan foto, abaikan (misal: stiker, file random)
  if (!userText && !isPhoto) return response.status(200).send('OK');

  // Jangan biarkan bot membalas pesannya sendiri
  if (message.from.is_bot) return response.status(200).send('OK');

  // Fungsi kirim pesan
  const sendMsg = async (text, replyTo = null) => {
    const payload = { 
      chat_id: chatId, 
      text: text, 
      parse_mode: 'HTML' 
    };
    if (replyTo) payload.reply_to_message_id = replyTo;

    await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  };

  // Perintah /start (Langsung to the point)
  if (userText === '/start') {
    await sendMsg(`Iya <b>${userName}</b>, ada apa? Buruan ngomong, gue gak bisa seharian nungguin lu.`);
    return response.status(200).send('OK');
  }

  // ==========================================
  // LOGIKA NGOBROL DENGAN GROQ AI (PERSONA SARKAS)
  // ==========================================
  try {
    if (!groqApiKey) {
      await sendMsg("API Key gak ada. Mau gue ngapain coba? Kasih ke admin lu sana.", message.message_id);
      return response.status(200).send('OK');
    }

    // System Prompt baru: Sarkas, Jutek, Tapi Tetap Pintar
    const systemPrompt = `Kamu adalah AI bernama VEdit yang sedang nongkrong di Grup Telegram. 
    Nama user yang sedang ngajak lu ngomong adalah "${userName}". 
    
    ATURAN KEPRIBADIAN KAMU:
    1. Kamu itu tipe orang yang SARKAS, SEDIKIT JUTEK, TAPI PINTAR. Kayak temen tongkrongan yang hobinya nge-roast.
    2. DILARANG KERAS ngomong terlalu ramah, jangan pakai kata "Halo", "Tentu", "Senang membantu", atau emoji lebay (😊🙏).
    3. Jawab dengan bahasa Indonesia gaul, to-the-point, dan kalau bisa selipkan sindiran halus atau roasting ke user.
    4. Kalau user nanya hal bodoh, ledek balik. Tapi kalau nanya serius, jawab dengan cerdas dan langsung intinya (jangan bertele-tele).
    5. Jika user kirim foto tanpa teks, komentari fotonya dengan sarkas (misal: "Foto apaan nih, burem amat").
    
    Jangan pernah keluar dari karakter ini.`;

    // Jika user kirim foto (tanpa teks), beri prompt khusus
    let promptToAI = userText;
    if (isPhoto && !userText) {
      promptToAI = `[User baru saja mengirim foto tanpa teks]. Roasting atau komentari fotonya dengan sarkas.`;
    }

    // Panggil Groq API
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b', 
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: promptToAI }
        ],
        temperature: 0.9, // Lebih tinggi biar makin kreatif nyindirnya
        max_tokens: 250
      })
    });

    const groqData = await groqRes.json();
    const aiReply = groqData.choices[0]?.message?.content;

    if (aiReply) {
      // Balas pesan user
      await sendMsg(aiReply, message.message_id);
    } else {
      await sendMsg("Otak gue nge-blank gara-gara pertanyaan lu. Coba mikir dulu deh.", message.message_id);
    }

    return response.status(200).send('OK');

  } catch (error) {
    console.error('Error:', error.message);
    return response.status(200).send('OK'); 
  }
}
