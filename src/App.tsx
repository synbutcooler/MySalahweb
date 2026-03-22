import { useState, useEffect, useCallback } from 'react';
import {
  calcPrayerTimes,
  autoSelectMethod,
  fetchElevation,
  reverseGeocode,
  searchCities,
  PRAYER_LABELS,
  METHOD_NAMES,
  type MethodKey,
  type CalcResult,
} from './lib/prayer';

interface Settings {
  lat: number;
  lng: number;
  city: string;
  method: MethodKey;
  madhab: 'shafi' | 'hanafi';
  elevation: number;
  theme: 'light' | 'dark';
}

const DEFAULTS: Settings = {
  lat: 21.4225, lng: 39.8262, city: 'Mecca',
  method: 'UmmAlQura', madhab: 'shafi', elevation: 277, theme: 'light',
};

function load(): Settings {
  try {
    const s = localStorage.getItem('pt-cfg');
    if (s) return { ...DEFAULTS, ...JSON.parse(s) };
  } catch {}
  return DEFAULTS;
}
function save(s: Settings) { localStorage.setItem('pt-cfg', JSON.stringify(s)); }

/* ---- Icons ---- */
const IcoPin = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const IcoGear = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const IcoX = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const IcoSun = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="5" strokeWidth={2} />
    <path strokeLinecap="round" strokeWidth={2} d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);
