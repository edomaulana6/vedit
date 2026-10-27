export default async function handler(request, response) {
  // Ambil slug dari URL (misal: ?slug=jualan-es-tebu)
  const { slug } = request.query;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!slug) return response.status(400).send('URL tidak valid');

  try {
    // Cari website di Supabase berdasarkan slug
    const res = await fetch(`${supabaseUrl}/rest/v1/websites?slug=eq.${slug}&select=html_code`, {
      headers: { 
        'apikey': supabaseKey, 
        'Authorization': `Bearer ${supabaseKey}` 
      }
    });
    const data = await res.json();

    // Jika website ditemukan, tampilkan HTML-nya
    if (data && data.length > 0) {
      response.setHeader('Content-Type', 'text/html');
      return response.status(200).send(data[0].html_code);
    } else {
      return response.status(404).send('<h1>Website tidak ditemukan di database</h1>');
    }
  } catch (error) {
    return response.status(500).send('Error server');
  }
}
