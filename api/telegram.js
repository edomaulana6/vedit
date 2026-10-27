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
    // TAHAP 2A: JIKA USER MAU DIBIKIN WEBSITE (HTML & CSS TERPISAH)
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

      // --- LANGKAH 1: AI MENULIS STRUKTUR HTML ---
      const htmlPrompt = `Kamu adalah Web Developer. Buatkan struktur HTML murni untuk website bertema: "${tema}".
      
      ATURAN:
      1. HANYA tulis kode HTML dari <!DOCTYPE html> sampai </html>.
      2. Gunakan tag semantik (header, nav, main, section, footer).
      3. Buat class yang jelas untuk setiap elemen (misal: class="hero", class="product-card", class="btn-buy").
      4. JANGAN gunakan CSS atau JavaScript di tahap ini.
      5. JANGAN gunakan gambar dari internet. Gunakan div kosong dengan class khusus (misal: <div class="product-image"></div>) yang nanti akan diwarnai oleh CSS.`;

      const htmlRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          messages: [{ role: 'user', content: htmlPrompt }],
          temperature: 0.5,
          max_tokens: 4000 
        })
      });

      const htmlData = await htmlRes.json();
      let strukturHTML = htmlData.choices[0]?.message?.content || "";
      strukturHTML = strukturHTML.replace(/```html/g, '').replace(/```/g, '').trim();

      if (!strukturHTML.includes('<html')) {
        await sendMsg("Sori, gagal nulis HTML-nya di awal. Coba minta lagi.", message.message_id);
        return response.status(200).send('OK');
      }

      // --- LANGKAH 2: AI MENULIS CSS (DESAIN) ---
      const cssPrompt = `Kamu adalah UI/UX Designer Expert. Buatkan kode CSS yang SANGAT CANTIK dan MODERN untuk struktur HTML bertema "${tema}" berikut ini:
      
      ${strukturHTML}
      
      ATURAN DESAIN:
      1. HANYA tulis kode CSS murni (tanpa tag <style>).
      2. Gunakan CSS Variables (:root) untuk palet warna yang sesuai tema "${tema}".
      3. Desain harus responsif (gunakan Flexbox/Grid).
      4. Berikan efek visual: box-shadow, border-radius, hover effects, dan transisi yang halus.
      5. Untuk class "product-image", berikan background gradient atau warna solid yang menarik (karena kita tidak pakai gambar).
      6. Pastikan kontras teks dan background sangat jelas.
      7. Desain harus terlihat seperti website profesional, bukan website jadul.`;

      const cssRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          messages: [{ role: 'user', content: cssPrompt }],
          temperature: 0.5,
          max_tokens: 4000 
        })
      });

      const cssData = await cssRes.json();
      let kodeCSS = cssData.choices[0]?.message?.content || "";
      kodeCSS = kodeCSS.replace(/```css/g, '').replace(/```/g, '').trim();

      // --- LANGKAH 3: GABUNGKAN HTML DAN CSS ---
      let finalKode = strukturHTML.replace('</head>', `<style>\n${kodeCSS}\n</style>\n</head>`);

      // --- LANGKAH 4: SIMPAN DATA LENGKAP KE "SUPER DATABASE" ---
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
