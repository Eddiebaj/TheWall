import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const FEEDS: Record<string, string> = {
  carleton: 'https://events.carleton.ca/feed/',
  uottawa: 'https://www.uottawa.ca/en/events/rss.xml',
  algonquin: 'https://www.algonquincollege.com/events/feed/',
};

serve(async (req) => {
  const url = new URL(req.url);
  const campus = url.searchParams.get('campus') || 'carleton';

  const feedUrl = FEEDS[campus];
  if (!feedUrl) {
    return new Response(JSON.stringify({ events: [] }), { status: 200 });
  }

  try {
    const resp = await fetch(feedUrl, {
      headers: { 'User-Agent': 'RouteO/1.0' }
    });

    if (!resp.ok) {
      return new Response(JSON.stringify({ events: [], error: `Feed returned ${resp.status}` }), { status: 200 });
    }

    const xml = await resp.text();

    // Parse RSS items
    const items: any[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && items.length < 20) {
      const item = match[1];
      const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1] || '';
      const link = item.match(/<link>(.*?)<\/link>/)?.[1] || '';
      const description = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/)?.[1] || '';
      const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
      const date = pubDate ? new Date(pubDate).toLocaleDateString('en-CA') : '';

      if (title) {
        items.push({
          id: link || title,
          name: title.trim(),
          description: description.replace(/<[^>]*>/g, '').trim().slice(0, 200),
          date,
          url: link.trim(),
          campus,
        });
      }
    }

    return new Response(JSON.stringify({ events: items }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ events: [], error: String(err) }), { status: 200 });
  }
});
