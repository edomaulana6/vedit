// api/telegram.js
export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).send('Method Not Allowed');

  const { message, callback_query } = request.body;
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;
  const tavilyKey = process.env.TAVILY_API_KEY;

  if (callback_query) {
    await fetch(`https://api.telegram.org/bot${telegramToken}/answerCallbackQuery`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callback_query.id, text: "Siap!" })
    });
    return response.status(200).send('OK');
  }

  if (!message || (message.from && message.from.is_bot)) return response.status(200).send('OK');

  const chatId = message.chat.id;
  const userName = message.from?.first_name || "Kawan";
  let userText = message.text || message.caption || "";
  
  if (!userText) return response.status(200).send('OK');

  const sendMsg = async (text, replyTo = null) => {
    const payload = { chat_id: chatId, text: text, parse_mode: 'HTML', disable_web_page_preview: true };
    if (replyTo) payload.reply_to_message_id = replyTo;
    try {
      const res = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      return (await res.json()).result?.message_id;
    } catch (e) { console.log("Gagal kirim:", e.message); }
  };

  const sendTyping = async () => {
    try {
      await fetch(`https://api.telegram.org/bot${telegramToken}/sendChatAction`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, action: 'typing' })
      });
    } catch (e) {}
  };

  if (userText === '/start' || userText === '/tools') {
    const menuText = `Halo <b>${userName}</b>! 👋\n\nGue VEdit. Gue bisa <b>nulis kode sendiri</b> buat nyelesaiin tugas lo. Mau bikin tool baru, hitung rumit, atau bikin web, tinggal minta aja natural!`;
    await sendMsg(menuText, message.message_id);
    return response.status(200).send('OK');
  }

  try {
    if (!groqApiKey) return await sendMsg("Sori, otak gue (Groq API) lagi offline.") && response.status(200).send('OK');
    await sendTyping();

    // MEMORY
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

    fetch(`${supabaseUrl}/rest/v1/chat_history`, { 
      method: 'POST', headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' }, 
      body: JSON.stringify([{ chat_id: String(chatId), role: 'user', content: userText }]) 
    }).catch(() => {});

    // TOOLS DEFINITION
    const tools = [
      { type: "function", function: { name: "web_search", description: "Cari info terbaru", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
      { type: "function", function: { name: "weather", description: "Cek cuaca", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } } },
      { type: "function", function: { name: "crypto_price", description: "Harga crypto", parameters: { type: "object", properties: { coin: { type: "string" } }, required: ["coin"] } } },
      { type: "function", function: { name: "create_website", description: "Bikin aplikasi web", parameters: { type: "object", properties: { tema: { type: "string" } }, required: ["tema"] } } },
      { type: "function", function: { name: "run_ephemeral_js", description: "Tulis & jalankan kode JS baru (sekali pakai) untuk tool/fitur yang belum ada. WAJIB pakai console.log() untuk output.", parameters: { type: "object", properties: { code: { type: "string", description: "Kode JS murni. Gunakan console.log() untuk output." } }, required: ["code"] } } }
    ];

    // SYSTEM PROMPT
    const systemPrompt = `Kamu adalah VEdit, AI Agent Otonom. Nama user: "${userName}".
GAYA BICARA: Santai, luwes, gak kaku. Pakai "gue/lo".

${memoryContext}

⚠️ ATURAN MUTLAK:
1. KAMU BISA BIKIN TOOL BARU SENDIRI! Jika user minta fitur yang gak ada, KAMU WAJIB nulis kodenya pakai tool 'run_ephemeral_js'.
2. WAJIB pakai 'console.log()' di dalam kode JS yang kamu tulis, kalau tidak, hasilnya bakal kosong dan kamu gagal.
3. JANGAN PERNAH nolak permintaan user. Bikin aja kodenya sekarang!
4. JANGAN ngasih teori/brosur. LANGSUNG EKSEKUSI.`;

    const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', 
      headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen/qwen3.8-27b', 
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userText }],
        tools: tools, tool_choice: 'auto', temperature: 0.5, max_tokens: 500
      })
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      await sendMsg(`❌ API Error: ${errText.substring(0, 150)}`);
      return response.status(200).send('OK');
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
          const r = await fetch('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: tavilyKey, query: args.query, max_results: 3 }) });
          const d = await r.json();
          toolResult = d.results && d.results.length > 0 ? d.results.map(x => `- ${x.title}: ${x.content}`).join('\n') : "Hasil pencarian tidak ditemukan.";
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
        
        // --- EKSEKUSI TOOL DINAMIS (FIX BUG) ---
        else if (toolName === 'run_ephemeral_js') {
          await sendMsg(`⚡ <i>AI lagi nulis kode tool baru buat lo...</i>`, message.message_id);
          
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000); 
            
            const pistonRes = await fetch('https://emkc.org/api/v2/piston/execute', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ language: 'javascript', version: '18.15.0', files: [{ content: args.code }] }),
              signal: controller.signal
            });
            clearTimeout(timeout);
            
            const pistonData = await pistonRes.json();
            
            if (pistonData.run && pistonData.run.output && pistonData.run.output.trim() !== "") {
              toolResult = pistonData.run.output;
            } else if (pistonData.run && pistonData.run.stderr) {
              toolResult = `⚠️ Kode jalan tapi ada error:\n${pistonData.run.stderr}`;
            } else {
              // FALLBACK: Kalau kode kosong, paksa AI buat tau kalau ini gagal
              toolResult = `⚠️ Kode berhasil dieksekusi, tapi AI lupa nambahin 'console.log()' jadi hasilnya kosong.`;
            }
          } catch (e) {
            toolResult = `❌ Gagal eksekusi kode: ${e.message}`;
          }
        }

        else if (toolName === 'create_website') {
          const tema = args.tema;
          await sendMsg(`Siap, gue otak-atik dulu web <b>${tema}</b>-nya...`, message.message_id);
          const webPrompt = `Bikin web bertema: "${tema}". Balas HANYA <!DOCTYPE html>... </html>. Wajib ada <script> dan CSS modern.`;
          const webRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST', headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'qwen/qwen3.8-27b', messages: [{ role: 'user', content: webPrompt }], temperature: 0.3, max_tokens: 4096 })
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

        // --- RANGKUM HASIL TOOL (ANTI-STAK) ---
        const finalRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST', headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            model: 'qwen/qwen3.8-27b', 
            messages: [
              { role: 'system', content: systemPrompt }, 
              { role: 'user', content: userText },
              aiMessage,
              { role: 'tool', tool_call_id: toolCall.id, content: toolResult }
            ], temperature: 0.6, max_tokens: 400 
          })
        });
        const finalData = await finalRes.json();
        const finalReply = finalData.choices[0]?.message?.content;

        // FIX BUG STAK: Kalau AI bengong (null), kirim raw output Piston-nya!
        if (finalReply) {
          await sendMsg(finalReply, message.message_id);
        } else {
          await sendMsg(`✅ <b>Hasil dari AI:</b>\n\n<code>${toolResult}</code>`, message.message_id);
        }

      } catch (err) {
        await sendMsg(`Aduh, error pas eksekusi: ${err.message}`, message.message_id);
      }
      return response.status(200).send('OK');
    }

    // Jika cuma ngobrol
    if (aiMessage?.content) {
      await sendMsg(aiMessage.content, message.message_id);
    } else {
      // FIX BUG STAK: Kalau AI gak ngasih jawaban sama sekali
      await sendMsg("Hmm, gue bingung mau jawab apa. Coba tanya lagi ya.", message.message_id);
    }
    
    return response.status(200).send('OK');

  } catch (error) {
    console.error("FATAL ERROR:", error.message);
    await sendMsg("Waduh, ada error di sistem gue. Coba lagi ya.");
    return response.status(200).send('OK');
  }
}
