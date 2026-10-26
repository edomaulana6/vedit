export default async function handler(request, response) {
  // Izinkan akses dari website VEdit (CORS)
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') return response.status(200).end();
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });

  // Hanya butuh videoUrl dan caption dari website
  const { videoUrl, caption } = request.body;
  
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  // Mengambil Chat ID dari Environment Variable rahasia di Vercel
  const chatId = process.env.TELEGRAM_CHAT_ID; 

  if (!videoUrl) {
    return response.status(400).json({ error: 'videoUrl wajib diisi' });
  }
  
  if (!chatId) {
    return response.status(500).json({ error: 'TELEGRAM_CHAT_ID belum diset di Environment Variables Vercel' });
  }

  try {
    // Kirim video ke Telegram menggunakan URL publik (dari Catbox)
    const res = await fetch(`https://api.telegram.org/bot${telegramToken}/sendVideo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        video: videoUrl,
        caption: caption || 'Video hasil editan dari VEdit 🎬'
      })
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.description);

    return response.status(200).json({ success: true, message: "Video terkirim ke Telegram" });
  } catch (error) {
    console.error('Telegram Error:', error.message);
    return response.status(500).json({ error: error.message });
  }
}
