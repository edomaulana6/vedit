// api/telegram.js
export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).send('Method Not Allowed');

  const { message, callback_query } = request.body;
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;
  const tavilyKey = process.env.TAVILY_API_KEY;

  // 1. Handle Tombol Menu
  if (callback_query) {
    await fetch(`https://api.telegram.org/bot${telegramToken}/answerCallbackQuery`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callback_query.id, text: "Siap! Tinggal ketik aja apa yang lo mau." })
    });
    return response.status(200).send('OK');
  }

  if (!message || (message.from && message.from.is_bot)) return response.status(200).send('OK');

  const chatId = message.chat.id;
  const userName = message.from?.first_name || "Kawan";
  let userText = message.text || message.caption || "";
  
  if (!userText) return response.status(200).send('OK');

  // Helper Kirim Pesan
  const sendMsg = async (text, replyTo = null, replyMarkup = null) => {
    const payload = { chat_id: chatId, text: text, parse_mode: 'HTML' };
    if (replyTo) payload.reply_to_message_id = replyTo;
    if (replyMarkup) payload.reply_markup = replyMarkup;
    try {
      const res = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      return (await res.json()).result?.message_id;
    } catch (e) { console.error("Gagal kirim pesan:", e.message); }
  };

  // Helper Typing
  const sendTyping = async () => {
    try {
      await fetch(`https://api.telegram.org/bot${telegramToken}/sendChatAction`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, action: 'typing' })
      });
    } catch (e) {}
  };

  // 2. Handle Command Dasar (/start & /tools)
  if (userText === '/start' || userText === '/tools') {
    const menuText = `Halo <b>${userName}</b>! 👋\n\nGue VEdit. Anggap aja gue temen ngobrol lo yang kebetulan punya akses ke internet, bisa bikinin website, dan pinter ngitung.\n\nTinggal ketik aja natural kayak ngobrol biasa.`;
    const keyboard = { inline_keyboard: [[{ text: '🌐 Bikin Web', callback_data: 'tool_web' }, { text: '🔍 Cari Info', callback_data: 'tool_search' }]] };
    await sendMsg(menuText, message.message_id, keyboard);
    return response.status(200).send('OK');
  }

  // 3. Proses Utama (Kita TAHAN response sampai selesai biar gak dibunuh Vercel)
  try {
    if (!groqApiKey) return await sendMsg("Sori, otak gue (Groq API) lagi offline.") && response.status(200).send('OK');
    await sendTyping();

    // --- MEMORY ---
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
    } catch (e) { console.log("Memory error:", e.message); }

    // Simpan chat user
    fetch(`${supabaseUrl}/rest/v1/chat_history`, { 
      method: 'POST', headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' }, 
      body: JSON.stringify([{ chat_id: String(chatId), role: 'user', content: userText }]) 
    }).catch(() => {});

    // --- TOOLS DEFINITION ---
    const tools = [
      { type: "function", function: { name: "web_search", description: "Cari info terbaru", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
      { type: "function", function: { name: "weather", description: "Cek cuaca", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } } },
      { type: "function", function: { name: "crypto_price", description: "Harga crypto", parameters: { type: "object", properties: { coin: { type: "string" } }, required: ["coin"] } } },
      { type: "function", function: { name: "calculate", description: "Kalkulator", parameters: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] } } },
      { type: "function", function: { name: "run_javascript", description: "Logika rumit/zodiak", parameters: { type: "object", properties: { code: { type: "string" } }, required: ["code"] } } },
      { type: "function", function: { name: "create_website", description: "Bikin aplikasi web", parameters: { type: "object", properties: { tema: { type: "string" } }, required: ["tema"] } } }
    ];

    const systemPrompt = `Kamu adalah VEdit, asisten AI pribadi. Nama user: "${userName}".
GAYA BICARA: Santai, luwes, gak kaku, kayak temen ngobrol. Jangan formal. Pakai "gue/lo".
${memoryContext}
ATURAN: Panggil tool jika butuh info real-time atau hitungan.`;

    // --- PANGGIL GROQ ---
    const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', 
      headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant', 
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userText }],
        tools: tools, tool_choice: 'auto', temperature: 0.6, max_tokens: 500
      })
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      await sendMsg(`❌ API Error: ${errText.substring(0, 100)}`);
      return response.status(200).send('OK');
    }

    const aiData = await aiRes.json();
    const aiMessage = aiData.choices[0]?.message;

    // --- EKSEKUSI TOOL ---
    if (aiMessage.tool_calls) {
      const toolCall = aiMessage.tool_calls[0];
      const toolName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);
      let toolResult = "";

      try {
        if (toolName === 'web_search') {
          const r = await fetch('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: tavilyKey, query: args.query, max_results: 3 }) });
          const d = await r.json();
          toolResult = d.results ? d.results.map(x => `- ${x.title}: ${x.content}`).join('\n') : "Gak nemu apa-apa.";
        } 
        else if (toolName === 'weather') {
          const geo = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(args.city)}&count=1`)).json();
          if (!geo.results) throw new Error("Kota gak ketemu.");
          const { latitude, longitude } = geo.results[0];
          const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
          const d = await r.json();
          toolResult = `Suhu: ${d.current_weather.temperature}°C, Angin: ${d.current_weather.windspeed} km/jam.`;
        }
        else if (toolName === 'crypto_price') {
          const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${args.coin.toLowerCase()}&vs_currencies=usd,idr`);
          const d = await r.json();
          toolResult = d[args.coin.toLowerCase()] ? `Harga: $${d[args.coin.toLowerCase()].usd} / Rp${d[args.coin.toLowerCase()].idr}` : "Koin gak ada.";
        }
        else if (toolName === 'calculate') {
          const math = new Function('return ' + args.expression.replace(/[^0-9+\-*/().]/g, ''));
          toolResult = `Hasil: ${math()}`;
        }
        else if (toolName === 'run_javascript') {
          const pistonRes = await fetch('https://emkc.org/api/v2/piston/execute', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ language: 'javascript', version: '18.15.0', files: [{ content: args.code }] })
          });
          const pistonData = await pistonRes.json();
          toolResult = pistonData.run?.output || "Kodenya error.";
        }
        else if (toolName === 'create_website') {
          const tema = args.tema;
          await sendMsg(`Siap, gue otak-atik dulu web <b>${tema}</b>-nya...`, message.message_id);
          const webPrompt = `Bikin web bertema: "${tema}". Balas HANYA <!DOCTYPE html>... </html>. Wajib ada <script> dan CSS modern.`;
          const webRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST', headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: webPrompt }], temperature: 0.3, max_tokens: 4096 })
          });
          const webData = await webRes.json();
          let finalKode = webData.choices[0]?.message?.content || "";
          finalKode = finalKode.replace(/```html/g, '').replace(/```/g, '').trim();
          if (!finalKode.includes('<html')) {
            toolResult = "Gagal nulis kode web.";
          } else {
            const slug = tema.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 20) + '-' + Date.now().toString().slice(-4);
            await fetch(`${supabaseUrl}/rest/v1/websites`, {
              method: 'POST', headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ slug: slug, html_code: finalKode, title: tema, created_by: userName, status: "QA_PASSED" })
            });
            toolResult = `Web jadi! Buka: https://vexora.devs.li/web/${slug}`;
          }
        }

        // Rangkum hasil tool
        const finalRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST', headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            model: 'llama-3.1-8b-instant', 
            messages: [
              { role: 'system', content: systemPrompt }, 
              { role: 'user', content: userText },
              aiMessage,
              { role: 'tool', tool_call_id: toolCall.id, content: toolResult }
            ], temperature: 0.6, max_tokens: 400 
          })
        });
        const finalData = await finalRes.json();
        const finalReply = finalData.choices[0]?.message?.content || toolResult;
        await sendMsg(finalReply, message.message_id);

      } catch (err) {
        await sendMsg(`Aduh, error pas pake tool: ${err.message}`, message.message_id);
      }
      return response.status(200).send('OK');
    }

    // --- JAWABAN BIASA ---
    if (aiMessage?.content) {
      await sendMsg(aiMessage.content, message.message_id);
    }
    
    return response.status(200).send('OK');

  } catch (error) {
    console.error("FATAL ERROR:", error.message);
    await sendMsg("Waduh, ada error di sistem gue. Coba lagi ya.");
    return response.status(200).send('OK');
  }
}
