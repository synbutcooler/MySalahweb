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
  | 'MWL'
  | 'Egyptian'
  | 'Karachi'
  | 'UmmAlQura'
  | 'Dubai'
  | 'Qatar'
  | 'Kuwait'
  | 'MoonsightingCommittee'
  | 'Singapore'
  | 'Turkey'
  | 'Tehran'
  | 'ISNA';

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

export interface CalcOptions {
  lat: number;
  lng: number;
  date: Date;
  method: MethodKey;
  madhab: 'shafi' | 'hanafi';
  elevation?: number;
}

export interface PrayerTimeResult {
  name: PrayerName;
  label: string;
  time: Date;
  displayTime: string;
  isPast: boolean;
  isCurrent: boolean;
  isNext: boolean;
  elevationOffset: number;
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
  const times: { name: PrayerName; time: Date; elevationOffset: number }[] = [
    { name: 'fajr', time: prayerTimes.fajr, elevationOffset: 0 },
    { name: 'sunrise', time: prayerTimes.sunrise, elevationOffset: elevOffsets.sunrise },
    { name: 'dhuhr', time: prayerTimes.dhuhr, elevationOffset: 0 },
    { name: 'asr', time: prayerTimes.asr, elevationOffset: 0 },
    { name: 'maghrib', time: prayerTimes.maghrib, elevationOffset: elevOffsets.maghrib },
    { name: 'isha', time: prayerTimes.isha, elevationOffset: 0 },
  ];

  times.forEach(t => {
    if (t.elevationOffset !== 0) {
      t.time = new Date(t.time.getTime() + t.elevationOffset * 60000);
    }
  });

  let nextIdx = times.findIndex(t => t.time > now);
  if (nextIdx === -1) nextIdx = 0;
  const currentIdx = nextIdx > 0 ? nextIdx - 1 : null;

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const results: PrayerTimeResult[] = times.map((t, i) => ({
    name: t.name,
    label: PRAYER_LABELS[t.name],
    time: t.time,
    displayTime: formatTime(t.time),
    isPast: t.time <= now && i !== currentIdx,
    isCurrent: i === currentIdx,
    isNext: i === nextIdx,
    elevationOffset: Math.round(t.elevationOffset),
  }));

  const nextTime = times[nextIdx].time;
  const diff = Math.max(0, nextTime.getTime() - now.getTime());
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  let progressPercent = 0;
  if (currentIdx !== null) {
    const currentTime = times[currentIdx].time;
    const totalDuration = nextTime.getTime() - currentTime.getTime();
    const elapsed = now.getTime() - currentTime.getTime();
    progressPercent = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
  }

  const qibla = calculateQibla(lat, lng);

  return {
    times: results,
    nextPrayer: times[nextIdx].name,
    currentPrayer: currentIdx !== null ? times[currentIdx].name : null,
    countdown: { hours, minutes, seconds },
    progressPercent,
    qibla,
    sunnahTimes: {
      middleOfTheNight: sunnahTimes.middleOfTheNight,
      lastThirdOfTheNight: sunnahTimes.lastThirdOfTheNight,
    },
  };
}

function calculateQibla(lat: number, lng: number): number {
  const kaabaLat = 21.4225;
  const kaabaLng = 39.8262;
  const latRad = lat * Math.PI / 180;
  const kaabaLatRad = kaabaLat * Math.PI / 180;
  const kaabaLngRad = kaabaLng * Math.PI / 180;
  const lngRad = lng * Math.PI / 180;
  const x = Math.sin(kaabaLngRad - lngRad);
  const y = Math.cos(latRad) * Math.tan(kaabaLatRad) - Math.sin(latRad) * Math.cos(kaabaLngRad - lngRad);
  let qibla = Math.atan2(x, y) * 180 / Math.PI;
  if (qibla < 0) qibla += 360;
  return Math.round(qibla * 10) / 10;
}

export async function fetchElevation(lat: number, lng: number): Promise<number> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`
    );
    const data = await res.json();
    return data.elevation?.[0] ?? 0;
  } catch {
    return 0;
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'User-Agent': 'PrayerTimesApp/1.0' } }
    );
    const data = await res.json();
    return (
      data.address?.city ||
      data.address?.town ||
      data.address?.village ||
      data.address?.municipality ||
      data.address?.county ||
      'Unknown'
    );
  } catch {
    return 'Unknown';
  }
}

export async function searchCities(query: string): Promise<{ name: string; lat: number; lng: number; country: string }[]> {
  if (query.length < 2) return [];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=8&addressdetails=1`,
      { headers: { 'User-Agent': 'PrayerTimesApp/1.0' } }
    );
    const data = await res.json();
    return data.map((item: { display_name: string; lat: string; lon: string; address?: { country?: string } }) => ({
      name: item.display_name.split(',')[0],
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      country: item.address?.country || '',
    }));
  } catch {
    return [];
  }
}
