export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).send('Method Not Allowed');

  const { message } = request.body;
  if (!message) return response.status(200).send('OK');

  const chatId = message.chat.id;
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  // --- 1. DETEKSI JENIS FILE / PESAN ---
  let fileId = null;
  let fileType = 'text';
  let userText = message.text || message.caption || ""; // Ambil teks atau caption

  if (message.photo) {
    // Foto punya beberapa resolusi, ambil yang paling besar (index terakhir)
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

  // Jika tidak ada teks dan tidak ada file, abaikan
  if (!userText && !fileId) return response.status(200).send('OK');

  const sendTelegramMessage = async (text) => {
    const res = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML' })
    });
    const data = await res.json();
    return data.result.message_id;
  };

  const editTelegramMessage = async (messageId, text) => {
    await fetch(`https://api.telegram.org/bot${telegramToken}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: text, parse_mode: 'HTML' })
    });
  };

  if (userText === '/start') {
    await sendTelegramMessage("Sistem siap. Kirim teks instruksi, atau kirim file (foto/video/audio) beserta caption instruksinya.");
    return response.status(200).send('OK');
  }

  try {
    // 2. Tampilkan animasi loading
    const messageId = await sendTelegramMessage("⏳ Memproses...\n\n[□□□□□□□□□□] 0%");
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const bars = ["[■■■□□□□□□□] 30%", "[■■■■■■□□□□] 60%", "[■■■■■■■■■■] 100%"];
    for (let i = 0; i < bars.length; i++) {
      await sleep(400); 
      await editTelegramMessage(messageId, `⏳ Memproses...\n\n${bars[i]}`);
    }

    // 3. Simpan ke Database Supabase
    // Pastikan tabel 'perintah_edit' punya kolom: perintah (text), file_id (text), file_type (text)
    const dbResponse = await fetch(`${supabaseUrl}/rest/v1/perintah_edit`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ 
        perintah: userText, 
        file_id: fileId,
        file_type: fileType
      })
    });

    if (!dbResponse.ok) {
      const errorData = await dbResponse.text();
      throw new Error(`DB Error: ${errorData}`);
    }

    // 4. Pesan Sukses
    let successMsg = `✅ <b>Berhasil!</b>\n\n[■■■■■■■■■■] 100%\n\n`;
    successMsg += `<b>Tipe:</b> ${fileType.toUpperCase()}\n`;
    if (userText) successMsg += `<b>Instruksi:</b> "${userText}"\n`;
    if (fileId) successMsg += `<b>File ID:</b> <code>${fileId}</code>\n`;
    successMsg += `\nSilakan cek website VEdit!`;

    await editTelegramMessage(messageId, successMsg);
    return response.status(200).send('OK');

  } catch (error) {
    console.error('Error:', error.message);
    await sendTelegramMessage(`❌ <b>Gagal:</b>\n<code>${error.message}</code>`);
    return response.status(200).send('OK'); 
  }
}
