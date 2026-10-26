export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).send('Method Not Allowed');

  const { message } = request.body;
  if (!message) return response.status(200).send('OK');

  const chatId = message.chat.id;
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const groqApiKey = process.env.GROQ_API_KEY; // Pastikan ini masih ada di Vercel

  // --- 1. DETEKSI JENIS FILE / PESAN ---
  let fileId = null;
  let fileType = 'text';
  let userText = message.text || message.caption || "";

  if (message.photo) {
    fileId = message.photo[message.photo.length - 1].file_id;
    fileType = 'photo';
  } else if (message.video) {
    fileId = message.video.file_id;
    fileType = 'video';
  } else if (message.audio) {
    fileId = message.audio.file_id;
    fileType = 'audio';
  } else if (message.voice) {
    fileId = message.voice.file_id;
    fileType = 'voice';
  } else if (message.document) {
    fileId = message.document.file_id;
    fileType = 'document';
  }

  if (!userText && !fileId) return response.status(200).send('OK');

  const sendMsg = async (text) => {
    const res = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML' })
    });
    return (await res.json()).result.message_id;
  };

  if (userText === '/start') {
    await sendMsg("Halo! Aku asisten VEdit. Kamu bisa ngobrol santai denganku, atau kirim file (video/audio/foto) satu per satu untuk diedit. Kalau semua file sudah dikirim, ketik <b>'Ekspor'</b>.");
    return response.status(200).send('OK');
  }

  try {
    // ==========================================
    // JIKA USER MENGIRIM FILE (VIDEO/AUDIO/FOTO)
    // ==========================================
    if (fileId) {
      // Simpan ke database
      await fetch(`${supabaseUrl}/rest/v1/perintah_edit`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ perintah: userText || "File", file_id: fileId, file_type: fileType })
      });

      await sendMsg(`✅ <b>${fileType.toUpperCase()} diterima!</b>\n\nSilakan kirim file lain (jika ada), atau ketik <b>'Ekspor'</b> jika semua file sudah lengkap.`);
      return response.status(200).send('OK');
    }

    // ==========================================
    // JIKA USER MENGIRIM TEKS BIASA (NGOBROL)
    // ==========================================
    if (userText) {
      // Jika user mengetik "Ekspor", beri tahu untuk buka website
      if (userText.toLowerCase().includes('ekspor')) {
        await sendMsg("🎬 Siap! Silakan buka <a href='https://vedit-nine.vercel.app'>website VEdit</a> untuk merender videonya. Setelah dirender di website, hasilnya akan otomatis terkirim ke sini!");
        return response.status(200).send('OK');
      }

      // Jika bukan "Ekspor", anggap user sedang ngobrol. Panggil Groq AI.
      if (groqApiKey) {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'openai/gpt-oss-120b',
            messages: [
              { role: 'system', content: 'Kamu adalah asisten editor video VEdit. Jawab dengan santai, ramah, dan jangan kaku. Jika user bertanya soal editing, beri saran.' },
              { role: 'user', content: userText }
            ],
            temperature: 0.7
          })
        });
        
        const groqData = await groqRes.json();
        const aiReply = groqData.choices[0]?.message?.content || "Maaf, aku tidak mengerti.";
        await sendMsg(aiReply);
      } else {
        await sendMsg("Aku belum dihubungkan ke AI. Tapi kalau kamu mau ekspor video, ketik 'Ekspor' ya!");
      }
      
      return response.status(200).send('OK');
    }

  } catch (error) {
    console.error('Error:', error.message);
    await sendMsg(`❌ <b>Gagal:</b>\n<code>${error.message}</code>`);
    return response.status(200).send('OK'); 
  }
}
