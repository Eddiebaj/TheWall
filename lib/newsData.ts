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
  'Apt613': '#e85d75',
  'Lowertown Echo': '#2a6b4f',
  'Kitchissippi Times': '#c0852a',
};

export const SOURCE_FALLBACK_ICONS: { [key: string]: string } = {
  'CBC Ottawa': 'radio-outline',
  'Ottawa Citizen': 'document-text-outline',
  'Ottawa Sun': 'sunny-outline',
  'Capital Current': 'flash-outline',
  'City of Ottawa': 'business-outline',
  'Apt613': 'home-outline',
  'Lowertown Echo': 'newspaper-outline',
  'Kitchissippi Times': 'newspaper-outline',
};

export const SOURCE_LOGOS: { [key: string]: { image: any; size: number } } = {
  'Ottawa Citizen': { image: require('../assets/news/ottawa-citizen.png'), size: 88 },
  'Capital Current': { image: require('../assets/news/capital-current.png'), size: 78 },
  'CBC Ottawa': { image: require('../assets/news/cbc.png'), size: 88 },
  'Ottawa Sun': { image: require('../assets/news/ottawa-sun.png'), size: 100 },
  'Apt613': { image: require('../assets/news/apt613.png'), size: 78 },
  'Lowertown Echo': { image: require('../assets/news/lowertown-echo.png'), size: 88 },
  'Kitchissippi Times': { image: require('../assets/news/kitchissippi-times.png'), size: 100 },
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
