// ============================================================
// Full prayer time calculation engine with elevation support
// ============================================================

export type PrayerName = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

export type MethodKey =
  | 'MWL'
  | 'ISNA'
  | 'Egypt'
  | 'Makkah'
  | 'Karachi'
  | 'Tehran'
  | 'Jafari'
  | 'Turkey'
  | 'France'
  | 'Russia'
  | 'Singapore'
  | 'UOIF';

export interface MethodParams {
  fajrAngle: number;
  ishaAngle: number;
  ishaMinutes?: number;
  maghribAngle?: number;
  midnight?: 'standard' | 'jafari';
}

export const METHODS: Record<MethodKey, MethodParams> = {
  MWL:       { fajrAngle: 18,   ishaAngle: 17 },
  ISNA:      { fajrAngle: 15,   ishaAngle: 15 },
  Egypt:     { fajrAngle: 19.5, ishaAngle: 17.5 },
  Makkah:    { fajrAngle: 18.5, ishaAngle: 0, ishaMinutes: 90 },
  Karachi:   { fajrAngle: 18,   ishaAngle: 18 },
  Tehran:    { fajrAngle: 17.7, ishaAngle: 14, maghribAngle: 4.5, midnight: 'jafari' },
  Jafari:    { fajrAngle: 16,   ishaAngle: 14, maghribAngle: 4, midnight: 'jafari' },
  Turkey:    { fajrAngle: 18,   ishaAngle: 17 },
  France:    { fajrAngle: 12,   ishaAngle: 12 },
  Russia:    { fajrAngle: 16,   ishaAngle: 15 },
  Singapore: { fajrAngle: 20,   ishaAngle: 18 },
  UOIF:      { fajrAngle: 12,   ishaAngle: 12 },
};

export const METHOD_NAMES: Record<MethodKey, string> = {
  MWL: 'Muslim World League',
  ISNA: 'ISNA',
  Egypt: 'Egyptian Authority',
  Makkah: 'Umm al-Qura',
  Karachi: 'Karachi',
  Tehran: 'Tehran',
  Jafari: 'Jafari',
  Turkey: 'Diyanet (Turkey)',
  France: 'France / UOIF',
  Russia: 'Russia',
  Singapore: 'Singapore',
  UOIF: 'UOIF (12°)',
};

export const PRAYER_LABELS: Record<PrayerName, string> = {
  fajr: 'Fajr',
  sunrise: 'Sunrise',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha',
};

// ---- Math helpers ----

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

function sin(d: number) { return Math.sin(d * DEG); }
function cos(d: number) { return Math.cos(d * DEG); }
function tan(d: number) { return Math.tan(d * DEG); }
function arcsin(x: number) { return Math.asin(x) * RAD; }
function arccos(x: number) { return Math.acos(x) * RAD; }
function arctan2(y: number, x: number) { return Math.atan2(y, x) * RAD; }
function fixHour(h: number) { return ((h % 24) + 24) % 24; }

// ---- Julian date ----

function julianDate(year: number, month: number, day: number): number {
  if (month <= 2) { year -= 1; month += 12; }
  const A = Math.floor(year / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5;
}

// ---- Solar position ----

function sunPosition(jd: number) {
  const D = jd - 2451545.0;
  const g = (357.529 + 0.98560028 * D) % 360;
  const q = (280.459 + 0.98564736 * D) % 360;
  const L = (q + 1.915 * sin(g) + 0.020 * sin(2 * g)) % 360;
  const e = 23.439 - 0.00000036 * D;
  const RA = arctan2(cos(e) * sin(L), cos(L)) / 15;
  const d = arcsin(sin(e) * sin(L));
  const EqT = q / 15 - fixHour(RA);
  return { declination: d, equation: EqT };
}

// ---- Elevation adjustment ----
// Higher elevation = can see sun earlier/later
// Returns adjustment in degrees for the sun angle

function elevationAdjustment(elevation: number): number {
  if (elevation <= 0) return 0;
  // Standard atmospheric refraction formula
  // angle = 0.0347 * sqrt(elevation) degrees
  return 0.0347 * Math.sqrt(elevation);
}

// ---- Core hour angle calculation ----

function hourAngle(lat: number, decl: number, angle: number): number {
  const cosHA = (sin(angle) - sin(lat) * sin(decl)) / (cos(lat) * cos(decl));
  if (cosHA < -1 || cosHA > 1) return NaN;
  return arccos(cosHA) / 15;
}

// ---- Asr factor ----

function asrFactor(madhab: 'shafi' | 'hanafi'): number {
  return madhab === 'hanafi' ? 2 : 1;
}

function asrTime(lat: number, decl: number, factor: number): number {
  const delta = arctan2(1, factor + tan(Math.abs(lat - decl)));
  return hourAngle(lat, decl, 90 - delta);
}

// ---- Calculate all prayer times ----

export interface PrayerTimeEntry {
  name: PrayerName;
  label: string;
  time: Date;
  displayTime: string;
  isPast: boolean;
  isCurrent: boolean;
  isNext: boolean;
  elevationOffset: number; // minutes difference caused by elevation
}

export interface CalcResult {
  times: PrayerTimeEntry[];
  nextPrayer: PrayerName;
  currentPrayer: PrayerName | null;
  countdown: { hours: number; minutes: number; seconds: number };
  progressPercent: number;
  qibla: number;
}

interface CalcInput {
  lat: number;
  lng: number;
  date: Date;
  method: MethodKey;
  madhab: 'shafi' | 'hanafi';
  elevation: number;
}

function timeToDate(baseDate: Date, hours: number, tzOffset: number): Date {
  const h = fixHour(hours - tzOffset);
  const totalMs = h * 3600000;
  const d = new Date(baseDate);
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() + totalMs);
}

