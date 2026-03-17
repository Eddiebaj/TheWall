/**
 * Class schedule data model and helpers.
 */

export type ClassDay = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export const ALL_DAYS: ClassDay[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const DAY_LABELS_FR: Record<ClassDay, string> = {
  Mon: 'Lun', Tue: 'Mar', Wed: 'Mer', Thu: 'Jeu', Fri: 'Ven', Sat: 'Sam', Sun: 'Dim',
};

export type ClassEntry = {
  id: string;
  name: string;
  room: string;
  days: ClassDay[];
  startTime: string; // 'HH:MM' 24h
  endTime: string;   // 'HH:MM' 24h
  colour: string;
};

export type ClassSchedule = {
  classes: ClassEntry[];
  commuteMins: number; // user-set commute duration
};

const CLASS_COLOURS = [
  '#CE1126', '#1a6fbf', '#2d7a3a', '#8b5a00', '#6b3fa0',
  '#d4531a', '#00838f', '#c2185b', '#4a148c', '#006064',
];

let colourIndex = 0;
export function nextClassColour(): string {
  const c = CLASS_COLOURS[colourIndex % CLASS_COLOURS.length];
  colourIndex++;
  return c;
}

export function resetColourIndex(): void {
  colourIndex = 0;
}

/** Parse 'HH:MM' to minutes since midnight */
export function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Format 'HH:MM' 24h to 12h display */
export function fmt12h(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Get JS day index (0=Sun) from ClassDay */
function jsDayIndex(day: ClassDay): number {
  return ALL_DAYS.indexOf(day) === 6 ? 0 : ALL_DAYS.indexOf(day) + 1;
}

/** Get today's ClassDay or null if not in ALL_DAYS */
export function todayClassDay(): ClassDay | null {
  const jsDay = new Date().getDay(); // 0=Sun
  if (jsDay === 0) return 'Sun';
  return ALL_DAYS[jsDay - 1];
}

/** Get classes for a given day, sorted by start time */
export function classesForDay(schedule: ClassSchedule, day: ClassDay): ClassEntry[] {
  return schedule.classes
    .filter(c => c.days.includes(day))
    .sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
}

/** Get today's remaining classes (not yet ended) */
export function todayRemainingClasses(schedule: ClassSchedule): ClassEntry[] {
  const day = todayClassDay();
  if (!day) return [];
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return classesForDay(schedule, day).filter(c => parseTime(c.endTime) > nowMins);
}

/** Get the next upcoming class (today or future) */
export function nextClass(schedule: ClassSchedule): { entry: ClassEntry; day: ClassDay; minsUntilLeave: number } | null {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const today = todayClassDay();

  // Check today first
  if (today) {
    const todayClasses = classesForDay(schedule, today);
    for (const c of todayClasses) {
      const startMins = parseTime(c.startTime);
      const leaveAt = startMins - schedule.commuteMins;
      if (leaveAt > nowMins) {
        return { entry: c, day: today, minsUntilLeave: leaveAt - nowMins };
      }
      // Class hasn't ended yet — show it even if leave time passed
      if (parseTime(c.endTime) > nowMins) {
        return { entry: c, day: today, minsUntilLeave: 0 };
      }
    }
  }

  // Check upcoming days (up to 7 days ahead)
  const jsToday = now.getDay();
  for (let offset = 1; offset <= 7; offset++) {
    const jsDay = (jsToday + offset) % 7;
    const classDay = jsDay === 0 ? 'Sun' : ALL_DAYS[jsDay - 1];
    const dayClasses = classesForDay(schedule, classDay);
    if (dayClasses.length > 0) {
      const first = dayClasses[0];
      const startMins = parseTime(first.startTime);
      const leaveAt = startMins - schedule.commuteMins;
      // Minutes until that day + time
      const minsUntilMidnight = 1440 - nowMins;
      const fullDaysBetween = offset - 1;
      const totalMins = minsUntilMidnight + fullDaysBetween * 1440 + leaveAt;
      return { entry: first, day: classDay, minsUntilLeave: totalMins };
    }
  }

  return null;
}

/** Generate a unique ID */
export function genClassId(): string {
  return `cls_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
