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
    // 1. Kirim pesan loading awal (0%)
    const loadingText = "⏳ Memproses instruksi...\n\n[□□□□□□□□□□] 0%";
    const messageId = await sendTelegramMessage(loadingText);

    // 2. Animasi Loading (10% - 100%)
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Perhatikan: sekarang ada 10 kotak penuh di akhir
    const bars = [
      "[■□□□□□□□□□] 10%", 
      "[■■□□□□□□□□] 20%", 
      "[■■■□□□□□□□] 30%",
      "[■■■■□□□□□□] 40%", 
      "[■■■■■□□□□□] 50%", 
      "[■■■■■■□□□□] 60%",
      "[■■■■■■■□□□] 70%", 
      "[■■■■■■■■□□] 80%", 
      "[■■■■■■■■■□] 90%",
      "[■■■■■■■■■■] 100%" // Ini tambahannya
    ];

    for (let i = 0; i < bars.length; i++) {
      await sleep(500); // Jeda 0.5 detik per bar
      await editTelegramMessage(messageId, `⏳ Memproses instruksi...\n\n${bars[i]}`);
    }

    // 3. Proses Database (Hapus data lama & Simpan baru)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await fetch(`${supabaseUrl}/rest/v1/perintah_edit?created_at=lt.${oneHourAgo}`, {
      method: 'DELETE',
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });

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

    if (!dbResponse.ok) throw new Error('Gagal menyimpan ke database');

    await sleep(800); // Jeda sebentar agar user sempat melihat 100%

    // 4. Pesan Final
    await editTelegramMessage(messageId, `✅ <b>Berhasil diproses!</b>\n\n[■■■■■■■■■■] 100%\n\nPerintah: "${userText}"\n\nSilakan buka <a href="https://vedit-nine.vercel.app">website VEdit</a> untuk melihat hasilnya!`);

    return response.status(200).send('OK');

  } catch (error) {
    console.error('Error:', error);
    await sendTelegramMessage("❌ Maaf, terjadi kesalahan sistem saat memproses perintah.");
    return response.status(500).send('Error');
  }
}
