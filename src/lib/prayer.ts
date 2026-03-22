import {
  PrayerTimes,
  CalculationMethod,
  Coordinates,
  CalculationParameters,
  Madhab,
  SunnahTimes,
} from 'adhan';

export type PrayerName = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

export const PRAYER_NAMES: PrayerName[] = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

export const PRAYER_LABELS: Record<PrayerName, string> = {
  fajr: 'Fajr',
  sunrise: 'Sunrise',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha',
};

export type MethodKey =
  | 'MWL' | 'Egyptian' | 'Karachi' | 'UmmAlQura' | 'Dubai'
  | 'Qatar' | 'Kuwait' | 'MoonsightingCommittee' | 'Singapore'
  | 'Turkey' | 'Tehran' | 'ISNA';

export const METHOD_NAMES: Record<MethodKey, string> = {
  MWL: 'Muslim World League',
  Egyptian: 'Egyptian',
  Karachi: 'Karachi',
  UmmAlQura: 'Umm Al-Qura',
  Dubai: 'Dubai',
  Qatar: 'Qatar',
  Kuwait: 'Kuwait',
  MoonsightingCommittee: 'Moonsighting Committee',
  Singapore: 'Singapore',
  Turkey: 'Turkey',
  Tehran: 'Tehran',
  ISNA: 'ISNA',
};

function getBaseParams(method: MethodKey): CalculationParameters {
  switch (method) {
    case 'MWL': return CalculationMethod.MuslimWorldLeague();
    case 'Egyptian': return CalculationMethod.Egyptian();
    case 'Karachi': return CalculationMethod.Karachi();
    case 'UmmAlQura': return CalculationMethod.UmmAlQura();
    case 'Dubai': return CalculationMethod.Dubai();
    case 'Qatar': return CalculationMethod.Qatar();
    case 'Kuwait': return CalculationMethod.Kuwait();
    case 'MoonsightingCommittee': return CalculationMethod.MoonsightingCommittee();
    case 'Singapore': return CalculationMethod.Singapore();
    case 'Turkey': return CalculationMethod.Turkey();
    case 'Tehran': return CalculationMethod.Tehran();
    case 'ISNA': return CalculationMethod.NorthAmerica();
    default: return CalculationMethod.MuslimWorldLeague();
  }
}

export function autoSelectMethod(lat: number, lng: number): MethodKey {
  if (lat >= 15 && lat <= 35 && lng >= 35 && lng <= 60) {
    if (lng >= 44 && lng <= 50) return 'Kuwait';
    if (lat >= 21 && lat <= 26 && lng >= 38 && lng <= 48) return 'UmmAlQura';
    return 'Dubai';
  }
  if (lat >= 36 && lat <= 42 && lng >= 26 && lng <= 45) return 'Turkey';
  if (lat >= 25 && lat <= 40 && lng >= 44 && lng <= 64) return 'Tehran';
  if (lat >= 5 && lat <= 40 && lng >= 60 && lng <= 95) return 'Karachi';
  if (lat >= -10 && lat <= 20 && lng >= 95 && lng <= 140) return 'Singapore';
  if (lat >= 15 && lat <= 38 && lng >= -20 && lng <= 35) return 'Egyptian';
  if (lat >= 15 && lat <= 75 && lng >= -170 && lng <= -50) return 'ISNA';
  return 'MWL';
}

function getAdaptiveIshaAngle(baseAngle: number, latitude: number): number {
  const absLat = Math.abs(latitude);
  if (absLat <= 40) return baseAngle;
  if (absLat >= 55) return 14;
  const t = (absLat - 40) / 15;
  return baseAngle - (baseAngle - 14) * t;
}

function getAdaptiveFajrAngle(baseAngle: number, latitude: number): number {
  const absLat = Math.abs(latitude);
  if (absLat <= 45) return baseAngle;
  if (absLat >= 60) return 15;
  const t = (absLat - 45) / 15;
  return baseAngle - (baseAngle - 15) * t;
}

function getElevationOffset(elevation: number, latitude: number): { sunrise: number; maghrib: number } {
  if (elevation <= 0) return { sunrise: 0, maghrib: 0 };
  const R = 6371000;
  const dipAngle = Math.sqrt(2 * elevation / R) * (180 / Math.PI);
  const latRad = Math.abs(latitude) * Math.PI / 180;
  const cosLat = Math.cos(latRad);
  const hourAngleRate = 0.25 * cosLat;
  const offsetMinutes = dipAngle / hourAngleRate;
  const capped = Math.min(Math.max(offsetMinutes, 0), 10);
  return { sunrise: -capped, maghrib: capped };
}

export interface PrayerTimeResult {
  name: PrayerName;
  label: string;
  time: Date;
  displayTime: string;
  isPast: boolean;
  isCurrent: boolean;
  isNext: boolean;
}

export interface CalcResult {
  times: PrayerTimeResult[];
  nextPrayer: PrayerName;
  currentPrayer: PrayerName | null;
  countdown: { hours: number; minutes: number; seconds: number };
  progressPercent: number;
  qibla: number;
  sunnahTimes: {
    middleOfTheNight: Date;
    lastThirdOfTheNight: Date;
  };
}

export interface CalcOptions {
  lat: number;
  lng: number;
  date: Date;
  method: MethodKey;
  madhab: 'shafi' | 'hanafi';
  elevation?: number;
}

