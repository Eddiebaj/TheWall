import { useEffect, useRef, useState } from 'react';

export type CountdownDisplay = {
  text: string;
  textFr: string;
  isArriving: boolean;  // < 30s
  isUrgent: boolean;    // < 2 min
};

/**
 * Takes a minsAway value and the timestamp when it was fetched,
 * returns a live-updating countdown string that ticks every second.
 */
export function computeCountdown(
  minsAway: number,
  fetchedAt: number,
): CountdownDisplay {
  const elapsed = Date.now() - fetchedAt;
  const totalSecsRemaining = Math.max(0, minsAway * 60 - Math.floor(elapsed / 1000));

  if (totalSecsRemaining <= 0) {
    return { text: 'Due', textFr: '\u00C0 l\u2019arr\u00EAt', isArriving: true, isUrgent: true };
  }

  if (totalSecsRemaining < 30) {
    return { text: 'Arriving', textFr: 'En approche', isArriving: true, isUrgent: true };
  }

  const mins = Math.floor(totalSecsRemaining / 60);
  const secs = totalSecsRemaining % 60;

  if (mins < 2) {
    // Show seconds: "1m 42s" or "58s"
    const text = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    return { text, textFr: text, isArriving: false, isUrgent: true };
  }

  // > 2 min — show minutes only, update every minute
  return { text: `${mins}m`, textFr: `${mins}m`, isArriving: false, isUrgent: false };
}

/**
 * Hook that returns live countdown displays for an array of arrivals.
 * Re-renders every second when any arrival is < 2 min away, otherwise every 15s.
 */
export function useLiveCountdown(
  arrivals: { minsAway: number }[],
  fetchedAt: number,
): CountdownDisplay[] {
  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasUrgent = useRef(false);

  useEffect(() => {
    if (!fetchedAt || arrivals.length === 0) return;

    const update = () => {
      // Check if any arrival is urgent (< 2 min)
      const now = Date.now();
      const anyUrgent = arrivals.some(a => {
        const remaining = a.minsAway * 60 - Math.floor((now - fetchedAt) / 1000);
        return remaining < 120 && remaining > 0;
      });

      // Switch interval based on urgency
      if (anyUrgent !== hasUrgent.current) {
        hasUrgent.current = anyUrgent;
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => setTick(t => t + 1), anyUrgent ? 1000 : 15000);
      }

      setTick(t => t + 1);
    };

    // Start with 1s interval, will adjust
    hasUrgent.current = true;
    intervalRef.current = setInterval(update, 1000);
    update();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchedAt, arrivals]);

  // Compute displays (tick is in deps to trigger re-render)
  void tick;
  return arrivals.map(a => computeCountdown(a.minsAway, fetchedAt));
}
