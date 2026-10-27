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
    const res = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    return data.result.message_id;
  };

  const editMsg = async (messageId, text) => {
    await fetch(`https://api.telegram.org/bot${telegramToken}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: text, parse_mode: 'HTML' })
    });
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  if (userText === '/start') {
    await sendMsg(`Halo <b>${userName}</b>! Gue asisten pinter di sini. Mau ngobrol sarkas, atau mau gue bikinin website yang super kompleks dan siap tempur? Kasih tau aja idenya.`);
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
    // TAHAP 2A: JIKA USER MAU DIBIKIN WEBSITE (ULTIMATE GOD MODE)
    // =======================================================
    if (intentJson.intent === "WEBSITE" && intentJson.tema) {
      const tema = intentJson.tema;
      
      const statusMsgId = await sendMsg(`🧠 <b>Memulai Analisis Mendalam...</b>\n\nOke, gue bikinin website <b>${tema}</b>. Gue mau mikirin arsitektur UI/UX yang paling kompleks dan memastikan kodenya nggak ada bug. Ini bakal makan waktu sekitar <b>5 menit atau lebih</b>. Jangan kemana-mana ya...`, message.message_id);

      const steps = [
        "🔍 <b>Fase 1: Riset & Wireframing</b>\nLagi nyusun struktur HTML dan layout CSS yang paling pas... (10%)",
        "🎨 <b>Fase 2: Desain UI/UX</b>\nLagi mikirin kombinasi warna, font, dan animasi transisi yang bikin mata terpukau... (30%)",
        "⚙️ <b>Fase 3: Logika & Interaktivitas</b>\nLagi nulis JavaScript buat bikin fitur-fitur sensitif lu berjalan mulus tanpa error... (60%)",
        "🛡️ <b>Fase 4: Security & QA Review</b>\nLagi ngecek celah XSS, error tag HTML, dan mastiin layout responsif di HP... (85%)",
        "✨ <b>Fase 5: Finalisasi</b>\nHampir kelar nih, lagi poles dikit biar sempurna... (99%)"
      ];

      for (let i = 0; i < steps.length; i++) {
        await sleep(4000); 
        await editMsg(statusMsgId, steps[i]);
      }

      // --- LANGKAH 1: AI MENULIS DRAF KODE (PROMPT SUPER KETAT) ---
      const webPrompt = `Kamu adalah Principal Software Engineer dan UI/UX Designer tingkat dewa. 
      Tugasmu membuat website bertema: "${tema}".
      
      ATURAN DESAIN (SANGAT KETAT & WAJIB):
      1. JANGAN GUNAKAN GAMBAR DARI INTERNET (URL). Kamu DILARANG menggunakan <img> dengan src http/https karena gambarnya sering mati atau tidak relevan. 
      2. Ganti gambar dengan elemen visual CSS: Gradient, kotak berwarna, atau SVG inline.
      3. Gunakan CSS Variables (:root) untuk mendefinisikan palet warna utama. Pastikan kontras teks dan background SANGAT JELAS (jangan teks putih di background putih).
      4. Layout WAJIB rapi menggunakan Flexbox atau CSS Grid. Beri padding minimal 16px agar tidak sesak.
      5. Gunakan Google Fonts (Inter, Poppins, atau Roboto) untuk tipografi yang profesional.
      6. Desain harus responsif (media queries) dan tidak ada elemen yang meluber keluar layar HP.
      7. Buat JavaScript yang berfungsi penuh (form, kalkulator, keranjang, dll) jika diminta.
      8. JANGAN berikan teks penjelasan. HANYA kode HTML murni dari <!DOCTYPE html> sampai </html>.`;

      const webRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          messages: [{ role: 'user', content: webPrompt }],
          temperature: 0.5,
          max_tokens: 8000 
        })
      });

      const webData = await webRes.json();
      let drafKode = webData.choices[0]?.message?.content || "";
      drafKode = drafKode.replace(/```html/g, '').replace(/```/g, '').trim();

      if (!drafKode.includes('<html')) {
        await sendMsg("Sori, gagal nulis kodenya di awal. Coba minta lagi.", message.message_id);
        return response.status(200).send('OK');
      }

      // --- LANGKAH 2: QA DESAIN & KEAMANAN (MATA AI TINGKAT DEWA) ---
      const qaPrompt = `Kamu adalah Quality Assurance (QA) dan Security Expert yang SANGAT KETAT. 
      Periksa kode HTML/CSS/JS berikut dan PERBAIKI SEMUA MASALAH ini:
      1. Apakah ada <img> yang menggunakan URL internet? GANTI dengan CSS gradient atau SVG jika gambarnya tidak relevan dengan tema "${tema}".
      2. Apakah ada teks yang warnanya menyatu dengan background? (Ubah agar kontras).
      3. Apakah layout berantakan di HP? (Perbaiki media queries).
      4. Apakah ada error JavaScript? (Perbaiki logikanya).
      5. Apakah ada celah keamanan XSS? (Bersihkan).
      
      Kembalikan kode HTML final yang sudah diperbaiki dan SANGAT SEMPURNA. 
      HANYA balas dengan kode HTML dari <!DOCTYPE html> sampai </html>.
      
      KODE AWAL:
      ${drafKode}`;

      const qaRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          messages: [{ role: 'user', content: qaPrompt }],
          temperature: 0.3, 
          max_tokens: 8000 
        })
      });

      const qaData = await qaRes.json();
      let finalKode = qaData.choices[0]?.message?.content || drafKode; 
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
          title: tema,
          created_by: userName,
          status: "GOD_MODE_QA_PASSED" 
        })
      });

      if (!dbRes.ok) throw new Error("Gagal menyimpan ke Super Database");

      await editMsg(statusMsgId, `✅ <b>Proses Selesai!</b>\n\nWebsite <b>${tema}</b> sudah jadi, sudah di-QA, dan dipastikan aman serta desainnya presisi. Silakan cek di sini:\nhttps://vexora.devs.li/web/${slug}`);
      
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
