import { useState, useEffect, useCallback } from 'react';
import {
  calcPrayerTimes,
  autoSelectMethod,
  fetchElevation,
  reverseGeocode,
  searchCities,
  PRAYER_LABELS,
  METHOD_NAMES,
  type PrayerName,
  type MethodKey,
  type CalcResult,
} from './lib/prayer';

// ---- Types ----

interface Settings {
  lat: number;
  lng: number;
  city: string;
  method: MethodKey;
  madhab: 'shafi' | 'hanafi';
  elevation: number;
  theme: 'light' | 'dark';
}

const DEFAULT_SETTINGS: Settings = {
  lat: 43.8563,
  lng: 18.4131,
  city: 'Sarajevo',
  method: 'MWL',
  madhab: 'shafi',
  elevation: 530,
  theme: 'light',
};

function loadSettings(): Settings {
  try {
    const saved = localStorage.getItem('prayer-settings');
    if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch {}
  return DEFAULT_SETTINGS;
}

function saveSettings(s: Settings) {
  localStorage.setItem('prayer-settings', JSON.stringify(s));
}

// ---- Icons ----

const IconPin = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const IconGear = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const IconX = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const IconMountain = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 20l6-10 4 6 2-3 4 7H4z" />
  </svg>
);

const IconSun = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="5" strokeWidth={2} />
    <path strokeLinecap="round" strokeWidth={2}
      d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

const IconMoon = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
  </svg>
);

const IconKaaba = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="1" />
  </svg>
);

