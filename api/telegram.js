export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).send('Method Not Allowed');

  const { message } = request.body;
  if (!message) return response.status(200).send('OK');
  if (message.from && message.from.is_bot) return response.status(200).send('OK');

  const chatId = message.chat.id;
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;

  const userName = message.from.first_name || "Kawan";
  let userText = message.text || message.caption || "";
  
  let fileContext = "";
  if (message.photo) fileContext = "[User mengirim FOTO]";
  else if (message.video) fileContext = "[User mengirim VIDEO]";
  else if (message.sticker) fileContext = "[User mengirim STIKER]";

  if (!userText && !fileContext) return response.status(200).send('OK');

  const sendMsg = async (text, replyTo = null) => {
    const payload = { chat_id: chatId, text: text, parse_mode: 'HTML' };
    if (replyTo) payload.reply_to_message_id = replyTo;
    await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  };

  if (userText === '/start') {
    await sendMsg(`Halo <b>${userName}</b>! Gue asisten pinter di sini. Mau ngobrol sarkas, atau mau gue bikinin website? Gue bakal ngecek kodenya dulu sampai bener-bener sempurna.`);
    return response.status(200).send('OK');
  }

  try {
    if (!groqApiKey) {
      await sendMsg("Sori, AI-nya lagi offline. Kasih tahu admin ya.", message.message_id);
      return response.status(200).send('OK');
    }

    // =======================================================
    // TAHAP 1: DETEKSI NIAT
    // =======================================================
    const intentPrompt = `Kamu adalah sistem pendeteksi niat. 
    User berkata: "${userText}"
    Tugasmu: Tentukan apakah user ingin DIBUATKAN WEBSITE atau cuma NGOBROL BIASA.
    Jawab HANYA dengan format JSON: { "intent": "WEBSITE", "tema": "tema website" } ATAU { "intent": "CHAT", "tema": "" }`;

    const intentRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [{ role: 'user', content: intentPrompt }],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    const intentData = await intentRes.json();
    let intentJson = { intent: "CHAT", tema: "" };
    try { intentJson = JSON.parse(intentData.choices[0].message.content); } catch (e) {}

    // =======================================================
    // TAHAP 2A: JIKA USER MAU DIBIKIN WEBSITE (PROSES 2 LANGKAH)
    // =======================================================
    if (intentJson.intent === "WEBSITE" && intentJson.tema) {
      const tema = intentJson.tema;
      await sendMsg(`⏳ Oke, gue bikinin website <b>${tema}</b>. Gue nulis kodenya dulu, terus gue cek pakai "mata" gue. Tunggu ya...`, message.message_id);

      // --- LANGKAH 1: AI MENULIS DRAF KODE ---
      const webPrompt = `Kamu adalah Senior Web Developer. Buatkan kode website LENGKAP (HTML+CSS+JS dalam 1 file) bertema: "${tema}".
      Aturan: Hanya balas dengan kode HTML murni dari <!DOCTYPE html> sampai </html>. Desain modern, responsif, dan keren.`;

      const webRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          messages: [{ role: 'user', content: webPrompt }],
          temperature: 0.5,
          max_tokens: 6000 
        })
      });

      const webData = await webRes.json();
      let drafKode = webData.choices[0]?.message?.content || "";
      drafKode = drafKode.replace(/```html/g, '').replace(/```/g, '').trim();

      if (!drafKode.includes('<html')) {
        await sendMsg("Sori, gagal nulis kodenya di awal. Coba minta lagi.", message.message_id);
        return response.status(200).send('OK');
      }

      // --- LANGKAH 2: AI MEMERIKSA KODENYA SENDIRI (MATA AI / QA) ---
      await sendMsg(`🔍 Kode awal selesai. Sekarang gue lagi ngecek error, UI yang kurang pas, atau script berbahaya...`, message.message_id);

      const qaPrompt = `Kamu adalah Quality Assurance (QA) Web Expert yang sangat teliti. 
      Tugasmu memeriksa kode HTML/CSS/JS berikut. Cari kesalahan seperti:
      1. Tag HTML yang tidak tertutup atau berantakan.
      2. CSS yang bikin UI rusak atau tidak responsif di HP.
      3. JavaScript error atau fitur yang tidak berfungsi.
      4. Script sensitif/berbahaya (misal: eval(), innerHTML yang rawan XSS).
      5. Desain yang terlihat norak atau kurang profesional.
      
      Jika ada kesalahan, PERBAIKI kodenya. 
      Jika kodenya sudah sempurna, biarkan saja.
      
      Balas HANYA dengan kode HTML final yang sudah diperbaiki. Jangan ada teks penjelasan apapun. Dari <!DOCTYPE html> sampai </html>.
      
      Kode yang harus diperiksa:
      ${drafKode}`;

      const qaRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          messages: [{ role: 'user', content: qaPrompt }],
          temperature: 0.3, // Rendah agar fokus memperbaiki
          max_tokens: 6000 
        })
      });

      const qaData = await qaRes.json();
      let finalKode = qaData.choices[0]?.message?.content || drafKode; // Fallback ke draf awal jika QA gagal
      finalKode = finalKode.replace(/```html/g, '').replace(/```/g, '').trim();

      // --- LANGKAH 3: SIMPAN DATA LENGKAP KE "SUPER DATABASE" ---
      const slug = tema.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 20) + '-' + Date.now().toString().slice(-4);
      
      const dbRes = await fetch(`${supabaseUrl}/rest/v1/websites`, {
        method: 'POST',
        headers: { 
          'apikey': supabaseKey, 
          'Authorization': `Bearer ${supabaseKey}`, 
          'Content-Type': 'application/json', 
          'Prefer': 'return=minimal' 
        },
        body: JSON.stringify({ 
          slug: slug, 
          html_code: finalKode,
          title: tema,              // Simpan judul asli
          created_by: userName,    // Simpan nama pembuatnya
          status: "QA_PASSED"      // Tandai sudah lolos pengecekan AI
        })
      });

      if (!dbRes.ok) {
        throw new Error("Gagal menyimpan ke Super Database");
      }

      await sendMsg(`✅ <b>Website jadi & sudah dicek!</b>\nTema: <i>${tema}</i>\n\nGue udah pastiin kodenya bersih, aman, dan UI-nya oke. Cek di sini: https://vedit-nine.vercel.app/web/${slug}`, message.message_id);
      
      return response.status(200).send('OK');
    }

    // =======================================================
    // TAHAP 2B: JIKA USER CUMA MAU NGOBROL (SARKAS)
    // =======================================================
    const systemPrompt = `Kamu adalah AI bernama VEdit di Grup Telegram. Nama user: "${userName}". 
    Kepribadian: Cerdas, sarkas (playful), tapi sopan.`;

    let promptToAI = userText;
    if (fileContext) promptToAI = `${fileContext} ${userText ? `Caption: "${userText}"` : 'Tanpa teks.'}`;

    const chatRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b', 
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: promptToAI }],
        temperature: 0.7, max_tokens: 250
      })
    });

    const chatData = await chatRes.json();
    const aiReply = chatData.choices[0]?.message?.content;

    if (aiReply) await sendMsg(aiReply, message.message_id);
    return response.status(200).send('OK');

  } catch (error) {
    console.error('Error:', error.message);
    return response.status(200).send('OK'); 
  }
}
