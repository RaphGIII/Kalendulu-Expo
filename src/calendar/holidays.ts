import dayjs from 'dayjs';

import type { HolidayCountryCode } from '../settings/appSettings';

function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return dayjs(new Date(year, month - 1, day));
}

function nthWeekdayOfMonth(year: number, monthIndex: number, weekday: number, n: number) {
  let date = dayjs(new Date(year, monthIndex, 1));
  while (date.day() !== weekday) date = date.add(1, 'day');
  return date.add(n - 1, 'week');
}

function lastWeekdayOfMonth(year: number, monthIndex: number, weekday: number) {
  let date = dayjs(new Date(year, monthIndex + 1, 0));
  while (date.day() !== weekday) date = date.subtract(1, 'day');
  return date;
}

export function getHolidayName(date: dayjs.Dayjs, country: HolidayCountryCode) {
  const year = date.year();
  const easter = easterSunday(year);
  const fixed: Record<string, string> = {};
  const add = (month: number, day: number, name: string) => {
    fixed[`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`] = name;
  };
  const addDate = (value: dayjs.Dayjs, name: string) => {
    fixed[value.format('YYYY-MM-DD')] = name;
  };

  add(1, 1, 'Neujahr');

  if (['AT', 'DE', 'CH', 'FR', 'IT', 'ES', 'NL', 'BE', 'PL', 'CZ', 'SK', 'HU'].includes(country)) {
    addDate(easter, 'Ostersonntag');
    addDate(easter.add(1, 'day'), 'Ostermontag');
    addDate(easter.add(39, 'day'), 'Christi Himmelfahrt');
    addDate(easter.add(49, 'day'), 'Pfingstsonntag');
    addDate(easter.add(50, 'day'), 'Pfingstmontag');
    add(12, 25, 'Weihnachten');
    add(12, 26, 'Stefanitag');
  }

  if (country === 'AT') {
    add(1, 6, 'Heilige Drei Könige');
    add(5, 1, 'Staatsfeiertag');
    addDate(easter.add(60, 'day'), 'Fronleichnam');
    add(8, 15, 'Mariä Himmelfahrt');
    add(10, 26, 'Nationalfeiertag');
    add(11, 1, 'Allerheiligen');
    add(12, 8, 'Mariä Empfängnis');
  } else if (country === 'DE') {
    add(5, 1, 'Tag der Arbeit');
    add(10, 3, 'Tag der Deutschen Einheit');
  } else if (country === 'CH') {
    add(8, 1, 'Bundesfeier');
  } else if (country === 'US') {
    addDate(nthWeekdayOfMonth(year, 0, 1, 3), 'Martin Luther King Jr. Day');
    addDate(lastWeekdayOfMonth(year, 4, 1), 'Memorial Day');
    add(7, 4, 'Independence Day');
    addDate(nthWeekdayOfMonth(year, 8, 1, 1), 'Labor Day');
    addDate(nthWeekdayOfMonth(year, 10, 4, 4), 'Thanksgiving');
    add(12, 25, 'Christmas Day');
  } else if (country === 'GB') {
    addDate(easter.add(1, 'day'), 'Easter Monday');
    addDate(nthWeekdayOfMonth(year, 4, 1, 1), 'Early May Bank Holiday');
    addDate(lastWeekdayOfMonth(year, 4, 1), 'Spring Bank Holiday');
    addDate(lastWeekdayOfMonth(year, 7, 1), 'Summer Bank Holiday');
    add(12, 25, 'Christmas Day');
    add(12, 26, 'Boxing Day');
  } else if (country === 'FR') {
    add(5, 1, 'Fête du Travail');
    add(7, 14, 'Fête nationale');
    add(11, 11, 'Armistice');
  } else if (country === 'IT') {
    add(4, 25, 'Festa della Liberazione');
    add(5, 1, 'Festa del Lavoro');
    add(6, 2, 'Festa della Repubblica');
  } else if (country === 'ES') {
    add(1, 6, 'Reyes');
    add(5, 1, 'Día del Trabajador');
    add(10, 12, 'Fiesta Nacional');
    add(12, 6, 'Constitución');
  } else if (country === 'TR') {
    add(4, 23, 'Ulusal Egemenlik');
    add(5, 1, 'Emek ve Dayanışma');
    add(5, 19, 'Atatürk Anma');
    add(8, 30, 'Zafer Bayramı');
    add(10, 29, 'Cumhuriyet Bayramı');
  } else if (country === 'CA') {
    add(7, 1, 'Canada Day');
    addDate(nthWeekdayOfMonth(year, 8, 1, 1), 'Labour Day');
    addDate(nthWeekdayOfMonth(year, 9, 1, 2), 'Thanksgiving');
    add(12, 25, 'Christmas Day');
  } else if (country === 'AU') {
    add(1, 26, 'Australia Day');
    add(4, 25, 'Anzac Day');
    addDate(nthWeekdayOfMonth(year, 5, 1, 2), "King's Birthday");
    add(12, 25, 'Christmas Day');
    add(12, 26, 'Boxing Day');
  }

  return fixed[date.format('YYYY-MM-DD')] ?? null;
}
