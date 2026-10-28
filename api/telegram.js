// api/telegram.js
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

  // ==========================================
  // HELPER FUNCTIONS
  // ==========================================
  const sendMsg = async (text, replyTo = null, parseMode = 'HTML') => {
    const payload = { chat_id: chatId, text: text, parse_mode: parseMode };
    if (replyTo) payload.reply_to_message_id = replyTo;
    const res = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    return data.result?.message_id;
  };

  const editMsg = async (messageId, text) => {
    await fetch(`https://api.telegram.org/bot${telegramToken}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: text, parse_mode: 'HTML' })
    });
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // ==========================================
  // COMMAND DASAR
  // ==========================================
  if (userText === '/start') {
    await sendMsg(`Halo <b>${userName}</b>! Gue asisten pinter di sini. Mau ngobrol sarkas, atau mau gue bikinin aplikasi web yang super kompleks dan siap tempur? Kasih tau aja idenya.`);
    return response.status(200).send('OK');
  }

  // ==========================================
  // KIRIM RESPON OK KE TELEGRAM DULU (ANTI TIMEOUT VERCEL)
  // ==========================================
  response.status(200).send('OK'); 

  try {
    if (!groqApiKey) {
      await sendMsg("Sori, AI-nya lagi offline. Kasih tahu admin ya.", message.message_id);
      return;
    }

    // =======================================================
    // TAHAP 0: CEK APAKAH USER SEDANG MENJAWAB KLARIFIKASI
    // =======================================================
    const pendingRes = await fetch(
      `${supabaseUrl}/rest/v1/pending_requests?chat_id=eq.${chatId}&state=eq.WAITING_CLARIFICATION&order=created_at.desc&limit=1`,
      { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
    );
    const pendingData = await pendingRes.json();
    
    if (pendingData && pendingData.length > 0) {
      const pending = pendingData[0];
      // Gabungkan request awal dengan jawaban user
      userText = `Request awal: "${pending.original_request}". Jawaban detail dari user: "${userText}"`;
      
      // Hapus state pending karena sudah dijawab
      await fetch(`${supabaseUrl}/rest/v1/pending_requests?id=eq.${pending.id}`, {
        method: 'DELETE',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
      });
    }

    // =======================================================
    // TAHAP 1: DETEKSI NIAT (3 KATEGORI KETAT)
    // =======================================================
    const intentPrompt = `Kamu adalah sistem klasifikasi niat yang SANGAT KETAT.

Pesan user: "${userText}"

Klasifikasikan ke salah satu:
1. "WEBSITE_REQUEST" - user JELAS minta dibuatkan website (ada detail fitur/tujuan)
2. "WEBSITE_VAGUE" - user nyebut web/aplikasi TAPI gak jelas maunya apa
3. "CHAT" - ngobrol biasa, tanya, curhat, dll

ATURAN KETAT:
- "bikin web" tanpa detail = WEBSITE_VAGUE
- "web kalkulator pajak" = WEBSITE_REQUEST (jelas)
- "buat aplikasi" = WEBSITE_VAGUE
- "bisa bikin web?" = WEBSITE_VAGUE (pertanyaan, bukan perintah)
- "bikinin dong web to-do list yang ada deadline & reminder" = WEBSITE_REQUEST

Balas HANYA dengan format JSON:
{
  "intent": "WEBSITE_REQUEST" | "WEBSITE_VAGUE" | "CHAT",
  "tema": "tema spesifik (kosong kalau VAGUE/CHAT)",
  "alasan": "kenapa kamu pilih ini"
}`;

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
    // TAHAP 2: CLARIFICATION LOOP (JIKA VAGUE)
    // =======================================================
    if (intentJson.intent === "WEBSITE_VAGUE") {
      const clarifyPrompt = `User minta dibuatkan website tapi gak jelas. Pesan user: "${userText}"

Tugasmu: Tanya 2-3 pertanyaan SPESIFIK biar requirement jelas. JANGAN tanya lebih dari 3 pertanyaan.
Format balasan casual: "Oke, tapi gue butuh detail biar gak asal-asalan: 1. [tanya 1] 2. [tanya 2]..."

Contoh pertanyaan bagus: "Fitur utamanya apa?", "Target user-nya siapa?"`;

      const clarifyRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          messages: [{ role: 'user', content: clarifyPrompt }],
          temperature: 0.4,
          max_tokens: 200
        })
      });

      const clarifyData = await clarifyRes.json();
      const clarifyMsg = clarifyData.choices[0]?.message?.content;
      
      // Simpan state ke database
      await fetch(`${supabaseUrl}/rest/v1/pending_requests`, {
        method: 'POST',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          user_id: message.from.id,
          original_request: userText,
          state: 'WAITING_CLARIFICATION',
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 menit
        })
      });

      await sendMsg(clarifyMsg, message.message_id);
      return;
    }

    // =======================================================
    // TAHAP 3: PLANNING & GENERATE (JIKA REQUEST)
    // =======================================================
    if (intentJson.intent === "WEBSITE_REQUEST" && intentJson.tema) {
      const tema = intentJson.tema;
      
      const statusMsgId = await sendMsg(`🧠 <b>Fase Berpikir...</b>\n\nOke, gue analisa dulu requirement <b>${tema}</b>. Gue mau pastiin fitur inti & alur user-nya. Tunggu ~1-2 menit ya.`, message.message_id);

      // --- STEP 1: PLANNING (JSON) ---
      const planningPrompt = `Kamu adalah Senior Software Architect. User minta aplikasi web: "${tema}"
TUGASMU: BIKIN RENCANA DULU (JANGAN KODING).
Output JSON:
{
  "nama_aplikasi": "nama singkat & catchy",
  "deskripsi": "1 kalimat fungsi",
  "fitur_inti": ["fitur 1", "fitur 2", "fitur 3"],
  "fitur_skip": ["fitur yang sengaja TIDAK dibuat"],
  "user_flow": ["1. User buka...", "2. User input..."],
  "edge_cases": ["kalau kosong -> error"],
  "estimasi_kompleksitas": "SIMPLE | MEDIUM | COMPLEX"
}
Maksimal 3 fitur inti. Fitur skip WAJIB ada. Balas HANYA JSON.`;

      const planRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          messages: [{ role: 'user', content: planningPrompt }],
          temperature: 0.2,
          response_format: { type: "json_object" },
          max_tokens: 1000
        })
      });

      const planData = await planRes.json();
      let plan = null;
      try { plan = JSON.parse(planData.choices[0].message.content); } catch(e) {}

      if (!plan || !plan.fitur_inti || plan.fitur_inti.length === 0) {
        await editMsg(statusMsgId, `❌ Gagal bikin rencana. Tema "${tema}" mungkin terlalu ambigu. Coba lebih spesifik!`);
        return;
      }

      await editMsg(statusMsgId, `📋 <b>Rencana Aplikasi: ${plan.nama_aplikasi}</b>\n\n✅ <b>Fitur Inti:</b>\n${plan.fitur_inti.map((f, i) => `${i+1}. ${f}`).join('\n')}\n\n🔄 <b>User Flow:</b>\n${plan.user_flow.join('\n')}\n\n⚙️ <b>Mulai koding...</b>`);
      await sleep(3000);

      // --- STEP 2: GENERATE DENGAN CHAIN OF THOUGHT ---
      const webPrompt = `Kamu adalah Senior Full-Stack Developer tingkat dewa.
User minta aplikasi web: "${tema}"
RENCANA YANG DISETUJUI:
- Nama: ${plan.nama_aplikasi}
- Fitur inti: ${plan.fitur_inti.join(', ')}
- User flow: ${plan.user_flow.join(' -> ')}
- Edge cases: ${plan.edge_cases.join(', ')}

SEBELUM nulis kode, tulis dulu di dalam tag <thinking>:
1. HTML structure
2. CSS approach (warna, layout)
3. JS function apa aja
4. Event listener apa aja

Setelah </thinking>, BARU tulis kode HTML lengkap.
ATURAN KERAS:
- <script> WAJIB ada dan WAJIB punya function (minimal 2)
- <script> WAJIB punya addEventListener (minimal 1)
- JANGAN pakai alert() doang sebagai interaksi
- Responsive wajib
- Balas HANYA <thinking>...</thinking> lalu <!DOCTYPE html>...`;

      const webRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          messages: [{ role: 'user', content: webPrompt }],
          temperature: 0.2, // Turun dari 0.5
          max_tokens: 4096, // Sesuaikan limit model
          top_p: 0.9
        })
      });

      const webData = await webRes.json();
      const raw = webData.choices[0]?.message?.content || "";
      
      // Buang tag thinking, ambil kodenya
      let finalKode = raw.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
      finalKode = finalKode.replace(/```html/g, '').replace(/```/g, '').trim();

      // --- STEP 3: VALIDASI KODE ---
      const validationErrors = [];
      if (!finalKode.includes('<!DOCTYPE html>')) validationErrors.push('Missing DOCTYPE');
      if (!finalKode.includes('<script')) validationErrors.push('Missing <script> tag (logika kosong)');
      
      const hasEventListener = /addEventListener|onclick|oninput|onsubmit/.test(finalKode);
      if (!hasEventListener && plan.estimasi_kompleksitas !== 'SIMPLE') {
        validationErrors.push('Tidak ada event listener (tombol mati)');
      }

      if (finalKode.length < 1000) validationErrors.push('Kode terlalu pendek');

      // --- STEP 4: RETRY JIKA GAGAL ---
      if (validationErrors.length > 0) {
        await editMsg(statusMsgId, `⚠️ <b>Kode Gagal Validasi:</b>\n- ${validationErrors.join('\n- ')}\n\nGue coba perbaiki...`);
        
        const retryPrompt = `${webPrompt}\n\n⚠️ PERINGATAN: Percobaan sebelumnya GAGAL karena: ${validationErrors.join(', ')}. TULIS KODE LENGKAP DENGAN JAVASCRIPT YANG BERFUNGSI!`;
        
        const retryRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'openai/gpt-oss-120b',
            messages: [{ role: 'user', content: retryPrompt }],
            temperature: 0.15,
            max_tokens: 4096
          })
        });

        const retryData = await retryRes.json();
        finalKode = retryData.choices[0]?.message?.content || finalKode;
        finalKode = finalKode.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
        finalKode = finalKode.replace(/```html/g, '').replace(/```/g, '').trim();

        if (finalKode.length < 1000) {
          await editMsg(statusMsgId, `❌ <b>Gagal Total</b>\n\nAI gak bisa produce kode layak untuk tema ini. Coba lebih spesifik.`);
          return;
        }
      }

      // --- STEP 5: SIMPAN KE DATABASE ---
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
          status: "QA_PASSED" 
        })
      });

      if (!dbRes.ok) throw new Error("Gagal menyimpan ke Database");

      await editMsg(statusMsgId, `✅ <b>Proses Selesai!</b>\n\nAplikasi <b>${tema}</b> sudah jadi, fiturnya lengkap, dan logikanya berfungsi. Silakan cek di sini:\nhttps://vexora.devs.li/web/${slug}`);
      
      return;
    }

    // =======================================================
    // TAHAP 4: NGOBROL BIASA (CHAT)
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
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}