const IcoMoon = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
  </svg>
);
const IcoKaaba = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="1" /></svg>
);

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
function fmtSunnah(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function App() {
  const [cfg, setCfg] = useState<Settings>(load);
  const [data, setData] = useState<CalcResult | null>(null);
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ name: string; lat: number; lng: number; country: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [initializing, setInitializing] = useState(() => !localStorage.getItem('pt-cfg'));

  // Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', cfg.theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content', cfg.theme === 'dark' ? '#111111' : '#ffffff'
    );
  }, [cfg.theme]);

  // Auto-detect location on first visit
  useEffect(() => {
    if (!initializing) return;
    if (!navigator.geolocation) { setInitializing(false); setModal(true); return; }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        try {
          const [city, elevation] = await Promise.all([reverseGeocode(lat, lng), fetchElevation(lat, lng)]);
          const method = autoSelectMethod(lat, lng);
          setCfg(s => ({ ...s, lat, lng, city, elevation, method }));
        } catch {}
        setInitializing(false);
      },
      () => { setInitializing(false); setModal(true); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Calculate prayer times every second
  const calc = useCallback(() => {
    setData(calcPrayerTimes({
      lat: cfg.lat, lng: cfg.lng, date: new Date(),
      method: cfg.method, madhab: cfg.madhab, elevation: cfg.elevation,
    }));
  }, [cfg]);

  useEffect(() => { calc(); const id = setInterval(calc, 1000); return () => clearInterval(id); }, [calc]);
  useEffect(() => { save(cfg); }, [cfg]);

  // Locate
  const locate = async () => {
    if (!navigator.geolocation) { alert('Geolocation not supported.'); return; }
    setBusy(true);
    try {
      const pos = await new Promise<GeolocationPosition>((ok, fail) =>
        navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: true, timeout: 10000 })
      );
      const { latitude: lat, longitude: lng } = pos.coords;
      const [city, elevation] = await Promise.all([reverseGeocode(lat, lng), fetchElevation(lat, lng)]);
      const method = autoSelectMethod(lat, lng);
      setCfg(s => ({ ...s, lat, lng, city, elevation, method }));
    } catch { alert('Could not detect location. Try searching.'); }
    setBusy(false);
  };

  // Search
  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      setResults(await searchCities(q));
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const pick = async (c: { name: string; lat: number; lng: number }) => {
    setBusy(true);
    const elevation = await fetchElevation(c.lat, c.lng);
    const method = autoSelectMethod(c.lat, c.lng);
    setCfg(s => ({ ...s, lat: c.lat, lng: c.lng, city: c.name, elevation, method }));
    setQ(''); setResults([]); setBusy(false); setModal(false);
  };

  // Loading
  if (initializing) {
    return (
      <div className="loading">
        <div className="spinner" />
        <span>Detecting your location…</span>
      </div>
    );
  }
  if (!data) {
    return <div className="loading"><span>Loading…</span></div>;
  }

  const { times, nextPrayer, currentPrayer, countdown, progressPercent, qibla, sunnahTimes } = data;

  return (
    <div className="page">
      {/* Header */}
      <header className="header">
        <span className="header-title">Prayer Times</span>
        <div className="header-right">
          <button className="h-btn" onClick={() => setCfg(s => ({ ...s, theme: s.theme === 'light' ? 'dark' : 'light' }))}>
            {cfg.theme === 'light' ? <IcoMoon /> : <IcoSun />}
          </button>
          <button className="h-btn" onClick={() => setModal(true)}><IcoGear /></button>
        </div>
      </header>

      {/* Location */}
      <div className="loc-bar">
        <div className="loc-info">
          <IcoPin />
          <span className="loc-city">{cfg.city}</span>
          <span className="loc-coords">{Math.round(cfg.elevation)}m</span>
        </div>
        <button className="change-btn" onClick={() => setModal(true)}>Change</button>
      </div>

      {/* Date */}
      <div className="date-row">{fmtDate(new Date())}</div>

      {/* Countdown */}
      <div className="countdown">
        <div className="cd-label">Time remaining until</div>
        <div className="cd-prayer">{PRAYER_LABELS[nextPrayer]}</div>
        <div className="cd-timer">
          <div className="cd-group">
            <span className="cd-num">{String(countdown.hours).padStart(2, '0')}</span>
            <span className="cd-unit">hrs</span>
          </div>
          <span className="cd-sep">:</span>
          <div className="cd-group">
            <span className="cd-num">{String(countdown.minutes).padStart(2, '0')}</span>
            <span className="cd-unit">min</span>
          </div>
          <span className="cd-sep">:</span>
          <div className="cd-group">
            <span className="cd-num">{String(countdown.seconds).padStart(2, '0')}</span>
            <span className="cd-unit">sec</span>
          </div>
        </div>
        <div className="cd-bar">
          <div className="cd-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      {/* Prayer Table */}
      <table className="p-table">
        <tbody>
          {times.map(p => {
            let cls = '';
            if (p.isNext) cls = 'next';
            else if (p.isCurrent) cls = 'current';
            else if (p.isPast) cls = 'past';

            return (
              <tr key={p.name} className={cls}>
                <td>
                  <div className="p-name">
                    <div className={`dot ${p.isNext ? 'd-next' : p.isCurrent ? 'd-current' : 'd-empty'}`} />
                    <span className="p-label">{p.label}</span>
                    {p.isCurrent && <span className="p-tag tag-current">Now</span>}
                    {p.isNext && <span className="p-tag tag-next">Next</span>}
                  </div>
                </td>
                <td>{p.displayTime}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Sunnah */}
      <div className="sunnah">
        <div className="sunnah-item">
          <div className="sunnah-lbl">Middle of Night</div>
          <div className="sunnah-val">{fmtSunnah(sunnahTimes.middleOfTheNight)}</div>
        </div>
        <div className="sunnah-item">
          <div className="sunnah-lbl">Last Third</div>
          <div className="sunnah-val">{fmtSunnah(sunnahTimes.lastThirdOfTheNight)}</div>
        </div>
      </div>

      {/* Footer */}
      <footer className="footer">
        <div className="foot-line">{METHOD_NAMES[cfg.method]} · {cfg.madhab === 'hanafi' ? 'Hanafi' : "Shafi'i"}</div>
        <div className="foot-line"><IcoKaaba /> Qibla: {qibla}° from North</div>
      </footer>

      {/* Settings */}
      {modal && (
        <div className="modal-bg" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-top">
              <h2>Settings</h2>
              <button className="modal-x" onClick={() => setModal(false)}><IcoX /></button>
            </div>
            <div className="modal-body">

              {/* Theme */}
              <div className="field">
                <div className="field-lbl">Theme</div>
                <div className="theme-row">
                  <button className={`theme-btn ${cfg.theme === 'light' ? 'on' : ''}`}
                    onClick={() => setCfg(s => ({ ...s, theme: 'light' }))}><IcoSun /> Light</button>
                  <button className={`theme-btn ${cfg.theme === 'dark' ? 'on' : ''}`}
                    onClick={() => setCfg(s => ({ ...s, theme: 'dark' }))}><IcoMoon /> Dark</button>
                </div>
              </div>

              {/* Location */}
              <div className="field">
                <div className="field-lbl">Location</div>
                <button className="btn-loc" onClick={locate} disabled={busy}>
                  {busy ? 'Detecting…' : <><IcoPin /> Use My Location</>}
                </button>
                <input className="s-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search city…" />
                {searching && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>Searching…</div>}
                {results.length > 0 && (
                  <div className="s-list">
                    {results.map((c, i) => (
                      <button key={i} className="s-item" onClick={() => pick(c)}>
                        {c.name}<span className="s-country">{c.country}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="cur-loc">Current: {cfg.city}</div>
              </div>

              {/* Madhab */}
              <div className="field">
                <div className="field-lbl">Asr Calculation</div>
                <div className="madhab-row">
                  <button className={`madhab-btn ${cfg.madhab === 'shafi' ? 'on' : ''}`}
                    onClick={() => setCfg(s => ({ ...s, madhab: 'shafi' }))}>
                    <div className="madhab-main">Shafi'i</div>
                    <div className="madhab-sub">Standard</div>
                  </button>
                  <button className={`madhab-btn ${cfg.madhab === 'hanafi' ? 'on' : ''}`}
                    onClick={() => setCfg(s => ({ ...s, madhab: 'hanafi' }))}>
                    <div className="madhab-main">Hanafi</div>
                    <div className="madhab-sub">Later Asr</div>
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