// ---- Format date ----

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ---- App ----

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [prayerData, setPrayerData] = useState<CalcResult | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [searchResults, setSearchResults] = useState<
    { name: string; lat: number; lng: number; country: string }[]
  >([]);
  const [searching, setSearching] = useState(false);

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  // Calculate prayer times
  const update = useCallback(() => {
    const result = calcPrayerTimes({
      lat: settings.lat,
      lng: settings.lng,
      date: new Date(),
      method: settings.method,
      madhab: settings.madhab,
      elevation: settings.elevation,
    });
    setPrayerData(result);
  }, [settings]);

  useEffect(() => {
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [update]);

  // Save settings
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Geolocate
  const geolocate = async () => {
    setLoading(true);
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, {
          enableHighAccuracy: true,
          timeout: 10000,
        })
      );
      const { latitude: lat, longitude: lng } = pos.coords;
      const [city, elevation] = await Promise.all([
        reverseGeocode(lat, lng),
        fetchElevation(lat, lng),
      ]);
      const method = autoSelectMethod(lat, lng);
      setSettings((s) => ({ ...s, lat, lng, city, elevation, method }));
    } catch {
      alert('Could not get location. Please search for your city.');
    }
    setLoading(false);
  };

  // City search
  useEffect(() => {
    if (citySearch.length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      const results = await searchCities(citySearch);
      setSearchResults(results);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [citySearch]);

  const pickCity = async (city: { name: string; lat: number; lng: number }) => {
    setLoading(true);
    const elevation = await fetchElevation(city.lat, city.lng);
    const method = autoSelectMethod(city.lat, city.lng);
    setSettings((s) => ({
      ...s,
      lat: city.lat,
      lng: city.lng,
      city: city.name,
      elevation,
      method,
    }));
    setCitySearch('');
    setSearchResults([]);
    setLoading(false);
    setShowSettings(false);
  };

  if (!prayerData) {
    return <div className="loading-screen">Loading...</div>;
  }

  const { times, nextPrayer, currentPrayer, countdown, progressPercent, qibla } =
    prayerData;

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <button className="header-location" onClick={() => setShowSettings(true)}>
          <IconPin />
          {settings.city}
        </button>
        <div className="header-actions">
          <button
            className="icon-btn"
            onClick={() =>
              setSettings((s) => ({
                ...s,
                theme: s.theme === 'light' ? 'dark' : 'light',
              }))
            }
            title="Toggle theme"
          >
            {settings.theme === 'light' ? <IconMoon /> : <IconSun />}
          </button>
          <button className="icon-btn" onClick={() => setShowSettings(true)} title="Settings">
            <IconGear />
          </button>
        </div>
      </header>

      {/* Date */}
      <div className="date-bar">{formatDate(new Date())}</div>

      {/* Countdown */}
      <div className="countdown-section">
        <div className="countdown-label">Time until</div>
        <div className="countdown-prayer">{PRAYER_LABELS[nextPrayer]}</div>
        <div className="countdown-timer">
          <div className="countdown-digit-group">
            <span className="countdown-digit">
              {String(countdown.hours).padStart(2, '0')}
            </span>
            <span className="countdown-unit">hrs</span>
          </div>
          <span className="countdown-separator">:</span>
          <div className="countdown-digit-group">
            <span className="countdown-digit">
              {String(countdown.minutes).padStart(2, '0')}
            </span>
            <span className="countdown-unit">min</span>
          </div>
          <span className="countdown-separator">:</span>
          <div className="countdown-digit-group">
            <span className="countdown-digit">
              {String(countdown.seconds).padStart(2, '0')}
            </span>
            <span className="countdown-unit">sec</span>
          </div>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      {/* Prayer List */}
      <div className="prayer-list">
        {times.map((p) => (
          <div
            key={p.name}
            className={`prayer-row ${p.isNext ? 'is-next' : ''} ${p.isPast ? 'is-past' : ''} ${
              p.isCurrent ? 'is-current' : ''
            }`}
          >
            <div className="prayer-left">
              <div
                className={`prayer-indicator ${
                  p.isNext ? 'active' : p.isCurrent ? 'current' : 'empty'
                }`}
              />
              <div>
                <div className="prayer-name">{p.label}</div>
                {p.elevationOffset !== 0 && (
                  <div className="prayer-elevation">
                    <IconMountain />
                    <span>
                      {p.elevationOffset > 0 ? '+' : ''}
                      {p.elevationOffset} min elevation
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="prayer-time">{p.displayTime}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-method">
          {METHOD_NAMES[settings.method]} · {settings.madhab === 'hanafi' ? 'Hanafi' : "Shafi'i"} ·{' '}
          {Math.round(settings.elevation)}m
        </div>
        <div className="footer-qibla">
          <IconKaaba />
          Qibla: {qibla}° from North
        </div>
      </footer>

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Settings</h2>
              <button className="modal-close" onClick={() => setShowSettings(false)}>
                <IconX />
              </button>
            </div>
            <div className="modal-body">
              {/* Theme */}
              <div className="settings-section">
                <div className="section-label">Theme</div>
                <div className="theme-toggle">
                  <button
                    className={`theme-option ${settings.theme === 'light' ? 'active' : ''}`}
                    onClick={() => setSettings((s) => ({ ...s, theme: 'light' }))}
                  >
                    <IconSun /> Light
                  </button>
                  <button
                    className={`theme-option ${settings.theme === 'dark' ? 'active' : ''}`}
                    onClick={() => setSettings((s) => ({ ...s, theme: 'dark' }))}
                  >
                    <IconMoon /> Dark
                  </button>
                </div>
              </div>

              {/* Location */}
              <div className="settings-section">
                <div className="section-label">Location</div>
                <button className="locate-btn" onClick={geolocate} disabled={loading}>
                  {loading ? (
                    'Detecting...'
                  ) : (
                    <>
                      <IconPin /> Use My Location
                    </>
                  )}
                </button>
                <input
                  type="text"
                  className="search-input"
                  value={citySearch}
                  onChange={(e) => setCitySearch(e.target.value)}
                  placeholder="Search city..."
                />
                {searching && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Searching...
                  </div>
                )}
                {searchResults.length > 0 && (
                  <div className="search-results">
                    {searchResults.map((c, i) => (
                      <button key={i} className="search-result-item" onClick={() => pickCity(c)}>
                        {c.name}
                        <span className="search-result-country">{c.country}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="current-location-info">
                  Current: <span>{settings.city}</span> ({settings.lat.toFixed(2)},{' '}
                  {settings.lng.toFixed(2)})
                </div>
              </div>

              {/* Elevation */}
              <div className="settings-section">
                <div className="section-label">Elevation</div>
                <div className="elevation-control">
                  <button
                    className="elev-btn"
                    onClick={() =>
                      setSettings((s) => ({ ...s, elevation: Math.max(0, s.elevation - 50) }))
                    }
                  >
                    −
                  </button>
                  <div className="elev-value">
                    <span className="elev-number">{Math.round(settings.elevation)}</span>
                    <span className="elev-unit">m</span>
                  </div>
                  <button
                    className="elev-btn"
                    onClick={() => setSettings((s) => ({ ...s, elevation: s.elevation + 50 }))}
                  >
                    +
                  </button>
                </div>
                <div className="elev-hint">Affects Sunrise & Maghrib times</div>
              </div>

              {/* Method */}
              <div className="settings-section">
                <div className="section-label">Calculation Method</div>
                <div className="method-grid">
                  {(Object.keys(METHOD_NAMES) as MethodKey[]).map((key) => (
                    <button
                      key={key}
                      className={`method-btn ${settings.method === key ? 'active' : ''}`}
                      onClick={() => setSettings((s) => ({ ...s, method: key }))}
                    >
                      {METHOD_NAMES[key]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Madhab */}
              <div className="settings-section">
                <div className="section-label">Asr Calculation</div>
                <div className="madhab-grid">
                  <button
                    className={`madhab-btn ${settings.madhab === 'shafi' ? 'active' : ''}`}
                    onClick={() => setSettings((s) => ({ ...s, madhab: 'shafi' }))}
                  >
                    <div className="madhab-name">Shafi'i</div>
                    <div className="madhab-sub">Standard</div>
                  </button>
                  <button
                    className={`madhab-btn ${settings.madhab === 'hanafi' ? 'active' : ''}`}
                    onClick={() => setSettings((s) => ({ ...s, madhab: 'hanafi' }))}
                  >
                    <div className="madhab-name">Hanafi</div>
                    <div className="madhab-sub">Later Asr</div>
                  </button>
                </div>
              </div>

              {/* Info */}
              <div className="settings-section">
                <div className="info-box">
                  <h4>About calculations</h4>
                  <p>
                    Prayer times are calculated locally using astronomical algorithms. 
                    Elevation affects Sunrise and Maghrib — at higher elevations you can 
                    see the sun earlier in the morning and later in the evening because 
                    you're looking over the horizon. This adjustment is calculated using 
                    the formula: 0.0347 × √(elevation in meters).
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
