export type NewsArticle = {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  description: string;
  thumbnail: string;
  source: string;
};

export const SOURCE_COLOURS: { [key: string]: string } = {
  'CBC Ottawa': '#cc3b2a',
  'Ottawa Citizen': '#004890',
  'Ottawa Sun': '#e8a020',
  'Capital Current': '#00A78D',
  'City of Ottawa': '#7b5ea7',
};

export function timeAgo(dateStr: string, lang: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return '';
  const mins = Math.floor((now - then) / 60000);
  if (mins < 1) return lang === 'fr' ? 'maintenant' : 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}${lang === 'fr' ? 'j' : 'd'}`;
}