function formatTime(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes();
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function calcPrayerTimes(input: CalcInput): CalcResult {
  const { lat, lng, date, method, madhab, elevation } = input;
  const params = METHODS[method];

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  const jd = julianDate(year, month, day);
  const tzOffset = -date.getTimezoneOffset() / 60;
  const transit = sunPosition(jd);

  // Solar noon
  const dhuhrTime = 12 + tzOffset - lng / 15 - transit.equation;

  // Sun declination at noon
  const sunNoon = sunPosition(jd + 0.5);
  const decl = sunNoon.declination;

  // Elevation adjustment for horizon-based prayers
  const elevAdj = elevationAdjustment(elevation);
  const sunriseAngle = 0.833 + elevAdj;
  const maghribAngle = params.maghribAngle ? params.maghribAngle + elevAdj : 0.833 + elevAdj;

  // Calculate times without elevation for comparison
  const sunriseAngleFlat = 0.833;
  const maghribAngleFlat = params.maghribAngle ? params.maghribAngle : 0.833;

  // Hour angles
  const fajrHA = hourAngle(lat, decl, -params.fajrAngle);
  const sunriseHA = hourAngle(lat, decl, -sunriseAngle);
  const sunriseHAFlat = hourAngle(lat, decl, -sunriseAngleFlat);
  const asrHA = asrTime(lat, decl, asrFactor(madhab));
  const maghribHA = hourAngle(lat, decl, -maghribAngle);
  const maghribHAFlat = hourAngle(lat, decl, -maghribAngleFlat);

  let ishaHA: number;
  if (params.ishaMinutes) {
    ishaHA = 0; // will use minutes offset
  } else {
    ishaHA = hourAngle(lat, decl, -params.ishaAngle);
  }

  // Raw times (in hours)
  const rawFajr = dhuhrTime - fajrHA;
  const rawSunrise = dhuhrTime - sunriseHA;
  const rawSunriseFlat = dhuhrTime - sunriseHAFlat;
  const rawDhuhr = dhuhrTime + 2 / 60; // add 2 minutes safety
  const rawAsr = dhuhrTime + asrHA;
  const rawMaghrib = dhuhrTime + maghribHA;
  const rawMaghribFlat = dhuhrTime + maghribHAFlat;
  const rawIsha = params.ishaMinutes
    ? rawMaghrib + params.ishaMinutes / 60
    : dhuhrTime + ishaHA;

  // High latitude adjustment for Fajr/Isha
  let adjFajr = rawFajr;
  let adjIsha = rawIsha;

  // If NaN (sun doesn't go below the required angle), use 1/7th night method
  if (isNaN(fajrHA)) {
    const nightDuration = (rawSunrise + 24 - rawMaghrib);
    adjFajr = rawSunrise - nightDuration / 7;
  }
  if (isNaN(ishaHA) && !params.ishaMinutes) {
    const nightDuration = (rawSunrise + 24 - rawMaghrib);
    adjIsha = rawMaghrib + nightDuration / 7;
  }

  // Calculate elevation offsets in minutes
  const sunriseElevOffset = isNaN(rawSunrise) || isNaN(rawSunriseFlat)
    ? 0
    : Math.round((rawSunriseFlat - rawSunrise) * 60);
  const maghribElevOffset = isNaN(rawMaghrib) || isNaN(rawMaghribFlat)
    ? 0
    : Math.round((rawMaghrib - rawMaghribFlat) * 60);

  // Convert to Date objects
  const now = new Date();
  const timesRaw: { name: PrayerName; hours: number; elevationOffset: number }[] = [
    { name: 'fajr', hours: adjFajr, elevationOffset: 0 },
    { name: 'sunrise', hours: rawSunrise, elevationOffset: sunriseElevOffset },
    { name: 'dhuhr', hours: rawDhuhr, elevationOffset: 0 },
    { name: 'asr', hours: rawAsr, elevationOffset: 0 },
    { name: 'maghrib', hours: rawMaghrib, elevationOffset: maghribElevOffset },
    { name: 'isha', hours: adjIsha, elevationOffset: 0 },
  ];

  const prayerDates = timesRaw.map(t => ({
    ...t,
    date: timeToDate(date, t.hours, 0),
  }));

  // Determine next and current prayer
  let nextIdx = prayerDates.findIndex(p => p.date > now);
  if (nextIdx === -1) nextIdx = 0; // all past, next is fajr tomorrow

  const currentIdx = nextIdx > 0 ? nextIdx - 1 : null;

  const times: PrayerTimeEntry[] = prayerDates.map((p, i) => ({
    name: p.name,
    label: PRAYER_LABELS[p.name],
    time: p.date,
    displayTime: formatTime(p.date),
    isPast: i < nextIdx,
    isCurrent: i === currentIdx,
    isNext: i === nextIdx,
    elevationOffset: p.elevationOffset,
  }));

  const nextPrayerName = prayerDates[nextIdx].name;
  const currentPrayerName = currentIdx !== null ? prayerDates[currentIdx].name : null;

  // Countdown
  const nextTime = prayerDates[nextIdx].date;
  let diffMs = nextTime.getTime() - now.getTime();
  if (diffMs < 0) diffMs += 86400000; // wrap to next day

  const totalSecs = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;

  // Progress percent between current and next prayer
  let progressPercent = 0;
  if (currentIdx !== null) {
    const prevTime = prayerDates[currentIdx].date.getTime();
    const nextT = nextTime.getTime();
    const total = nextT - prevTime;
    const elapsed = now.getTime() - prevTime;
    progressPercent = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0;
  }

  // Qibla direction
  const qibla = calcQibla(lat, lng);

  return {
    times,
    nextPrayer: nextPrayerName,
    currentPrayer: currentPrayerName,
    countdown: { hours, minutes, seconds },
    progressPercent,
    qibla,
  };
}

function calcQibla(lat: number, lng: number): number {
  const meccaLat = 21.4225;
  const meccaLng = 39.8262;
  const dLng = meccaLng - lng;
  const q = arctan2(
    sin(dLng),
    cos(lat) * tan(meccaLat) - sin(lat) * cos(dLng)
  );
  return Math.round(((q % 360) + 360) % 360 * 10) / 10;
}

// ---- Auto-select method based on location ----

export function autoSelectMethod(lat: number, lng: number): MethodKey {
  // Turkey
  if (lat >= 36 && lat <= 42 && lng >= 26 && lng <= 45) return 'Turkey';
  // Egypt / North Africa
  if (lat >= 20 && lat <= 35 && lng >= -10 && lng <= 40) return 'Egypt';
  // Saudi Arabia / Gulf
  if (lat >= 15 && lat <= 30 && lng >= 35 && lng <= 60) return 'Makkah';
  // Iran
  if (lat >= 25 && lat <= 40 && lng >= 44 && lng <= 63) return 'Tehran';
  // Pakistan / South Asia
  if (lat >= 20 && lat <= 40 && lng >= 60 && lng <= 80) return 'Karachi';
  // Southeast Asia
  if (lat >= -10 && lat <= 10 && lng >= 95 && lng <= 140) return 'Singapore';
  // Russia
  if (lat >= 45 && lng >= 30 && lng <= 180) return 'Russia';
  // France / Western Europe
  if (lat >= 42 && lat <= 52 && lng >= -5 && lng <= 10) return 'France';
  // North America
  if (lng >= -130 && lng <= -50) return 'ISNA';
  // Balkans / Central-Eastern Europe
  if (lat >= 40 && lat <= 55 && lng >= 10 && lng <= 30) return 'MWL';
  // Default
  return 'MWL';
}

// ---- Geocoding APIs ----

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=en`
    );
    const data = await res.json();
    return data.address?.city || data.address?.town || data.address?.village || data.address?.county || 'Unknown';
  } catch {
    return 'Unknown';
  }
}

export async function fetchElevation(lat: number, lng: number): Promise<number> {
  try {
    const res = await fetch(
      `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lng}`
    );
    const data = await res.json();
    return data.results?.[0]?.elevation ?? 0;
  } catch {
    return 0;
  }
}

export async function searchCities(query: string): Promise<{ name: string; lat: number; lng: number; country: string }[]> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&accept-language=en`
    );
    const data = await res.json();
    return data.map((item: any) => ({
      name: item.display_name.split(',')[0],
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      country: item.display_name.split(',').slice(-1)[0]?.trim() || '',
    }));
  } catch {
    return [];
  }
}
