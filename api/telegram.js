export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).send('Method Not Allowed');

  const { message } = request.body;
  if (!message || !message.text) return response.status(200).send('OK');

  const chatId = message.chat.id;
  const userText = message.text;
  
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

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
    await sendTelegramMessage("Sistem siap. Silakan kirim instruksi edit videomu.");
    return response.status(200).send('OK');
  }

  try {
    const messageId = await sendTelegramMessage("⏳ Memproses instruksi...\n\n[□□□□□□□□□□] 0%");
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Animasi Loading (kita persingkat sedikit agar tidak timeout di Vercel)
    const bars = [
      "[■■□□□□□□□□] 20%", "[■■■■□□□□□□] 40%", 
      "[■■■■■■□□□□] 60%", "[■■■■■■■■□□] 80%", 
      "[■■■■■■■■■■] 100%"
    ];

    for (let i = 0; i < bars.length; i++) {
      await sleep(400); 
      await editTelegramMessage(messageId, `⏳ Memproses instruksi...\n\n${bars[i]}`);
    }

    // Bersih-bersih data lama (Kita bungkus try-catch agar kalau gagal, tidak menghentikan proses simpan)
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      await fetch(`${supabaseUrl}/rest/v1/perintah_edit?created_at=lt.${oneHourAgo}`, {
        method: 'DELETE',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
      });
    } catch (e) {
      console.log("Gagal hapus data lama, lanjut saja...");
    }

    // Simpan data baru
    const dbResponse = await fetch(`${supabaseUrl}/rest/v1/perintah_edit`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ perintah: userText })
    });

    // Jika database menolak, kita ambil pesan error aslinya
    if (!dbResponse.ok) {
      const errorData = await dbResponse.text();
      throw new Error(`DB Error: ${errorData}`);
    }

    await editTelegramMessage(messageId, `✅ <b>Berhasil!</b>\n\n[■■■■■■■■■■] 100%\n\nPerintah: "${userText}"\n\nSilakan cek website VEdit!`);

    // KEMBALIKAN STATUS 200 AGAR TELEGRAM TIDAK SPAM
    return response.status(200).send('OK');

  } catch (error) {
    console.error('Error:', error.message);
    // Tampilkan error asli ke Telegram agar kita tahu apa yang salah
    await sendTelegramMessage(`❌ <b>Gagal:</b>\n<code>${error.message}</code>`);
    
    // KEMBALIKAN STATUS 200 AGAR TELEGRAM TIDAK SPAM MESKIPUN ERROR
    return response.status(200).send('OK'); 
  }
}
