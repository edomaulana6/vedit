export default async function handler(request, response) {
  // Izinkan akses dari website VEdit
  response.setHeader('Access-Control-Allow-Origin', '*');
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  try {
    // 1. Ambil 1 perintah terbaru dari Supabase
    const dbResponse = await fetch(`${supabaseUrl}/rest/v1/perintah_edit?select=*&order=created_at.desc&limit=1`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    
    const data = await dbResponse.json();

    if (data && data.length > 0) {
      const perintah = data[0];

      // 2. Hapus perintah ini dari database agar tidak dieksekusi 2 kali
      await fetch(`${supabaseUrl}/rest/v1/perintah_edit?id=eq.${perintah.id}`, {
        method: 'DELETE',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      });

      // 3. Kirim datanya ke website
      return response.status(200).json({ adaPerintah: true, teks: perintah.perintah });
    }

    return response.status(200).json({ adaPerintah: false });

  } catch (error) {
    return response.status(500).json({ error: 'Gagal mengambil data' });
  }
}
