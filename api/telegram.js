// api/telegram.js
export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).send('Method Not Allowed');

  const { message, callback_query } = request.body;
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;
  const tavilyKey = process.env.TAVILY_API_KEY;

  // Handle Tombol Menu
  if (callback_query) {
    await fetch(`https://api.telegram.org/bot${telegramToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callback_query.id, text: "Gue siap bantu! Tinggal ketik aja apa yang lo mau." })
    });
    return response.status(200).send('OK');
  }

  if (!message || (message.from && message.from.is_bot)) return response.status(200).send('OK');

  const chatId = message.chat.id;
  const userName = message.from?.first_name || "Kawan";
  let userText = message.text || message.caption || "";
  
  if (!userText) return response.status(200).send('OK');

  // Helper
  const sendMsg = async (text, replyTo = null, replyMarkup = null) => {
    const payload = { chat_id: chatId, text: text, parse_mode: 'HTML' };
    if (replyTo) payload.reply_to_message_id = replyTo;
    if (replyMarkup) payload.reply_markup = replyMarkup;
    const res = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    return (await res.json()).result?.message_id;
  };

  const sendTyping = async () => {
    await fetch(`https://api.telegram.org/bot${telegramToken}/sendChatAction`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, action: 'typing' })
    });
  };

  const showMenu = async (replyTo = null) => {
    const menuText = `Halo <b>${userName}</b>! 👋\n\nGue VEdit. Anggap aja gue temen ngobrol lo yang kebetulan punya akses ke internet, bisa bikinin website, dan pinter ngitung.\n\nLo gak perlu hafal command kok. Mau tanya cuaca, harga crypto, minta bikinin web, atau sekadar curhat, tinggal ketik aja natural kayak ngobrol biasa.`;
    const keyboard = {
      inline_keyboard: [
        [{ text: '🌐 Bikin Web', callback_data: 'tool_web' }, { text: '🔍 Cari Info', callback_data: 'tool_search' }],
        [{ text: '🌤️ Cek Cuaca', callback_data: 'tool_weather' }, { text: '💰 Harga Crypto', callback_data: 'tool_crypto' }]
      ]
    };
    await sendMsg(menuText, replyTo, keyboard);
  };

  if (userText === '/start' || userText === '/tools') {
    await showMenu(message.message_id);
    return response.status(200).send('OK');
  }

  // Kirim status 200 OK ke Telegram biar gak timeout
  response.status(200).send('OK');

  try {
    if (!groqApiKey) return await sendMsg("Sori, otak gue (Groq API) lagi offline nih.");
    await sendTyping();

    // =======================================================
    // AMBIL MEMORY DARI SUPABASE
    // =======================================================
    let memoryContext = "";
    try {
      const [sumRes, histRes] = await Promise.all([
        fetch(`${supabaseUrl}/rest/v1/chat_summaries?chat_id=eq.${chatId}&order=created_at.desc&limit=3`, { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }),
        fetch(`${supabaseUrl}/rest/v1/chat_history?chat_id=eq.${chatId}&order=created_at.desc&limit=10`, { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } })
      ]);
      const summaries = await sumRes.json();
      const history = (await histRes.json()).reverse();
      
      const sumText = summaries.length > 0 ? summaries.map(s => s.summary).join('\n') : "";
      if (sumText) memoryContext = `[Catatan Masa Lalu]: ${sumText}\n`;
      
      if (Array.isArray(history) && history.length > 0) {
        memoryContext += `[Obrolan Sebelumnya]:\n` + history.map(h => `${h.role === 'user' ? 'User' : 'Kamu'}: ${h.content}`).join('\n');
      }
    } catch (e) {
      console.log("Memory error (diabaikan):", e.message);
    }

    // Simpan chat user ke DB
    fetch(`${supabaseUrl}/rest/v1/chat_history`, { 
      method: 'POST', headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' }, 
      body: JSON.stringify([{ chat_id: String(chatId), role: 'user', content: userText }]) 
    }).catch(() => {});

    // =======================================================
    // DEFINISI TOOLS
    // =======================================================
    const tools = [
      { type: "function", function: { name: "web_search", description: "Cari info terbaru di internet", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
      { type: "function", function: { name: "weather", description: "Cek cuaca", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } } },
      { type: "function", function: { name: "crypto_price", description: "Harga crypto", parameters: { type: "object", properties: { coin: { type: "string" } }, required: ["coin"] } } },
      { type: "function", function: { name: "calculate", description: "Kalkulator matematika", parameters: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] } } },
      { type: "function", function: { name: "run_javascript", description: "Jalankan kode JS untuk logika rumit, hitung tanggal, zodiak, atau algoritma", parameters: { type: "object", properties: { code: { type: "string" } }, required: ["code"] } } },
      { type: "function", function: { name: "create_website", description: "Bikin aplikasi web fungsional", parameters: { type: "object", properties: { tema: { type: "string" } }, required: ["tema"] } } }
    ];

    // =======================================================
    // SYSTEM PROMPT (PERSONA ELASTIS)
    // =======================================================
    const systemPrompt = `Kamu adalah VEdit, asisten AI pribadi di Telegram. Nama user saat ini: "${userName}".
    
GAYA BICARA:
- Anggap user adalah teman akrab. Santai, luwes, gak kaku, dan gak robotik.
- JANGAN pernah pakai kata pengantar formal kayak "Sebagai AI...", "Tentu, saya akan...", atau "Berikut adalah...".
- Jawab langsung ke intinya dengan bahasa manusia. Kalau bisa pakai bahasa gaul santai (gue/lo), pakai itu.
- Fleksibel: kalau user lagi bercanda, ikut bercanda. Kalau user butuh bantuan serius, jadi serius.
- Jangan nunggu user ngetik command kayak /search. Kalau dari obrolan natural dia nanya cuaca, langsung panggil tool cuaca.

${memoryContext}

TUGAS:
1. Gunakan ingatan di atas untuk nyambungin obrolan.
2. Kalau user minta dibuatkan web, panggil 'create_website'.
3. Kalau butuh hitungan presisi, panggil 'calculate' atau 'run_javascript'.`;

    const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', 
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userText }],
        tools: tools, tool_choice: 'auto', 
        temperature: 0.7, // Dinaikkan biar lebih ekspresif dan luwes
        max_tokens: 800
      })
    });

    const aiData = await aiRes.json();
    const aiMessage = aiData.choices[0]?.message;

    // =======================================================
    // EKSEKUSI TOOL
    // =======================================================
    if (aiMessage.tool_calls) {
      // Ambil semua tool calls (kalau AI mau panggil 2 tool sekaligus)
      const toolCall = aiMessage.tool_calls[0]; 
      const toolName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);
      let toolResult = "";

      try {
        if (toolName === 'web_search') {
          const r = await fetch('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: tavilyKey, query: args.query, max_results: 3 }) });
          const d = await r.json();
          toolResult = d.results ? d.results.map(x => `- ${x.title}: ${x.content}`).join('\n') : "Gak nemu apa-apa di internet.";
        } 
        else if (toolName === 'weather') {
          const geo = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(args.city)}&count=1`)).json();
          if (!geo.results) throw new Error("Kota gak ketemu.");
          const { latitude, longitude } = geo.results[0];
          const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
          const d = await r.json();
          toolResult = `Suhu di ${geo.results[0].name} sekarang ${d.current_weather.temperature}°C, angin ${d.current_weather.windspeed} km/jam.`;
        }
        else if (toolName === 'crypto_price') {
          const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${args.coin.toLowerCase()}&vs_currencies=usd,idr`);
          const d = await r.json();
          toolResult = d[args.coin.toLowerCase()] ? `Harga ${args.coin}: $${d[args.coin.toLowerCase()].usd} / Rp${d[args.coin.toLowerCase()].idr}` : "Koinnya gak ada di pasar.";
        }
        else if (toolName === 'calculate') {
          const math = new Function('return ' + args.expression.replace(/[^0-9+\-*/().]/g, ''));
          toolResult = `Hasilnya: ${math()}`;
        }
        else if (toolName === 'run_javascript') {
          const pistonRes = await fetch('https://emkc.org/api/v2/piston/execute', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ language: 'javascript', version: '18.15.0', files: [{ content: args.code }] })
          });
          const pistonData = await pistonRes.json();
          toolResult = pistonData.run?.output || "Kodenya error pas dijalanin.";
        }
        
        // --- WEBSITE GENERATOR ---
        else if (toolName === 'create_website') {
          const tema = args.tema;
          const statusMsgId = await sendMsg(`Siap, gue otak-atik dulu ya web <b>${tema}</b>-nya. Tunggu bentar...`, message.message_id);
          await sendTyping();
          
          const webPrompt = `Kamu adalah UI/UX Designer dan Developer handal. Bikin aplikasi web bertema: "${tema}".
WAJIB: Balas HANYA dengan <!DOCTYPE html>... sampai </html>. 
WAJIB: Desain modern, responsive, ada <style> keren dan <script> yang berisi minimal 2 function dan 1 addEventListener. JANGAN pakai library dari internet.`;
          
          const webRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST', headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: webPrompt }], temperature: 0.3, max_tokens: 4096 })
          });
          
          const webData = await webRes.json();
          let finalKode = webData.choices[0]?.message?.content || "";
          finalKode = finalKode.replace(/```html/g, '').replace(/```/g, '').trim();
          
          if (!finalKode.includes('<html')) {
            toolResult = "Waduh, gagal nulis kodenya. Coba minta lagi.";
          } else {
            const slug = tema.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 20) + '-' + Date.now().toString().slice(-4);
            await fetch(`${supabaseUrl}/rest/v1/websites`, {
              method: 'POST', headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ slug: slug, html_code: finalKode, title: tema, created_by: userName, status: "QA_PASSED" })
            });
            toolResult = `Webnya udah jadi! Buka di sini: https://vexora.devs.li/web/${slug}`;
          }
        }

        // Minta AI merangkum hasil tool dengan bahasa yang luwes
        const finalRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST', headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            model: 'llama-3.3-70b-versatile', 
            messages: [
              { role: 'system', content: systemPrompt }, 
              { role: 'user', content: userText },
              aiMessage,
              { role: 'tool', tool_call_id: toolCall.id, content: toolResult }
            ], 
            temperature: 0.7, // Tetep tinggi biar rangkumannya natural
            max_tokens: 500 
          })
        });
        const finalData = await finalRes.json();
        const finalReply = finalData.choices[0]?.message?.content || toolResult;
        
        await sendMsg(finalReply, message.message_id);

      } catch (err) {
        await sendMsg(`Aduh, gue nyoba pake tool tapi error: ${err.message}`, message.message_id);
      }
      return;
    }

    // Jika cuma ngobrol
    if (aiMessage?.content) {
      await sendMsg(aiMessage.content, message.message_id);
    }

  } catch (error) {
    console.error('FATAL ERROR:', error.message);
  }
}