export function calcPrayerTimes(options: CalcOptions): CalcResult {
  const { lat, lng, date, method, madhab, elevation = 0 } = options;

  const coords = new Coordinates(lat, lng);
  const params = getBaseParams(method);
  params.madhab = madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  params.fajrAngle = getAdaptiveFajrAngle(params.fajrAngle, lat);
  params.ishaAngle = getAdaptiveIshaAngle(params.ishaAngle, lat);

  const prayerTimes = new PrayerTimes(coords, date, params);
  const sunnahTimes = new SunnahTimes(prayerTimes);
  const elevOffsets = getElevationOffset(elevation, lat);

  const now = new Date();

  const rawTimes: { name: PrayerName; time: Date }[] = [
    { name: 'fajr', time: prayerTimes.fajr },
    { name: 'sunrise', time: new Date(prayerTimes.sunrise.getTime() + elevOffsets.sunrise * 60000) },
    { name: 'dhuhr', time: prayerTimes.dhuhr },
    { name: 'asr', time: prayerTimes.asr },
    { name: 'maghrib', time: new Date(prayerTimes.maghrib.getTime() + elevOffsets.maghrib * 60000) },
    { name: 'isha', time: prayerTimes.isha },
  ];

  // Find next prayer — if all passed, next is tomorrow's Fajr
  let nextIdx = rawTimes.findIndex(t => t.time > now);
  let allPassed = false;
  let nextPrayerTime: Date;

  if (nextIdx === -1) {
    allPassed = true;
    nextIdx = 0;
    const tomorrow = new Date(date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowParams = getBaseParams(method);
    tomorrowParams.madhab = madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
    tomorrowParams.fajrAngle = getAdaptiveFajrAngle(tomorrowParams.fajrAngle, lat);
    tomorrowParams.ishaAngle = getAdaptiveIshaAngle(tomorrowParams.ishaAngle, lat);
    const tomorrowPrayers = new PrayerTimes(coords, tomorrow, tomorrowParams);
    nextPrayerTime = tomorrowPrayers.fajr;
  } else {
    nextPrayerTime = rawTimes[nextIdx].time;
  }

  // Current prayer: the one before next, or Isha if all passed
  const currentIdx = allPassed
    ? rawTimes.length - 1
    : nextIdx > 0 ? nextIdx - 1 : null;

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const times: PrayerTimeResult[] = rawTimes.map((t, i) => ({
    name: t.name,
    label: PRAYER_LABELS[t.name],
    time: t.time,
    displayTime: formatTime(t.time),
    isPast: allPassed ? i !== currentIdx : (t.time <= now && i !== currentIdx),
    isCurrent: i === currentIdx,
    isNext: allPassed ? false : i === nextIdx,
  }));

  // Countdown
  const diff = Math.max(0, nextPrayerTime.getTime() - now.getTime());
  const totalSecs = Math.floor(diff / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;

  // Progress
  let progressPercent = 0;
  if (currentIdx !== null) {
    const currentTime = rawTimes[currentIdx].time;
    const total = nextPrayerTime.getTime() - currentTime.getTime();
    const elapsed = now.getTime() - currentTime.getTime();
    if (total > 0) progressPercent = Math.min(100, Math.max(0, (elapsed / total) * 100));
  }

  return {
    times,
    nextPrayer: rawTimes[nextIdx].name,
    currentPrayer: currentIdx !== null ? rawTimes[currentIdx].name : null,
    countdown: { hours, minutes, seconds },
    progressPercent,
    qibla: calculateQibla(lat, lng),
    sunnahTimes: {
      middleOfTheNight: sunnahTimes.middleOfTheNight,
      lastThirdOfTheNight: sunnahTimes.lastThirdOfTheNight,
    },
  };
}

function calculateQibla(lat: number, lng: number): number {
  const kaabaLat = 21.4225, kaabaLng = 39.8262;
  const latRad = lat * Math.PI / 180;
  const kaabaLatRad = kaabaLat * Math.PI / 180;
  const dLng = (kaabaLng - lng) * Math.PI / 180;
  const x = Math.sin(dLng);
  const y = Math.cos(latRad) * Math.tan(kaabaLatRad) - Math.sin(latRad) * Math.cos(dLng);
  let q = Math.atan2(x, y) * 180 / Math.PI;
  if (q < 0) q += 360;
  return Math.round(q * 10) / 10;
}

export async function fetchElevation(lat: number, lng: number): Promise<number> {
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`);
    const d = await r.json();
    return d.elevation?.[0] ?? 0;
  } catch { return 0; }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'User-Agent': 'PrayerTimesApp/1.0' } }
    );
    const d = await r.json();
    return d.address?.city || d.address?.town || d.address?.village
      || d.address?.municipality || d.address?.county || 'Unknown';
  } catch { return 'Unknown'; }
}

export async function searchCities(query: string): Promise<{ name: string; lat: number; lng: number; country: string }[]> {
  if (query.length < 2) return [];
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&addressdetails=1`,
      { headers: { 'User-Agent': 'PrayerTimesApp/1.0' } }
    );
    const d = await r.json();
    return d.map((i: { display_name: string; lat: string; lon: string; address?: { country?: string } }) => ({
      name: i.display_name.split(',')[0],
      lat: parseFloat(i.lat),
      lng: parseFloat(i.lon),
      country: i.address?.country || '',
    }));
  } catch { return []; }
}
