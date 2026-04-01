/**
 * Delay context engine — surfaces the most likely reason a bus is late
 * using data already available in the app (alerts, weather, events).
 */

export interface DelayContext {
  reason: 'alert' | 'weather' | 'event' | 'construction' | 'unknown';
  label: string;
  labelFr: string;
  detail: string;
  detailFr: string;
  icon: string;
  colour: string;
}

type AlertLike = { routes?: string[]; title?: string; description?: string; category?: string };
type WeatherLike = { temp: number; condition: string; icon: string } | null;
type ForecastHour = { precip: number };

// Routes that serve downtown / CTC area and are affected by Sens game traffic
const DOWNTOWN_ROUTES = new Set(['1','2','4','6','7','10','11','12','14','39','44','57','61','62','63','85','95','97','98','99','101','104','106','111']);

const CONSTRUCTION_KEYWORDS = /construction|detour|closure|road work|travaux|fermeture|déviation/i;

export function getDelayContext(
  routeId: string,
  delayMinutes: number,
  alerts: AlertLike[],
  weather: WeatherLike,
  forecast: ForecastHour[],
  sensGameTonight?: boolean,
): DelayContext | null {
  if (delayMinutes <= 5) return null;

  // 1. ALERT — active alert mentioning this route
  const routeAlert = alerts.find(a =>
    a.routes?.includes(routeId) &&
    a.category !== 'accessibility'
  );
  if (routeAlert) {
    return {
      reason: 'alert',
      label: `Service alert on Route ${routeId}`,
      labelFr: `Alerte de service sur la ligne ${routeId}`,
      detail: routeAlert.title || routeAlert.description || 'Active service alert affecting this route',
      detailFr: routeAlert.title || routeAlert.description || 'Alerte de service active affectant cette ligne',
      icon: 'warning-outline',
      colour: '#CE1126',
    };
  }

  // 2. WEATHER — extreme cold or precipitation
  if (weather) {
    if (weather.temp <= -15) {
      return {
        reason: 'weather',
        label: 'Extreme cold affecting service',
        labelFr: 'Froid extrême affectant le service',
        detail: `Current temperature: ${weather.temp}°C. Buses run slower in extreme cold due to mechanical strain and slower boarding.`,
        detailFr: `Température actuelle : ${weather.temp}°C. Les autobus roulent plus lentement par froid extrême en raison du stress mécanique et de l'embarquement plus lent.`,
        icon: 'snow-outline',
        colour: '#4A90D9',
      };
    }
    const highPrecip = forecast.length > 0 && forecast.slice(0, 3).some(h => h.precip > 60);
    if (highPrecip && (weather.condition.includes('Snow') || weather.condition.includes('Rain') || weather.condition.includes('Drizzle'))) {
      return {
        reason: 'weather',
        label: 'Weather affecting service',
        labelFr: 'Météo affectant le service',
        detail: `${weather.condition} with high precipitation. Roads are slippery or congested, causing delays across the network.`,
        detailFr: `${weather.condition} avec fortes précipitations. Les routes sont glissantes ou encombrées, causant des retards sur le réseau.`,
        icon: weather.condition.includes('Snow') ? 'snow-outline' : 'rainy-outline',
        colour: '#4A90D9',
      };
    }
  }

  // 3. EVENT — Sens home game + route serves downtown/CTC area
  if (DOWNTOWN_ROUTES.has(routeId) && sensGameTonight) {
    return {
      reason: 'event',
      label: 'Sens game traffic near downtown',
      labelFr: 'Circulation match des Sens au centre-ville',
      detail: 'Ottawa Senators home game at Canadian Tire Centre. Routes through downtown and the CTC area experience heavier traffic before and after games.',
      detailFr: 'Match local des Sénateurs d\'Ottawa au Centre Canadian Tire. Les lignes passant par le centre-ville et la zone du CTC subissent un trafic plus dense avant et après les matchs.',
      icon: 'american-football-outline',
      colour: '#CE1126',
    };
  }

  // 4. CONSTRUCTION — keyword scan alerts for construction/detour
  const constructionAlert = alerts.find(a => {
    const text = `${a.title || ''} ${a.description || ''}`;
    return CONSTRUCTION_KEYWORDS.test(text);
  });
  if (constructionAlert) {
    return {
      reason: 'construction',
      label: 'Construction detour in effect',
      labelFr: 'Détour de construction en vigueur',
      detail: constructionAlert.title || constructionAlert.description || 'Active construction or detour affecting nearby routes.',
      detailFr: constructionAlert.title || constructionAlert.description || 'Construction ou détour actif affectant les lignes à proximité.',
      icon: 'construct-outline',
      colour: '#F5A623',
    };
  }

  // 5. UNKNOWN — only for significant delays
  if (delayMinutes > 10) {
    return {
      reason: 'unknown',
      label: 'Longer delays than usual',
      labelFr: 'Retards plus longs que d\'habitude',
      detail: `This bus is ${delayMinutes} minutes behind schedule. No specific cause identified — could be traffic, operator shortage, or mechanical issue.`,
      detailFr: `Ce bus a ${delayMinutes} minutes de retard. Aucune cause spécifique identifiée — possiblement la circulation, un manque d'opérateurs ou un problème mécanique.`,
      icon: 'time-outline',
      colour: '#888',
    };
  }

  return null;
}
