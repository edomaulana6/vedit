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
      body: JSON.stringify({ callback_query_id: callback_query.id, text: "Tool siap digunakan!" })
    });
    return response.status(200).send('OK');
  }

  if (!message || (message.from && message.from.is_bot)) return response.status(200).send('OK');

  const chatId = message.chat.id;
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;
  const tavilyKey = process.env.TAVILY_API_KEY;

  const userName = message.from?.first_name || "Kawan";
  let userText = message.text || message.caption || "";
  
  if (!userText && !message.photo && !message.video && !message.sticker) return response.status(200).send('OK');

  // Helper untuk kirim pesan
  const sendMsg = async (text, replyTo = null, replyMarkup = null) => {
    const payload = { chat_id: chatId, text: text, parse_mode: 'HTML' };
    if (replyTo) payload.reply_to_message_id = replyTo;
    if (replyMarkup) payload.reply_markup = replyMarkup;
    const res = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return (await res.json()).result?.message_id;
  };

  // Helper untuk status "typing..." biar Vercel gak matiin proses
  const sendTyping = async () => {
    await fetch(`https://api.telegram.org/bot${telegramToken}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' })
    });
  };

  if (userText === '/start') {
    await sendMsg(`Halo <b>${userName}</b>! Ketik /tools buat lihat kemampuan gue.`);
    return response.status(200).send('OK');
  }

  if (userText === '/tools') {
    const menuText = `🛠️ <b>Tools VEdit</b>\n\n• <code>/search [kata]</code>\n• <code>/weather [kota]</code>\n• <code>/crypto [koin]</code>\n\n<i>Atau ngobrol natural aja!</i>`;
    const keyboard = { inline_keyboard: [[{ text: '🔍 Search', callback_data: 'tool_search' }]] };
    await sendMsg(menuText, message.message_id, keyboard);
    return response.status(200).send('OK');
  }

  try {
    if (!groqApiKey) return await sendMsg("❌ ERROR: GROQ_API_KEY belum diisi di Vercel!");

    // Tampilkan status "typing..." biar user tau bot lagi mikir
    await sendTyping();

    // =======================================================
    // AI & TOOLS (Groq)
    // =======================================================
    const tools = [
      { type: "function", function: { name: "web_search", description: "Cari info terbaru di internet", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
      { type: "function", function: { name: "weather", description: "Cek cuaca", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } } },
      { type: "function", function: { name: "crypto_price", description: "Harga crypto", parameters: { type: "object", properties: { coin: { type: "string" } }, required: ["coin"] } } },
      { type: "function", function: { name: "calculate", description: "Kalkulator matematika", parameters: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] } } }
    ];

    const systemPrompt = `Kamu adalah AI VEdit. Nama user: "${userName}". Kepribadian: Cerdas, sarkas, sopan. Gunakan tools yang tersedia jika perlu.`;

    const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userText }],
        tools: tools,
        tool_choice: 'auto',
        temperature: 0.4
      })
    });

    if (!aiRes.ok) {
      const errData = await aiRes.text();
      return await sendMsg(`❌ ERROR GROQ API (${aiRes.status}): ${errData}`);
    }

    const aiData = await aiRes.json();
    const aiMessage = aiData.choices[0]?.message;

    if (aiMessage.tool_calls) {
      const toolCall = aiMessage.tool_calls[0];
      const toolName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);
      let toolResult = "";

      try {
        if (toolName === 'web_search') {
          if (!tavilyKey) throw new Error("TAVILY_API_KEY belum diset.");
          const r = await fetch('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: tavilyKey, query: args.query, max_results: 3 }) });
          const d = await r.json();
          toolResult = d.results ? d.results.map(x => `- ${x.title}: ${x.content}`).join('\n') : "Tidak ada hasil.";
        } 
        else if (toolName === 'weather') {
          const geo = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(args.city)}&count=1`)).json();
          if (!geo.results) throw new Error("Kota tidak ditemukan.");
          const { latitude, longitude } = geo.results[0];
          const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
          const d = await r.json();
          toolResult = `Cuaca di ${geo.results[0].name}: ${d.current_weather.temperature}°C, Angin ${d.current_weather.windspeed} km/h.`;
        }
        else if (toolName === 'crypto_price') {
          const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${args.coin.toLowerCase()}&vs_currencies=usd,idr`);
          const d = await r.json();
          if (d[args.coin.toLowerCase()]) {
            toolResult = `Harga ${args.coin}: $${d[args.coin.toLowerCase()].usd} / Rp${d[args.coin.toLowerCase()].idr}`;
          } else throw new Error("Koin tidak ditemukan.");
        }
        else if (toolName === 'calculate') {
          const math = new Function('return ' + args.expression.replace(/[^0-9+\-*/().]/g, ''));
          toolResult = `Hasil: ${math()}`;
        }

        // Kirim hasil tool ke AI untuk dirangkum
        const finalRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            model: 'openai/gpt-oss-120b', 
            messages: [
              { role: 'system', content: systemPrompt }, 
              { role: 'user', content: userText },
              aiMessage,
              { role: 'tool', tool_call_id: toolCall.id, content: toolResult }
            ], 
            temperature: 0.5, max_tokens: 400 
          })
        });
        const finalData = await finalRes.json();
        const finalReply = finalData.choices[0]?.message?.content || "Gagal merangkum hasil.";
        
        await sendMsg(finalReply, message.message_id);

      } catch (err) {
        await sendMsg(`❌ Gagal eksekusi tool ${toolName}: ${err.message}`, message.message_id);
      }
      return response.status(200).send('OK');
    }

    // Jika cuma ngobrol
    const aiReply = aiMessage?.content;
    if (aiReply) {
      await sendMsg(aiReply, message.message_id);
    }
    return response.status(200).send('OK');

  } catch (error) {
    console.error('FATAL ERROR:', error.message);
    await sendMsg(`❌ FATAL ERROR: ${error.message}`);
    return response.status(200).send('OK');
  }
}
