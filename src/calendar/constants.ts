
// Links: Platz für Uhrzeiten — etwas kleiner für mehr Platz bei Events
export const LEFT_GUTTER = 64;
export const HOURS_START = 0;
export const HOURS_END = 24;
export const HOUR_HEIGHT = 64;

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}