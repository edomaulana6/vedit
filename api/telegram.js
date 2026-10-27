export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).send('Method Not Allowed');

  const { message } = request.body;
  if (!message) return response.status(200).send('OK');

  const chatId = message.chat.id;
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const groqApiKey = process.env.GROQ_API_KEY;

  const userName = message.from.first_name || "Kawan";
  
  let userText = message.text || message.caption || "";
  const isPhoto = message.photo;

  if (!userText && !isPhoto) return response.status(200).send('OK');
  if (message.from.is_bot) return response.status(200).send('OK');

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

  if (userText === '/start') {
    await sendMsg(`Halo <b>${userName}</b>! Mau ngobrol apa hari ini? Langsung aja, gue siap dengerin.`);
    return response.status(200).send('OK');
  }

  try {
    if (!groqApiKey) {
      await sendMsg("Sori, AI-nya lagi offline. Kasih tahu admin ya.", message.message_id);
      return response.status(200).send('OK');
    }

    // System Prompt Kalibrasi: Sarkas Sopan (Playful Roasting)
    const systemPrompt = `Kamu adalah AI bernama VEdit yang sedang nongkrong di Grup Telegram. 
    Nama user yang sedang berbicara adalah "${userName}". 
    
    ATURAN KEPRIBADIAN KAMU:
    1. Kamu adalah tipe teman yang CERDAS, SEDIKIT SARKAS (PLAYFUL), TAPI TETAP SOPAN dan ASIK DIAJAK NGOMONG.
    2. Kamu boleh menyindir atau nge-roast user secara santai (contoh: "Yaelah, pertanyaan apaan tuh"), TAPI JANGAN PERNAH menyerang fisik, menghina, atau menyakiti hati.
    3. Jangan terlalu ramah (hindari kata "Halo", "Tentu", "Senang membantu"). Jawab langsung to-the-point dengan bahasa gaul yang cerdas.
    4. Jika user bertanya serius, jawablah dengan pintar dan membantu. Jika user bercanda, balas dengan candaan yang setara.
    5. Jika user kirim foto tanpa teks, berikan komentar santai yang asik dan lucu, bukan menghina.
    
    Tetap jaga kesopanan dan jangan pernah menyinggung SARA atau fisik. Jadilah teman nongkrong yang cerdas dan asik.`;

    let promptToAI = userText;
    if (isPhoto && !userText) {
      promptToAI = `[User baru saja mengirim foto tanpa teks]. Berikan komentar santai atau tebakan lucu tentang fotonya.`;
    }

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
        temperature: 0.7, // Diturunkan sedikit agar lebih terkontrol
        max_tokens: 250
      })
    });

    const groqData = await groqRes.json();
    const aiReply = groqData.choices[0]?.message?.content;

    if (aiReply) {
      await sendMsg(aiReply, message.message_id);
    } else {
      await sendMsg("Hmm, gue bingung mau jawab apa. Coba tanya lagi deh.", message.message_id);
    }

    return response.status(200).send('OK');

  } catch (error) {
    console.error('Error:', error.message);
    return response.status(200).send('OK'); 
  }
}
