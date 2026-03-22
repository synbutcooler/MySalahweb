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

/* ---- Types ---- */

interface Settings {
  lat: number;
  lng: number;
  city: string;
  method: MethodKey;
  madhab: 'shafi' | 'hanafi';
  elevation: number;
  theme: 'light' | 'dark';
}

const DEFAULT: Settings = {
  lat: 43.8563,
  lng: 18.4131,
  city: 'Sarajevo',
  method: 'MWL',
  madhab: 'shafi',
  elevation: 530,
  theme: 'light',
};

function load(): Settings {
  try {
    const s = localStorage.getItem('pt-settings');
    if (s) return { ...DEFAULT, ...JSON.parse(s) };
  } catch {}
  return DEFAULT;
}

function save(s: Settings) {
  localStorage.setItem('pt-settings', JSON.stringify(s));
}

/* ---- Tiny SVG icons ---- */

const IcoPin = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const IcoGear = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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
    <path strokeLinecap="round" strokeWidth={2}
      d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

const IcoMoon = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
  </svg>
);

const IcoMtn = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 20l6-10 4 6 2-3 4 7H4z" />
  </svg>
);

const IcoKaaba = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="1" /></svg>
);

/* ---- Helpers ---- */

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function fmtSunnah(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

/* ---- App ---- */

export default function App() {
  const [cfg, setCfg] = useState<Settings>(load);
  const [data, setData] = useState<CalcResult | null>(null);
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ name: string; lat: number; lng: number; country: string }[]>([]);
  const [searching, setSearching] = useState(false);

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', cfg.theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content', cfg.theme === 'dark' ? '#121212' : '#ffffff'
    );
  }, [cfg.theme]);

  // Calc
  const calc = useCallback(() => {
    setData(calcPrayerTimes({
      lat: cfg.lat, lng: cfg.lng, date: new Date(),
      method: cfg.method, madhab: cfg.madhab, elevation: cfg.elevation,
    }));
  }, [cfg]);

  useEffect(() => { calc(); const id = setInterval(calc, 1000); return () => clearInterval(id); }, [calc]);
  useEffect(() => { save(cfg); }, [cfg]);

  // Geolocate
  const locate = async () => {
    setBusy(true);
    try {
      const pos = await new Promise<GeolocationPosition>((ok, fail) =>
        navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: true, timeout: 10000 })
      );
      const { latitude: lat, longitude: lng } = pos.coords;
      const [city, elevation] = await Promise.all([reverseGeocode(lat, lng), fetchElevation(lat, lng)]);
      const method = autoSelectMethod(lat, lng);
      setCfg(s => ({ ...s, lat, lng, city, elevation, method }));
    } catch { alert('Could not detect location. Try searching for your city.'); }
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

  if (!data) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: 'var(--text-muted)' }}>Loading…</div>;

  const { times, nextPrayer, countdown, progressPercent, qibla, sunnahTimes } = data;

  return (
    <div className="page">
      {/* Header */}
      <header className="site-header">
        <span className="site-title">Prayer Times</span>
        <div className="header-right">
          <button className="hdr-btn" onClick={() => setCfg(s => ({ ...s, theme: s.theme === 'light' ? 'dark' : 'light' }))}>
            {cfg.theme === 'light' ? <IcoMoon /> : <IcoSun />}
          </button>
          <button className="hdr-btn" onClick={() => setModal(true)}>
            <IcoGear />
          </button>
        </div>
      </header>

      {/* Location */}
      <div className="location-bar">
        <div>
          <div className="loc-name"><IcoPin />{cfg.city}</div>
          <div className="loc-meta">{cfg.lat.toFixed(2)}°, {cfg.lng.toFixed(2)}° · {Math.round(cfg.elevation)}m</div>
        </div>
        <button onClick={() => setModal(true)}>Change</button>
      </div>

      {/* Date */}
      <div className="date-row">{fmtDate(new Date())}</div>

      {/* Countdown */}
      <div className="countdown-box">
        <div className="cd-label">Time remaining until</div>
        <div className="cd-prayer">{PRAYER_LABELS[nextPrayer]}</div>
        <div className="cd-time">
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
        <div className="cd-progress">
          <div className="cd-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      {/* Prayer table */}
      <table className="prayer-table">
        <tbody>
          {times.map(p => (
            <tr key={p.name} className={p.isNext ? 'is-next' : p.isPast ? 'is-past' : ''}>
              <td>
                <div className="p-name-wrap">
                  <div className={`p-dot ${p.isNext ? 'next' : p.isCurrent ? 'current' : 'empty'}`} />
                  <div>
                    <div className="p-label">{p.label}</div>
                    {p.elevationOffset !== 0 && (
                      <div className="p-elev">
                        <IcoMtn />
                        {p.elevationOffset > 0 ? '+' : ''}{p.elevationOffset} min
                      </div>
                    )}
                  </div>
                </div>
              </td>
              <td>{p.displayTime}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Sunnah times */}
      <div className="sunnah-section">
        <div className="sunnah-item">
          <div className="sunnah-label">Middle of Night</div>
          <div className="sunnah-time">{fmtSunnah(sunnahTimes.middleOfTheNight)}</div>
        </div>
        <div className="sunnah-item">
          <div className="sunnah-label">Last Third</div>
          <div className="sunnah-time">{fmtSunnah(sunnahTimes.lastThirdOfTheNight)}</div>
        </div>
      </div>

      {/* Footer */}
      <footer className="site-footer">
        <div className="footer-line">
          {METHOD_NAMES[cfg.method]} · {cfg.madhab === 'hanafi' ? 'Hanafi' : "Shafi'i"}
        </div>
        <div className="footer-line">
          <span className="footer-qibla"><IcoKaaba /> Qibla: {qibla}° from North</span>
        </div>
      </footer>

      {/* Settings Modal */}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Settings</h2>
              <button className="modal-close" onClick={() => setModal(false)}><IcoX /></button>
            </div>
            <div className="modal-body">

              {/* Theme */}
              <div className="field">
                <div className="field-label">Theme</div>
                <div className="theme-row">
                  <button className={`theme-btn ${cfg.theme === 'light' ? 'active' : ''}`}
                    onClick={() => setCfg(s => ({ ...s, theme: 'light' }))}><IcoSun /> Light</button>
                  <button className={`theme-btn ${cfg.theme === 'dark' ? 'active' : ''}`}
                    onClick={() => setCfg(s => ({ ...s, theme: 'dark' }))}><IcoMoon /> Dark</button>
                </div>
              </div>

              {/* Location */}
              <div className="field">
                <div className="field-label">Location</div>
                <button className="btn-locate" onClick={locate} disabled={busy}>
                  {busy ? 'Detecting…' : <><IcoPin /> Use My Location</>}
                </button>
                <input className="input-search" value={q} onChange={e => setQ(e.target.value)}
                  placeholder="Search city…" />
                {searching && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Searching…</div>}
                {results.length > 0 && (
                  <div className="search-list">
                    {results.map((c, i) => (
                      <button key={i} className="search-item" onClick={() => pick(c)}>
                        {c.name}<span className="search-country">{c.country}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="current-loc">Current: {cfg.city} ({cfg.lat.toFixed(2)}, {cfg.lng.toFixed(2)})</div>
              </div>

              {/* Elevation */}
              <div className="field">
                <div className="field-label">Elevation</div>
                <div className="elev-row">
                  <button className="elev-btn" onClick={() => setCfg(s => ({ ...s, elevation: Math.max(0, s.elevation - 50) }))}>−</button>
                  <div className="elev-val">{Math.round(cfg.elevation)} <span className="elev-m">m</span></div>
                  <button className="elev-btn" onClick={() => setCfg(s => ({ ...s, elevation: s.elevation + 50 }))}>+</button>
                </div>
                <div className="elev-hint">Affects Sunrise & Maghrib times</div>
              </div>

              {/* Method */}
              <div className="field">
                <div className="field-label">Calculation Method</div>
                <div className="opt-grid">
                  {(Object.keys(METHOD_NAMES) as MethodKey[]).map(k => (
                    <button key={k} className={`opt-btn ${cfg.method === k ? 'active' : ''}`}
                      onClick={() => setCfg(s => ({ ...s, method: k }))}>{METHOD_NAMES[k]}</button>
                  ))}
                </div>
              </div>

              {/* Madhab */}
              <div className="field">
                <div className="field-label">Asr Calculation</div>
                <div className="madhab-grid">
                  <button className={`madhab-btn ${cfg.madhab === 'shafi' ? 'active' : ''}`}
                    onClick={() => setCfg(s => ({ ...s, madhab: 'shafi' }))}>
                    <div className="madhab-main">Shafi'i / Maliki / Hanbali</div>
                    <div className="madhab-sub">Standard (shadow = object)</div>
                  </button>
                  <button className={`madhab-btn ${cfg.madhab === 'hanafi' ? 'active' : ''}`}
                    onClick={() => setCfg(s => ({ ...s, madhab: 'hanafi' }))}>
                    <div className="madhab-main">Hanafi</div>
                    <div className="madhab-sub">Later Asr (shadow = 2× object)</div>
                  </button>
                </div>
              </div>

              {/* Info */}
              <div className="field">
                <div className="info-note">
                  <strong>About the calculations:</strong> Prayer times are computed using the
                  battle-tested <em>adhan</em> library. Elevation adjusts Sunrise and Maghrib —
                  at higher altitudes you see the sun earlier in the morning and later in the evening.
                  At latitudes above 40°, Fajr and Isha angles are adaptively reduced to match
                  regional Islamic authorities.
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
