// api/telegram.js
export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).send('Method Not Allowed');

  const { message, callback_query } = request.body;

  // Handle Callback Query (Tombol Inline)
  if (callback_query) {
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    await fetch(`https://api.telegram.org/bot${telegramToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callback_query.id, text: "Tool siap digunakan! Ketik command-nya." })
    });
    return response.status(200).send('OK');
  }

  if (!message) return response.status(200).send('OK');
  if (message.from && message.from.is_bot) return response.status(200).send('OK');

  const chatId = message.chat.id;
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;
  const tavilyKey = process.env.TAVILY_API_KEY;

  const userName = message.from.first_name || "Kawan";
  let userText = message.text || message.caption || "";
  
  let fileContext = "";
  if (message.photo) fileContext = "[User mengirim FOTO]";
  else if (message.video) fileContext = "[User mengirim VIDEO]";
  else if (message.sticker) fileContext = "[User mengirim STIKER]";

  if (!userText && !fileContext) return response.status(200).send('OK');

  const sendMsg = async (text, replyTo = null, replyMarkup = null) => {
    const payload = { chat_id: chatId, text: text, parse_mode: 'HTML' };
    if (replyTo) payload.reply_to_message_id = replyTo;
    if (replyMarkup) payload.reply_markup = replyMarkup;
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
  // COMMAND DASAR & MENU TOOLS
  // ==========================================
  if (userText === '/start') {
    await sendMsg(`Halo <b>${userName}</b>! Gue asisten pinter di sini. Mau ngobrol sarkas, atau mau gue bikinin aplikasi web? Ketik /tools buat lihat kemampuan gue.`);
    return response.status(200).send('OK');
  }

  if (userText === '/tools' || userText === '/menu') {
    const menuText = `🛠️ <b>Daftar Tools VEdit</b>\n\n<b>🔍 Pencarian</b>\n• <code>/search [kata]</code>\n• <code>/wiki [topik]</code>\n• <code>/weather [kota]</code>\n\n<b>💰 Keuangan</b>\n• <code>/crypto [koin]</code>\n• <code>/currency [jml] [dari] [ke]</code>\n\n<b>🧮 Utilitas</b>\n• <code>/calc [ekspresi]</code>\n• <code>/qr [teks]</code>\n• <code>/shorten [url]</code>\n• <code>/password [panjang]</code>\n• <code>/ip [alamat]</code>\n• <code>/time [zona]</code>\n• <code>/dict [kata]</code>\n\n<i>Atau tinggal ngobrol natural — gue otomatis pilih tool yang pas.</i>`;
    
    const keyboard = {
      inline_keyboard: [
        [{ text: '🔍 Search', callback_data: 'tool_search' }, { text: '🎨 Bikin Web', callback_data: 'tool_web' }],
        [{ text: '💰 Crypto', callback_data: 'tool_crypto' }, { text: '🌤️ Cuaca', callback_data: 'tool_weather' }]
      ]
    };

    await sendMsg(menuText, message.message_id, keyboard);
    return response.status(200).send('OK');
  }

  // Kirim OK duluan biar Vercel gak timeout
  response.status(200).send('OK'); 

  try {
    if (!groqApiKey) return await sendMsg("Sori, AI-nya lagi offline.", message.message_id);

    // =======================================================
    // CEK PENDING KLARIFIKASI & SIMPAN MEMORY
    // =======================================================
    const pendingRes = await fetch(`${supabaseUrl}/rest/v1/pending_requests?chat_id=eq.${chatId}&state=eq.WAITING_CLARIFICATION&order=created_at.desc&limit=1`, { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } });
    const pendingData = await pendingRes.json();
    
    if (pendingData && pendingData.length > 0) {
      const pending = pendingData[0];
      userText = `Request awal: "${pending.original_request}". Jawaban detail: "${userText}"`;
      await fetch(`${supabaseUrl}/rest/v1/pending_requests?id=eq.${pending.id}`, { method: 'DELETE', headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } });
    }

    await fetch(`${supabaseUrl}/rest/v1/chat_history`, { method: 'POST', headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify([{ chat_id: chatId, role: 'user', content: userText }]) });

    // =======================================================
    // TAHAP 1: DETEKSI NIAT & TOOL CALLING
    // =======================================================
    const tools = [
      { type: "function", function: { name: "web_search", description: "Cari info terbaru di internet", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
      { type: "function", function: { name: "wikipedia", description: "Ringkasan Wikipedia", parameters: { type: "object", properties: { topic: { type: "string" } }, required: ["topic"] } } },
      { type: "function", function: { name: "weather", description: "Cek cuaca", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } } },
      { type: "function", function: { name: "get_time", description: "Waktu di zona tertentu", parameters: { type: "object", properties: { timezone: { type: "string" } }, required: ["timezone"] } } },
      { type: "function", function: { name: "crypto_price", description: "Harga crypto", parameters: { type: "object", properties: { coin: { type: "string" } }, required: ["coin"] } } },
      { type: "function", function: { name: "currency_convert", description: "Konversi mata uang", parameters: { type: "object", properties: { amount: { type: "number" }, from: { type: "string" }, to: { type: "string" } }, required: ["amount", "from", "to"] } } },
      { type: "function", function: { name: "calculate", description: "Kalkulator matematika", parameters: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] } } },
      { type: "function", function: { name: "qr_generate", description: "Bikin QR Code", parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } } },
      { type: "function", function: { name: "shorten_url", description: "Perpendek URL", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } },
      { type: "function", function: { name: "password_generate", description: "Generate password", parameters: { type: "object", properties: { length: { type: "number" } }, required: ["length"] } } },
      { type: "function", function: { name: "ip_lookup", description: "Info IP Address", parameters: { type: "object", properties: { ip: { type: "string" } }, required: ["ip"] } } },
      { type: "function", function: { name: "dictionary", description: "Arti kata bahasa Inggris", parameters: { type: "object", properties: { word: { type: "string" } }, required: ["word"] } } },
      { type: "function", function: { name: "create_website", description: "Bikin aplikasi web jika user minta dengan detail", parameters: { type: "object", properties: { tema: { type: "string" } }, required: ["tema"] } } }
    ];

    // --- MEMORY: AMBIL KONTEKS ---
    const [sumRes, histRes] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/chat_summaries?chat_id=eq.${chatId}&order=created_at.desc&limit=3`, { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }),
      fetch(`${supabaseUrl}/rest/v1/chat_history?chat_id=eq.${chatId}&order=created_at.desc&limit=15`, { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } })
    ]);
    const summaries = await sumRes.json();
    const recentMsgs = (await histRes.json()).reverse();
    
    let summaryContext = summaries.length > 0 ? `[Konteks lama]\n${summaries.reverse().map(s => s.summary).join('\n')}` : "";
    const systemPrompt = `Kamu adalah AI VEdit. Nama user: "${userName}". Kepribadian: Cerdas, sarkas, sopan.\n${summaryContext}\nATURAN: Gunakan tools yang tersedia jika user bertanya hal real-time atau minta dibuatkan web.`;

    const messagesForAI = [
      { role: 'system', content: systemPrompt },
      ...recentMsgs.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userText }
    ];

    const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: messagesForAI,
        tools: tools,
        tool_choice: 'auto',
        temperature: 0.4
      })
    });

    const aiData = await aiRes.json();
    const aiMessage = aiData.choices[0]?.message;

    // =======================================================
    // JIKA AI MEMILIH TOOL
    // =======================================================
    if (aiMessage.tool_calls) {
      const toolCall = aiMessage.tool_calls[0];
      const toolName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);
      let toolResult = "";

      if (toolName === 'create_website') {
        // (MASUKKAN KODE PLANNING & GENERATE WEB DARI FASE 1 DI SINI)
        // Gue potong biar gak kepanjangan, panggil fungsinya aja.
        const tema = args.tema;
        const statusMsgId = await sendMsg(`🧠 <b>Fase Berpikir...</b>\n\nOke, gue analisa <b>${tema}</b>.`, message.message_id);
        await sleep(2000);
        await editMsg(statusMsgId, `⚙️ <b>Mulai koding...</b>`);
        // ... (Panggil logika generate lo di sini, lalu simpan ke DB) ...
        return;
      }

      // Eksekusi Tools Ringan
      try {
        if (toolName === 'web_search') {
          if (!tavilyKey) throw new Error("API Key Tavily belum diset.");
          const r = await fetch('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: tavilyKey, query: args.query, max_results: 3 }) });
          const d = await r.json();
          toolResult = d.results.map(x => `- ${x.title}: ${x.content}`).join('\n');
        } 
        else if (toolName === 'wikipedia') {
          const r = await fetch(`https://id.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(args.topic)}`);
          const d = await r.json();
          toolResult = d.extract || "Topik tidak ditemukan.";
        }
        else if (toolName === 'weather') {
          const geo = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(args.city)}&count=1`)).json();
          if (!geo.results) throw new Error("Kota tidak ditemukan.");
          const { latitude, longitude } = geo.results[0];
          const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
          const d = await r.json();
          toolResult = `Cuaca di ${geo.results[0].name}: ${d.current_weather.temperature}°C, Kecepatan Angin ${d.current_weather.windspeed} km/h.`;
        }
        else if (toolName === 'get_time') {
          toolResult = `Waktu sekarang: ${new Date().toLocaleString('id-ID', { timeZone: args.timezone })}`;
        }
        else if (toolName === 'crypto_price') {
          const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${args.coin.toLowerCase()}&vs_currencies=usd,idr`);
          const d = await r.json();
          if (d[args.coin.toLowerCase()]) {
            toolResult = `Harga ${args.coin}: $${d[args.coin.toLowerCase()].usd} / Rp${d[args.coin.toLowerCase()].idr}`;
          } else throw new Error("Koin tidak ditemukan.");
        }
        else if (toolName === 'currency_convert') {
          const r = await fetch(`https://api.frankfurter.app/latest?amount=${args.amount}&from=${args.from}&to=${args.to}`);
          const d = await r.json();
          toolResult = `${args.amount} ${args.from} = ${d.rates[args.to]} ${args.to}`;
        }
        else if (toolName === 'calculate') {
          // Kalkulator simpel
          toolResult = `Hasil: ${eval(args.expression.replace(/[^0-9+\-*/().]/g, ''))}`;
        }
        else if (toolName === 'qr_generate') {
          toolResult = `Ini QR Code lo: https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(args.text)}`;
        }
        else if (toolName === 'shorten_url') {
          const r = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(args.url)}`);
          toolResult = `URL Pendek: ${await r.text()}`;
        }
        else if (toolName === 'password_generate') {
          const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
          let pass = "";
          for (let i = 0; i < (args.length || 16); i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
          toolResult = `Password (${args.length || 16} char): <code>${pass}</code>`;
        }
        else if (toolName === 'ip_lookup') {
          const r = await fetch(`http://ip-api.com/json/${args.ip}`);
          const d = await r.json();
          toolResult = `IP: ${d.query}\nNegara: ${d.country}\nKota: ${d.city}\nISP: ${d.isp}`;
        }
        else if (toolName === 'dictionary') {
          const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${args.word}`);
          const d = await r.json();
          toolResult = `Arti: ${d[0].meanings[0].definitions[0].definition}`;
        }

        // Kirim hasil tool balik ke AI buat dirangkum
        messagesForAI.push(aiMessage);
        messagesForAI.push({ role: 'tool', tool_call_id: toolCall.id, content: toolResult });

        const finalRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'openai/gpt-oss-120b', messages: messagesForAI, temperature: 0.5, max_tokens: 400 })
        });
        const finalData = await finalRes.json();
        const finalReply = finalData.choices[0]?.message?.content;
        
        await sendMsg(finalReply, message.message_id);
        await fetch(`${supabaseUrl}/rest/v1/chat_history`, { method: 'POST', headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify([{ chat_id: chatId, role: 'assistant', content: finalReply }]) });
        return;

      } catch (err) {
        await sendMsg(`❌ Gagal eksekusi tool: ${err.message}`, message.message_id);
        return;
      }
    }

    // =======================================================
    // JIKA CUMA NGOBROL / NGGAK PAKAI TOOL
    // =======================================================
    const aiReply = aiMessage?.content;
    if (aiReply) {
      await sendMsg(aiReply, message.message_id);
      await fetch(`${supabaseUrl}/rest/v1/chat_history`, { method: 'POST', headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify([{ chat_id: chatId, role: 'assistant', content: aiReply }]) });
      
      // Auto-summarize
      const countRes = await fetch(`${supabaseUrl}/rest/v1/chat_history?chat_id=eq.${chatId}&select=count`, { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } });
      const [{ count }] = await countRes.json();
      if (count >= 20) {
        const oldRes = await fetch(`${supabaseUrl}/rest/v1/chat_history?chat_id=eq.${chatId}&order=created_at.asc&limit=10`, { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } });
        const oldMsgs = await oldRes.json();
        const summaryPrompt = `Ringkas obrolan ini jadi 1 kalimat: \n${oldMsgs.map(m => `${m.role}: ${m.content}`).join('\n')}`;
        const sumRes = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: [{ role: 'user', content: summaryPrompt }], temperature: 0.2 }) });
        const summaryText = (await sumRes.json()).choices[0].message.content;
        
        await fetch(`${supabaseUrl}/rest/v1/chat_summaries`, { method: 'POST', headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, summary: summaryText }) });
        await fetch(`${supabaseUrl}/rest/v1/chat_history?id=in.(${oldMsgs.map(m => m.id).join(',')})`, { method: 'DELETE', headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } });
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}
