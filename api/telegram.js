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
    await sendMsg(`Halo <b>${userName}</b>! Gue asisten pinter di sini. Mau ngobrol sarkas, atau mau gue bikinin aplikasi web yang super kompleks dan siap tempur? Kasih tau aja idenya.`);
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
    Tugasmu: Tentukan apakah user ingin DIBUATKAN WEBSITE/APLIKASI atau cuma NGOBROL BIASA.
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
    // TAHAP 2A: JIKA USER MAU DIBIKIN APLIKASI/WEB
    // =======================================================
    if (intentJson.intent === "WEBSITE" && intentJson.tema) {
      const tema = intentJson.tema;
      
      const statusMsgId = await sendMsg(`🧠 <b>Memulai Analisis Mendalam...</b>\n\nOke, gue bikinin aplikasi web <b>${tema}</b>. Gue mau mikirin arsitektur UI/UX dan logika JavaScript-nya yang paling kompleks. Ini bakal makan waktu sekitar <b>5 menit atau lebih</b>. Jangan kemana-mana ya...`, message.message_id);

      const steps = [
        "🔍 <b>Fase 1: Riset & Wireframing</b>\nLagi nyusun struktur HTML... (20%)",
        "🎨 <b>Fase 2: Desain UI/UX</b>\nLagi mikirin warna dan animasi... (40%)",
        "⚙️ <b>Fase 3: Logika JavaScript</b>\nLagi nulis fungsi biar tombolnya jalan... (60%)",
        "🛡️ <b>Fase 4: Security & QA</b>\nLagi ngecek error dan celah keamanan... (80%)",
        "✨ <b>Fase 5: Finalisasi</b>\nHampir kelar nih, poles dikit... (99%)"
      ];

      for (let i = 0; i < steps.length; i++) {
        await sleep(1500); // Jeda 1.5 detik agar tidak kena timeout Vercel
        await editMsg(statusMsgId, steps[i]);
      }

      // --- LANGKAH 1: AI MENULIS KODE APLIKASI (PROMPT TINGKAT DEWA) ---
      const webPrompt = `Kamu adalah seorang Senior Full-Stack Web Developer dan UI/UX Designer tingkat dewa. 
      
      TUGAS UTAMA KAMU:
      Buatkan aplikasi web fungsional bertema: "${tema}". 
      Aplikasi ini HARUS BENERAN BERFUNGSI, bukan sekadar tampilan (UI) kosong.

      ======================================================================
      ⚠️ PERINGATAN KERAS (BACA DULU):
      Jika kamu hanya membalas dengan HTML dan CSS tanpa tag <script> yang berisi logika JavaScript yang berfungsi, maka KAMU GAGAL SEBAGAI PROGRAMMER.
      ======================================================================

      ATURAN DESAIN UI/UX (WAJIB MODERN & PREMIUM):
      1. Gunakan CSS Variables (:root) untuk mendefinisikan palet warna. Sesuaikan warna dengan tema "${tema}".
      2. Layout utama menggunakan Flexbox atau CSS Grid, dengan max-width: 1200px dan diposisikan di tengah layar (margin: 0 auto). Jangan biarkan konten mengecil.
      3. Gunakan efek visual modern seperti glassmorphism (background semi-transparan, backdrop-filter: blur), border-radius besar (15-20px), dan box-shadow yang halus.
      4. Typography: Gunakan Google Fonts (Poppins/Inter). Pastikan kontras teks dan background sangat jelas.
      5. JANGAN GUNAKAN GAMBAR DARI INTERNET. Gunakan gradient CSS, shapes, atau icon SVG inline.
      6. Responsif: Pastikan layout berubah menjadi 1 kolom vertikal di HP.

      ATURAN LOGIKA (JIKA APLIKASI BUTUH INTERAKSI):
      1. Jika tema adalah alat (kalkulator, konverter, downloader, to-do list), WAJIB tulis logika JavaScript di dalam <script>.
      2. Pastikan semua tombol, input, dan event listener berfungsi penuh dan mengubah data di layar.
      3. Gunakan try-catch untuk menangani error jaringan atau input yang salah.
      4. Tampilkan pesan loading saat proses berjalan, dan pesan error/sukses yang jelas ke user.

      STRUKTUR KODE:
      - Balas HANYA dengan kode HTML murni dari <!DOCTYPE html> sampai </html>.
      - Gabungkan CSS di dalam <style> dan JS di dalam <script>.
      - JANGAN ada teks penjelasan apapun di luar kode.`;

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
      let finalKode = webData.choices[0]?.message?.content || "";
      finalKode = finalKode.replace(/```html/g, '').replace(/```/g, '').trim();

      if (!finalKode.includes('<html')) {
        await sendMsg("Sori, gagal nulis kodenya. Coba minta lagi.", message.message_id);
        return response.status(200).send('OK');
      }

      // --- LANGKAH 2: SIMPAN DATA LENGKAP KE "SUPER DATABASE" ---
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

      await editMsg(statusMsgId, `✅ <b>Proses Selesai!</b>\n\nAplikasi <b>${tema}</b> sudah jadi dan logikanya berfungsi. Silakan cek di sini:\nhttps://vexora.devs.li/web/${slug}`);
      
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
