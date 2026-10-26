export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') return response.status(200).end();
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });

  // Hanya butuh videoUrl dan caption dari website
  const { videoUrl, caption } = request.body;
  
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  // Mengambil Chat ID dari Environment Variable rahasia
  const chatId = process.env.TELEGRAM_CHAT_ID; 

  if (!videoUrl || !chatId) {
    return response.status(400).json({ error: 'videoUrl kosong atau TELEGRAM_CHAT_ID belum diset di Vercel' });
  }

  try {
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

    return response.status(200).json({ success: true });
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}
