import {
  fmtTemp,
  fmtWind,
  fmtKm,
  fmtPressure,
  wmoToText,
  clamp,
  debounce,
  toast,
  fmtClock,
  weatherTheme,
  wmoToIcon,
  themeGradient,
} from './ui.js';

// WeatherVision — main app logic (matches index.html in this repo)

/* ---------------------------
   Storage (shared with widget.js)
---------------------------- */
const LS = {
  unit: 'wv:unit',
  theme: 'wv:theme',
  sound: 'wv:sound',
  a11y: 'wv:a11y',
  autoRefresh: 'wv:autoRefresh',
  favorites: 'wv:favorites',
  lastForecast: 'wv:lastForecast',
  lastPlace: 'wv:lastPlace',
};

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

/* ---------------------------
   State
---------------------------- */
const state = {
  unit: (localStorage.getItem(LS.unit) || 'metric') === 'imperial' ? 'imperial' : 'metric',
  theme: localStorage.getItem(LS.theme) || 'auto',
  sound: localStorage.getItem(LS.sound) === '1',
  a11y: localStorage.getItem(LS.a11y) === '1',
  autoRefresh: localStorage.getItem(LS.autoRefresh) !== '0',
  favorites: readJSON(LS.favorites, []),
  place: readJSON(LS.lastPlace, null), // {name,country,lat,lon,tz}
  wx: null,
  aqi: null,
  selectedDay: null,
  suggestions: [],
  sugIndex: -1,
  chartSelected: -1,
  chartHover: -1,
  chartHours: [],
  map: null,
  marker: null,
  mapReady: false,
};

function savePrefs() {
  localStorage.setItem(LS.unit, state.unit);
  localStorage.setItem(LS.theme, state.theme);
  localStorage.setItem(LS.sound, state.sound ? '1' : '0');
  localStorage.setItem(LS.a11y, state.a11y ? '1' : '0');
  localStorage.setItem(LS.autoRefresh, state.autoRefresh ? '1' : '0');
  writeJSON(LS.favorites, state.favorites);
  if (state.place) writeJSON(LS.lastPlace, state.place);
}

/* ---------------------------
   DOM
---------------------------- */
const els = {
  app: document.getElementById('app') || document.body,

  // backgrounds
  bgA: document.getElementById('bgA'),
  bgB: document.getElementById('bgB'),
  fxA: document.getElementById('fxA'),
  fxB: document.getElementById('fxB'),

  // search
  searchForm: document.getElementById('searchForm'),
  cityInput: document.getElementById('cityInput'),
  suggestions: document.getElementById('suggestions'),
  geoBtn: document.getElementById('geoBtn'),

  // top actions
  unitBtns: Array.from(document.querySelectorAll('.seg__btn[data-unit]')),
  themeBtn: document.getElementById('themeBtn'),
  settingsBtn: document.getElementById('settingsBtn'),

  // tabs/views
  tabs: Array.from(document.querySelectorAll('.tab[data-view]')),
  viewForecast: document.getElementById('viewForecast'),
  viewCities: document.getElementById('viewCities'),
  viewSettings: document.getElementById('viewSettings'),

  // forecast header
  placeKicker: document.getElementById('placeKicker'),
  placeTitle: document.getElementById('placeTitle'),
  placeMeta: document.getElementById('placeMeta'),
  favBtn: document.getElementById('favBtn'),
  favIcon: document.getElementById('favIcon'),

  // now metrics
  temp: document.getElementById('temp'),
  summary: document.getElementById('summary'),
  confidence: document.getElementById('confidence'),
  explainBtn: document.getElementById('explainBtn'),
  feels: document.getElementById('feels'),
  wind: document.getElementById('wind'),
  humidity: document.getElementById('humidity'),
  pressure: document.getElementById('pressure'),
  uv: document.getElementById('uv'),
  visibility: document.getElementById('visibility'),
  precipChance: document.getElementById('precipChance'),
  dewPoint: document.getElementById('dewPoint'),
  sunrise: document.getElementById('sunrise'),
  sunset: document.getElementById('sunset'),

  notice: document.getElementById('notice'),
  noticeText: document.getElementById('noticeText'),

  timeline: document.getElementById('timeline'),
  alerts: document.getElementById('alerts'),
  alertsList: document.getElementById('alertsList'),

  // hourly
  hourlyMeta: document.getElementById('hourlyMeta'),
  hourChart: document.getElementById('hourChart'),
  hourTooltip: document.getElementById('hourTooltip'),
  hourly: document.getElementById('hourly'),

  // daily
  dailyMeta: document.getElementById('dailyMeta'),
  daily: document.getElementById('daily'),
  compareBtn: document.getElementById('compareBtn'),

  // map
  map: document.getElementById('map'),

  // favorites sidebar
  favorites: document.getElementById('favorites'),
  favHint: document.getElementById('favHint'),
  clearFavBtn: document.getElementById('clearFavBtn'),
  dashboard: document.getElementById('dashboard'),
  dashHint: document.getElementById('dashHint'),

  // settings
  soundToggle: document.getElementById('soundToggle'),
  a11yToggle: document.getElementById('a11yToggle'),
  refreshToggle: document.getElementById('refreshToggle'),
  widgetPreview: document.getElementById('widgetPreview'),

  // offline
  offlineScreen: document.getElementById('offlineScreen'),
  offlineText: document.getElementById('offlineText'),
  offlineTry: document.getElementById('offlineTry'),

  // modal
  modal: document.getElementById('modal'),
  modalTitle: document.getElementById('modalTitle'),
  modalBody: document.getElementById('modalBody'),

  toast: document.getElementById('toast'),
};

function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/* ---------------------------
   Background FX (crossfade)
---------------------------- */
let bgFlip = false;
let fxFlip = false;

function setSmoothBackground(theme) {
  const [g0, g1, g2] = themeGradient(theme);
  const a = els.bgA, b = els.bgB;
  if (!a || !b) return;
  const next = bgFlip ? a : b;
  const prev = bgFlip ? b : a;

  next.style.setProperty('--g0', g0);
  next.style.setProperty('--g1', g1);
  next.style.setProperty('--g2', g2);
  next.style.opacity = '1';
  prev.style.opacity = '0';
  bgFlip = !bgFlip;
}

function fxClassFor(wmo) {
  if ([95, 96, 99].includes(wmo)) return 'fx-storm';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(wmo)) return 'fx-rain';
  if ([71, 73, 75, 77, 85, 86].includes(wmo)) return 'fx-snow';
  if ([45, 48].includes(wmo)) return 'fx-fog';
  if ([1, 2, 3].includes(wmo)) return 'fx-clouds';
  return '';
}

function setSmoothFX(wmo) {
  const cls = fxClassFor(wmo);
  const next = fxFlip ? els.fxB : els.fxA;
  const prev = fxFlip ? els.fxA : els.fxB;
  if (!next || !prev) return;

  next.className = 'fx-layer' + (fxFlip ? ' fx-layer--alt' : '');
  prev.className = 'fx-layer' + (!fxFlip ? ' fx-layer--alt' : '');

  if (cls) {
    next.classList.add(cls);
    next.style.opacity = '1';
  } else {
    next.style.opacity = '0';
  }
  prev.style.opacity = '0';
  fxFlip = !fxFlip;
}

/* ---------------------------
   API (Open-Meteo)
---------------------------- */
const OM_BASE = 'https://api.open-meteo.com/v1/forecast';
const OM_GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const OM_AIR = 'https://air-quality-api.open-meteo.com/v1/air-quality';

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function geocode(query) {
  const url = `${OM_GEO}?name=${encodeURIComponent(query)}&count=10&language=ru&format=json`;
  const data = await fetchJson(url);
  const results = data.results || [];
  return results.map((r) => ({
    name: r.name,
    country: r.country,
    lat: r.latitude,
    lon: r.longitude,
    tz: r.timezone || 'auto',
  }));
}

async function fetchWeather(place) {
  const isMetric = state.unit === 'metric';
  const tempUnit = isMetric ? 'celsius' : 'fahrenheit';
  const windUnit = isMetric ? 'ms' : 'mph';
  const tzParam = place.tz && place.tz !== 'auto' ? place.tz : 'auto';

  const current = 'temperature_2m,relativehumidity_2m,apparent_temperature,windspeed_10m,weathercode,is_day';
  const hourly = 'temperature_2m,relativehumidity_2m,apparent_temperature,precipitation_probability,dewpoint_2m,windspeed_10m,weathercode,is_day';
  const daily = 'weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset,uv_index_max';

  const url =
    `${OM_BASE}?latitude=${place.lat}&longitude=${place.lon}` +
    `&timezone=${encodeURIComponent(tzParam)}` +
    `&temperature_unit=${tempUnit}` +
    `&wind_speed_unit=${windUnit}` +
    `&current=${current}&hourly=${hourly}&daily=${daily}&forecast_days=10`;

  const data = await fetchJson(url);

  const wx = {
    current: {
      time: data.current?.time,
      temperature: data.current?.temperature_2m,
      relativehumidity: data.current?.relativehumidity_2m,
      apparent_temperature: data.current?.apparent_temperature,
      windspeed: data.current?.windspeed_10m,
      weathercode: data.current?.weathercode,
      is_day: Boolean(data.current?.is_day),
      pressure: null,
      visibility_km: null,
      uv_index: Number.isFinite(data.daily?.uv_index_max?.[0]) ? data.daily.uv_index_max[0] : null,
    },
    hourly: [],
    daily: [],
  };

  if (Array.isArray(data.hourly?.time)) {
    for (let i = 0; i < data.hourly.time.length; i++) {
      wx.hourly.push({
        time: data.hourly.time[i],
        temperature: data.hourly.temperature_2m?.[i],
        relativehumidity: data.hourly.relativehumidity_2m?.[i],
        apparent_temperature: data.hourly.apparent_temperature?.[i],
        precip_prob: data.hourly.precipitation_probability?.[i],
        dewpoint: data.hourly.dewpoint_2m?.[i],
        windspeed: data.hourly.windspeed_10m?.[i],
        weathercode: data.hourly.weathercode?.[i],
        is_day: Boolean(data.hourly.is_day?.[i]),
      });
    }
  }

  if (Array.isArray(data.daily?.time)) {
    for (let i = 0; i < data.daily.time.length; i++) {
      wx.daily.push({
        date: data.daily.time[i],
        weathercode: data.daily.weathercode?.[i],
        temp_max: data.daily.temperature_2m_max?.[i],
        temp_min: data.daily.temperature_2m_min?.[i],
        precip_sum: data.daily.precipitation_sum?.[i],
        precip_prob_max: data.daily.precipitation_probability_max?.[i],
        sunrise: data.daily.sunrise?.[i],
        sunset: data.daily.sunset?.[i],
        uv_max: data.daily.uv_index_max?.[i],
      });
    }
  }

  return wx;
}

async function fetchAir(place) {
  const tzParam = place.tz && place.tz !== 'auto' ? place.tz : 'auto';
  const url =
    `${OM_AIR}?latitude=${place.lat}&longitude=${place.lon}` +
    `&timezone=${encodeURIComponent(tzParam)}&hourly=us_aqi`;
  const data = await fetchJson(url);
  const aqi = data.hourly?.us_aqi?.[0];
  if (!Number.isFinite(aqi)) return null;
  const label =
    aqi <= 50 ? 'Хорошее' :
    aqi <= 100 ? 'Умеренное' :
    aqi <= 150 ? 'Вредно для чувствительных' :
    aqi <= 200 ? 'Вредное' :
    aqi <= 300 ? 'Очень вредное' : 'Опасное';
  return { us_aqi: aqi, label };
}

/* ---------------------------
   Rendering helpers
---------------------------- */
function setView(name) {
  // tabs
  els.tabs.forEach((t) => {
    const isActive = t.getAttribute('data-view') === name;
    t.classList.toggle('is-active', isActive);
    t.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  // views
  if (els.viewForecast) els.viewForecast.hidden = name !== 'forecast';
  if (els.viewCities) els.viewCities.hidden = name !== 'cities';
  if (els.viewSettings) els.viewSettings.hidden = name !== 'settings';
}

function updateUnitUI() {
  els.unitBtns.forEach((b) => {
    const u = b.getAttribute('data-unit');
    const on = u === state.unit;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.classList.toggle('is-active', on);
  });
  localStorage.setItem(LS.unit, state.unit);
}

function applyThemeUI() {
  document.documentElement.setAttribute('data-theme', state.theme);
  localStorage.setItem(LS.theme, state.theme);
}

function applyA11yUI() {
  document.documentElement.classList.toggle('a11y', state.a11y);
}

function setToggle(btn, on) {
  if (!btn) return;
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.textContent = on ? 'Вкл' : 'Выкл';
  btn.classList.toggle('is-on', on);
}

function placeTitleText(p) {
  if (!p) return '—';
  return `${p.name}${p.country ? ', ' + p.country : ''}`;
}

function computeConfidence(wx) {
  try {
    const dayISO = wx.current.time.slice(0, 10);
    const hrs = wx.hourly.filter((h) => h.time.startsWith(dayISO)).slice(0, 12);
    const pops = hrs.map((h) => Number.isFinite(h.precip_prob) ? h.precip_prob : 0);
    const winds = hrs.map((h) => Number.isFinite(h.windspeed) ? h.windspeed : 0);
    const avgPop = pops.reduce((a, b) => a + b, 0) / (pops.length || 1);
    const maxWind = Math.max(...winds, 0);
    const popPenalty = avgPop * 0.55;
    const windPenalty = maxWind * (state.unit === 'metric' ? 2.2 : 1.3);
    return clamp(Math.round(92 - popPenalty - windPenalty), 35, 98);
  } catch {
    return 70;
  }
}

/* ---------------------------
   Render: current
---------------------------- */
function renderCurrent() {
  const p = state.place;
  const wx = state.wx;
  if (!p || !wx) return;

  // titles
  if (els.placeKicker) els.placeKicker.textContent = p.country || '—';
  if (els.placeTitle) els.placeTitle.textContent = p.name || '—';

  // meta
  const now = wx.current?.time ? new Date(wx.current.time) : new Date();
  const meta = now.toLocaleString('ru-RU', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' });
  const aq = state.aqi?.us_aqi ? ` • AQI ${state.aqi.us_aqi} (${state.aqi.label})` : '';
  if (els.placeMeta) els.placeMeta.textContent = meta + aq;

  // background
  const theme = weatherTheme(wx.current.weathercode, wx.current.is_day);
  els.app.setAttribute('data-weather', theme);
  setSmoothBackground(theme);
  setSmoothFX(wx.current.weathercode);

  // top
  if (els.temp) els.temp.textContent = fmtTemp(wx.current.temperature, state.unit);
  if (els.summary) {
    els.summary.innerHTML = `${wmoToIcon(wx.current.weathercode, wx.current.is_day)} <span>${escapeHtml(wmoToText(wx.current.weathercode))}</span>`;
  }
  if (els.confidence) els.confidence.textContent = `Надёжность: ${computeConfidence(wx)}%`;

  // chips
  if (els.feels) els.feels.textContent = fmtTemp(wx.current.apparent_temperature, state.unit);
  if (els.wind) els.wind.textContent = fmtWind(wx.current.windspeed, state.unit);
  if (els.humidity) els.humidity.textContent = Number.isFinite(wx.current.relativehumidity) ? `${Math.round(wx.current.relativehumidity)}%` : '—';

  // cards
  if (els.pressure) els.pressure.textContent = fmtPressure(wx.current.pressure);
  if (els.uv) els.uv.textContent = Number.isFinite(wx.current.uv_index) ? wx.current.uv_index.toFixed(1) : '—';
  if (els.visibility) els.visibility.textContent = fmtKm(wx.current.visibility_km);

  // extra details: take first hour of selected day
  const dayISO = (state.selectedDay || wx.current.time.slice(0, 10));
  const h0 = wx.hourly.find((h) => h.time.startsWith(dayISO)) || wx.hourly[0];
  if (els.precipChance) els.precipChance.textContent = Number.isFinite(h0?.precip_prob) ? `${Math.round(h0.precip_prob)}%` : '—';
  if (els.dewPoint) els.dewPoint.textContent = fmtTemp(h0?.dewpoint, state.unit);

  const d0 = wx.daily.find((d) => d.date === dayISO) || wx.daily[0];
  if (els.sunrise) els.sunrise.textContent = fmtClock(d0?.sunrise);
  if (els.sunset) els.sunset.textContent = fmtClock(d0?.sunset);

  // notice (air quality)
  if (els.notice && els.noticeText) {
    if (state.aqi?.us_aqi >= 101) {
      els.notice.hidden = false;
      els.noticeText.textContent = `Качество воздуха: ${state.aqi.label} (AQI ${state.aqi.us_aqi}).`;
    } else {
      els.notice.hidden = true;
    }
  }
}

/* ---------------------------
   Render: timeline + alerts
---------------------------- */
function renderTimeline() {
  if (!els.timeline || !state.wx) return;
  const wx = state.wx;
  const dayISO = (state.selectedDay || wx.current.time.slice(0, 10));
  const hours = wx.hourly.filter((h) => h.time.startsWith(dayISO)).slice(0, 24);
  els.timeline.innerHTML = hours.map((h) => {
    const t = new Date(h.time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const pop = Number.isFinite(h.precip_prob) ? `${Math.round(h.precip_prob)}%` : '—';
    return `<div class="titem">
      <div class="muted">${escapeHtml(t)}</div>
      <div class="titem__k">${escapeHtml(fmtTemp(h.temperature, state.unit))}</div>
      <div class="titem__v">${wmoToIcon(h.weathercode, h.is_day)} <span class="muted">${escapeHtml(wmoToText(h.weathercode))}</span></div>
      <div class="muted">Осадки: ${escapeHtml(pop)}</div>
    </div>`;
  }).join('');
}

function renderAlerts() {
  if (!els.alerts || !els.alertsList || !state.wx) return;
  const wx = state.wx;
  const dayISO = (state.selectedDay || wx.current.time.slice(0, 10));
  const hours = wx.hourly.filter((h) => h.time.startsWith(dayISO)).slice(0, 24);

  const alerts = [];
  const nextRain = hours.find((h) => Number.isFinite(h.precip_prob) && h.precip_prob >= 65);
  if (nextRain) {
    const t = new Date(nextRain.time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    alerts.push({ icon: '☔', title: 'Осадки возможны', desc: `Около ${t} вероятность ~${Math.round(nextRain.precip_prob)}%.` });
  }
  const windThr = state.unit === 'metric' ? 10 : 22;
  const maxWind = hours.reduce((m, h) => Math.max(m, Number(h.windspeed || 0)), 0);
  if (maxWind >= windThr) {
    alerts.push({ icon: '🌬️', title: 'Сильный ветер', desc: `Порывы до ${fmtWind(maxWind, state.unit)}.` });
  }
  if ([95, 96, 99].includes(wx.current.weathercode)) {
    alerts.push({ icon: '⚡', title: 'Гроза', desc: 'Избегай открытых пространств и воды.' });
  }

  els.alerts.hidden = alerts.length === 0;
  els.alertsList.innerHTML = alerts.map((a) =>
    `<div class="alert"><div class="alert__i">${a.icon}</div><div><div class="alert__t">${escapeHtml(a.title)}</div><div class="alert__d">${escapeHtml(a.desc)}</div></div></div>`
  ).join('');
}

/* ---------------------------
   Render: daily
---------------------------- */
function renderDaily() {
  if (!els.daily || !state.wx) return;
  const wx = state.wx;
  const days = wx.daily.slice(0, 7);
  const sel = state.selectedDay || days[0]?.date;

  if (els.dailyMeta && sel) {
    const dt = new Date(sel);
    els.dailyMeta.textContent = dt.toLocaleDateString('ru-RU', { weekday: 'long', day: '2-digit', month: 'long' });
  }

  els.daily.innerHTML = days.map((d) => {
    const dateStr = new Date(d.date).toLocaleDateString('ru-RU', { weekday: 'short', day: '2-digit', month: 'short' });
    const pop = Number.isFinite(d.precip_prob_max) ? `${Math.round(d.precip_prob_max)}%` : '—';
    const isActive = d.date === sel;
    return `<button class="dcard ${isActive ? 'is-active' : ''}" data-day="${d.date}" type="button">
      <div class="dcard__top">
        <div class="dcard__date">${escapeHtml(dateStr)}</div>
        <div class="dcard__icon">${wmoToIcon(d.weathercode, true)}</div>
      </div>
      <div class="dcard__temps">
        <span class="hi">${escapeHtml(fmtTemp(d.temp_max, state.unit))}</span>
        <span class="lo">${escapeHtml(fmtTemp(d.temp_min, state.unit))}</span>
      </div>
      <div class="dcard__meta muted">Осадки: ${escapeHtml(pop)}</div>
    </button>`;
  }).join('');

  $$('.dcard', els.daily).forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedDay = btn.getAttribute('data-day');
      state.chartSelected = -1;
      savePrefs();
      renderAll();
    });
  });
}

/* ---------------------------
   Render: hourly cards + chart
---------------------------- */
function getDayHours() {
  if (!state.wx) return [];
  const wx = state.wx;
  const dayISO = (state.selectedDay || wx.current.time.slice(0, 10));
  return wx.hourly.filter((h) => h.time.startsWith(dayISO)).slice(0, 24);
}

function renderHourly() {
  if (!els.hourly || !state.wx) return;
  const hours = getDayHours();
  state.chartHours = hours;

  if (els.hourlyMeta && hours.length) {
    const dayISO = hours[0].time.slice(0, 10);
    els.hourlyMeta.textContent = new Date(dayISO).toLocaleDateString('ru-RU', { weekday: 'long', day: '2-digit', month: 'long' });
  }

  els.hourly.innerHTML = hours.map((h, idx) => {
    const t = new Date(h.time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const pop = Number.isFinite(h.precip_prob) ? `${Math.round(h.precip_prob)}%` : '—';
    const isActive = idx === state.chartSelected;
    return `<button class="hcard ${isActive ? 'is-active' : ''}" type="button" data-idx="${idx}">
      <div class="muted">${escapeHtml(t)}</div>
      <div class="hcard__temp">${escapeHtml(fmtTemp(h.temperature, state.unit))}</div>
      <div class="hcard__desc">${wmoToIcon(h.weathercode, h.is_day)} <span class="muted">${escapeHtml(wmoToText(h.weathercode))}</span></div>
      <div class="muted">Осадки: ${escapeHtml(pop)}</div>
    </button>`;
  }).join('');

  $$('.hcard', els.hourly).forEach((btn) => {
    btn.addEventListener('click', () => {
      state.chartSelected = Number(btn.getAttribute('data-idx'));
      drawHourChart();
      // keep card highlight
      $$('.hcard', els.hourly).forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
    });
  });

  drawHourChart();
}

function drawHourChart() {
  const canvas = els.hourChart;
  const tip = els.hourTooltip;
  const hours = state.chartHours || [];
  if (!canvas || hours.length === 0) return;

  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const temps = hours.map((x) => Number(x.temperature)).filter(Number.isFinite);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const pad = 10;
  const x = (i) => pad + (w - pad * 2) * (i / (hours.length - 1 || 1));
  const y = (v) => {
    if (max === min) return h / 2;
    const t = (v - min) / (max - min);
    return (h - pad) - t * (h - pad * 2);
  };

  // grid
  ctx.globalAlpha = 0.15;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const yy = pad + (h - pad * 2) * (i / 4);
    ctx.moveTo(pad, yy);
    ctx.lineTo(w - pad, yy);
  }
  ctx.strokeStyle = 'currentColor';
  ctx.stroke();
  ctx.globalAlpha = 1;

  // line
  ctx.beginPath();
  hours.forEach((p, i) => {
    const v = Number(p.temperature);
    if (!Number.isFinite(v)) return;
    const xx = x(i), yy = y(v);
    if (i === 0) ctx.moveTo(xx, yy);
    else ctx.lineTo(xx, yy);
  });
  ctx.lineWidth = 2;
  ctx.strokeStyle = getComputedStyle(document.documentElement).color;
  ctx.globalAlpha = 0.8;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // points + labels
  hours.forEach((p, i) => {
    const v = Number(p.temperature);
    if (!Number.isFinite(v)) return;
    const xx = x(i), yy = y(v);
    const sel = i === state.chartSelected;
    ctx.beginPath();
    ctx.arc(xx, yy, sel ? 3.8 : 2.6, 0, Math.PI * 2);
    ctx.fillStyle = getComputedStyle(document.documentElement).color;
    ctx.globalAlpha = sel ? 1 : 0.7;
    ctx.fill();
    ctx.globalAlpha = 1;

    // labels (tiny)
    ctx.font = '10px Inter, system-ui, -apple-system, Segoe UI, Arial';
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.6;
    ctx.fillText(`${Math.round(v)}°`, xx, yy - 8);
    ctx.globalAlpha = 1;
  });

  // pointer interaction (tap on hourChart -> select)
  if (!canvas._bound) {
    canvas._bound = true;

    const locate = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      const cx = clientX - rect.left;
      const idx = clamp(Math.round(((cx - pad) / (w - pad * 2)) * (hours.length - 1)), 0, hours.length - 1);
      return idx;
    };

    const showTooltip = (idx, clientX, clientY) => {
      if (!tip) return;
      const h1 = hours[idx];
      const t = new Date(h1.time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      tip.innerHTML = `<div class="tt">${escapeHtml(t)}</div>
        <div class="ttv">${escapeHtml(fmtTemp(h1.temperature, state.unit))}</div>
        <div class="muted">${escapeHtml(wmoToText(h1.weathercode))}</div>`;
      tip.hidden = false;
      const rect = canvas.getBoundingClientRect();
      const x0 = clientX - rect.left;
      const y0 = clientY - rect.top;
      tip.style.transform = `translate(${Math.round(x0)}px, ${Math.round(y0)}px)`;
    };

    canvas.addEventListener('pointermove', (e) => {
      const idx = locate(e.clientX, e.clientY);
      showTooltip(idx, e.clientX, e.clientY);
    });
    canvas.addEventListener('pointerleave', () => {
      if (tip) tip.hidden = true;
    });
    canvas.addEventListener('click', (e) => {
      const idx = locate(e.clientX, e.clientY);
      state.chartSelected = idx;
      // highlight corresponding card
      const card = els.hourly?.querySelector(`.hcard[data-idx="${idx}"]`);
      if (card) card.click();
      drawHourChart();
    });
  }
}

/* ---------------------------
   Favorites + dashboard
---------------------------- */
function samePlace(a, b) {
  return Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lon - b.lon) < 1e-6;
}

function isFavorite(p) {
  return state.favorites.some((f) => samePlace(f, p));
}

function renderFavButton() {
  if (!els.favBtn || !els.favIcon) return;
  const on = state.place && isFavorite(state.place);
  els.favIcon.textContent = on ? '★' : '☆';
  els.favBtn.setAttribute('aria-label', on ? 'Удалить из избранного' : 'Добавить в избранное');
}

function renderFavoritesList() {
  if (!els.favorites || !els.favHint) return;
  const favs = state.favorites;
  els.favHint.hidden = favs.length > 0;

  els.favorites.innerHTML = favs.map((f, i) => {
    const name = `${f.name}${f.country ? ', ' + f.country : ''}`;
    return `<button class="fav" type="button" data-i="${i}">
      <div class="fav__name">${escapeHtml(name)}</div>
      <div class="fav__meta muted">${escapeHtml(f.tz || '')}</div>
    </button>`;
  }).join('');

  $$('.fav', els.favorites).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const i = Number(btn.getAttribute('data-i'));
      state.place = { ...state.favorites[i] };
      state.selectedDay = null;
      savePrefs();
      setView('forecast');
      await refresh();
    });
  });
}

async function renderDashboard() {
  if (!els.dashboard || !els.dashHint) return;
  const favs = state.favorites.slice(0, 12);
  els.dashHint.hidden = favs.length > 0;
  if (favs.length === 0) {
    els.dashboard.innerHTML = '';
    return;
  }

  // skeleton
  els.dashboard.innerHTML = favs.map(() => `
    <div class="dashcard">
      <div class="dashcard__head">
        <div><div class="dashcard__name muted">…</div><div class="dashcard__meta muted">…</div></div>
        <div class="dashcard__temp muted">—</div>
      </div>
      <div class="dashcard__foot">
        <span class="pill muted">…</span><span class="pill muted">…</span>
      </div>
    </div>`).join('');

  const minis = await Promise.allSettled(favs.map(async (p) => {
    const wx = await fetchWeather(p);
    return wx.current;
  }));

  els.dashboard.innerHTML = favs.map((p, i) => {
    const mini = minis[i]?.status === 'fulfilled' ? minis[i].value : null;
    const name = `${p.name}${p.country ? ', ' + p.country : ''}`;
    return `<button class="dashcard" type="button" data-i="${i}">
      <div class="dashcard__head">
        <div><div class="dashcard__name">${escapeHtml(name)}</div><div class="dashcard__meta muted">${escapeHtml(p.tz || '')}</div></div>
        <div class="dashcard__temp">${escapeHtml(mini ? fmtTemp(mini.temperature, state.unit) : '—')}</div>
      </div>
      <div class="dashcard__foot">
        <span class="pill">${mini ? wmoToIcon(mini.weathercode, mini.is_day) : ''} ${escapeHtml(mini ? wmoToText(mini.weathercode) : '—')}</span>
        <span class="pill">Ветер: ${escapeHtml(mini ? fmtWind(mini.windspeed, state.unit) : '—')}</span>
      </div>
    </button>`;
  }).join('');

  $$('.dashcard', els.dashboard).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const i = Number(btn.getAttribute('data-i'));
      state.place = { ...state.favorites[i] };
      state.selectedDay = null;
      savePrefs();
      setView('forecast');
      await refresh();
    });
  });
}

/* ---------------------------
   Map (Leaflet)
---------------------------- */
function ensureMap() {
  if (state.mapReady || !els.map || typeof L === 'undefined') return;
  state.mapReady = true;

  state.map = L.map(els.map, { zoomControl: true, attributionControl: true }).setView([52.37, 4.90], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(state.map);

  state.marker = L.marker([52.37, 4.90]).addTo(state.map);

  state.map.on('click', async (e) => {
    const { lat, lng } = e.latlng;
    const p = { name: 'Выбранная точка', country: '', lat, lon: lng, tz: 'auto' };
    state.place = p;
    state.selectedDay = null;
    savePrefs();
    setView('forecast');
    await refresh();
  });
}

function updateMap() {
  if (!state.map || !state.marker || !state.place) return;
  const { lat, lon } = state.place;
  state.marker.setLatLng([lat, lon]);
  state.map.setView([lat, lon], 10, { animate: true });
}

/* ---------------------------
   Modal
---------------------------- */
function openModal(title, html) {
  if (!els.modal) return;
  if (els.modalTitle) els.modalTitle.textContent = title;
  if (els.modalBody) els.modalBody.innerHTML = html;
  els.modal.hidden = false;
  els.modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  if (!els.modal) return;
  els.modal.hidden = true;
  els.modal.setAttribute('aria-hidden', 'true');
  if (els.modalBody) els.modalBody.innerHTML = '';
}

function explainWeather() {
  const wx = state.wx;
  if (!wx) return { title: '—', text: '—' };
  const c = wx.current;
  const h0 = getDayHours()[0];
  const pop = Number.isFinite(h0?.precip_prob) ? Math.round(h0.precip_prob) : null;
  const windy = c.windspeed >= (state.unit === 'metric' ? 8 : 18);
  const humid = c.relativehumidity >= 75;

  if (pop != null && pop >= 60) return { title: 'Высокий шанс осадков', text: `В ближайший час вероятность около ${pop}%.` };
  if ([45, 48].includes(c.weathercode) || (humid && (pop == null || pop < 40))) return { title: 'Влажно/туман', text: 'При высокой влажности часто появляется дымка/туман.' };
  if (windy) return { title: 'Ветрено', text: 'Ветер меняет ощущаемую температуру и приносит фронты.' };
  return { title: wmoToText(c.weathercode), text: 'Оценка на основе текущих условий и ближайших часов.' };
}

/* ---------------------------
   Soundscape (very quiet, no assets)
---------------------------- */
const Sound = (() => {
  let ctx = null, master = null, src = null, filter = null, gain = null, thunderTimer = null;

  function start() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.04;
    master.connect(ctx.destination);

    filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;

    gain = ctx.createGain();
    gain.gain.value = 0;

    filter.connect(gain);
    gain.connect(master);

    // white noise buffer
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(filter);
    src.start();
  }

  function stop() {
    try { thunderTimer && clearInterval(thunderTimer); } catch {}
    thunderTimer = null;
    try { src && src.stop(); } catch {}
    try { ctx && ctx.close(); } catch {}
    ctx = null; master = null; src = null; filter = null; gain = null;
  }

  function setWeather(theme, wmo) {
    if (!state.sound) return;
    start();
    if (!gain || !filter) return;

    const isRain = theme === 'rain' || theme === 'storm';
    const isSnow = theme === 'snow';
    const isFog = theme === 'fog';

    const targetGain = isRain ? 0.28 : isSnow ? 0.18 : isFog ? 0.12 : 0.0;
    const targetFreq = isRain ? 900 : isSnow ? 1500 : isFog ? 700 : 1200;

    gain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.25);
    filter.frequency.setTargetAtTime(targetFreq, ctx.currentTime, 0.25);

    if ([95, 96, 99].includes(wmo)) {
      if (!thunderTimer) {
        thunderTimer = setInterval(() => {
          if (!ctx) return;
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.value = 55 + Math.random() * 35;
          g.gain.value = 0;
          o.connect(g); g.connect(master);
          const t0 = ctx.currentTime;
          g.gain.linearRampToValueAtTime(0.22, t0 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.8);
          o.start(t0); o.stop(t0 + 0.85);
        }, 5200 + Math.random() * 3200);
      }
    } else {
      thunderTimer && clearInterval(thunderTimer);
      thunderTimer = null;
    }
  }

  return { start, stop, setWeather };
})();

/* ---------------------------
   Offline handling
---------------------------- */
function setOfflineUI(isOffline) {
  if (!els.offlineScreen) return;
  els.offlineScreen.hidden = !isOffline;
}

function loadLastForecast() {
  const saved = readJSON(LS.lastForecast, null);
  if (!saved) return null;
  return saved;
}

function saveLastForecast(payload) {
  writeJSON(LS.lastForecast, payload);
}

/* ---------------------------
   Main refresh
---------------------------- */
function renderWidgetPreview() {
  if (!els.widgetPreview || !state.place || !state.wx) return;
  const c = state.wx.current;
  els.widgetPreview.textContent = `${state.place.name}: ${fmtTemp(c.temperature, state.unit)} • ${wmoToText(c.weathercode)} • Ветер ${fmtWind(c.windspeed, state.unit)}`;
}

function renderAll() {
  renderCurrent();
  renderTimeline();
  renderAlerts();
  renderHourly();
  renderDaily();
  renderFavButton();
  renderFavoritesList();
  renderWidgetPreview();
  updateMap();
  // sound
  if (state.wx) Sound.setWeather(weatherTheme(state.wx.current.weathercode, state.wx.current.is_day), state.wx.current.weathercode);
}

async function refresh() {
  if (!state.place) return;

  // online?
  if (!navigator.onLine) {
    const saved = loadLastForecast();
    if (saved && saved.place && saved.wx) {
      state.place = saved.place;
      state.wx = saved.wx;
      state.aqi = saved.aqi || null;
      state.selectedDay = state.selectedDay || (state.wx.current?.time?.slice(0, 10) ?? null);
      toast('Офлайн: показываю сохранённый прогноз');
      setOfflineUI(true);
      renderAll();
    } else {
      setOfflineUI(true);
      toast('Офлайн и нет сохранённого прогноза');
    }
    return;
  }

  setOfflineUI(false);

  try {
    const [wx, aqi] = await Promise.all([
      fetchWeather(state.place),
      fetchAir(state.place).catch(() => null),
      setOfflineUI(false);
    ]);
    state.wx = wx;
    state.aqi = aqi;

    const todayISO = wx.current?.time ? wx.current.time.slice(0, 10) : null;
    if (!state.selectedDay) state.selectedDay = todayISO;
    if (state.selectedDay && !wx.daily.some((d) => d.date === state.selectedDay)) {
      state.selectedDay = todayISO;
    }

    savePrefs();
    saveLastForecast({ place: state.place, wx: state.wx, aqi: state.aqi, savedAt: Date.now(), unit: state.unit });

    renderAll();
  } catch (e) {
    console.error(e);
    toast('Не удалось обновить данные. Проверь интернет.');
  }
}

/* ---------------------------
   Search + suggestions
---------------------------- */
function hideSuggestions() {
  if (els.suggestions) {
    els.suggestions.hidden = true;
    els.suggestions.innerHTML = '';
  }
  state.suggestions = [];
  state.sugIndex = -1;
}

function renderSuggestions() {
  if (!els.suggestions) return;
  const list = state.suggestions;
  if (list.length === 0) return hideSuggestions();

  els.suggestions.hidden = false;
  els.suggestions.innerHTML = list.map((s, i) => {
    const active = i === state.sugIndex;
    const name = `${s.name}${s.country ? ', ' + s.country : ''}`;
    return `<div class="sug ${active ? 'is-active' : ''}" role="option" tabindex="0" data-i="${i}">
      <div class="sug__name">${escapeHtml(name)}</div>
      <div class="sug__meta muted">${escapeHtml(s.tz || '')}</div>
    </div>`;
  }).join('');

  $$('.sug', els.suggestions).forEach((el) => {
    const i = Number(el.getAttribute('data-i'));
    const pick = async () => {
      state.place = state.suggestions[i];
      state.selectedDay = null;
      hideSuggestions();
      savePrefs();
      await refresh();
    };
    el.addEventListener('click', pick);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') pick(); });
  });
}

const updateSuggest = debounce(async () => {
  const q = els.cityInput?.value?.trim();
  if (!q || q.length < 2) return hideSuggestions();
  try {
    const list = await geocode(q);
    state.suggestions = list.slice(0, 10);
    state.sugIndex = -1;
    renderSuggestions();
  } catch {
    hideSuggestions();
  }
}, 200);

/* ---------------------------
   Geolocation
---------------------------- */
async function geoLocate() {
  if (!navigator.geolocation) {
    toast('Геолокация не поддерживается');
    return;
  }
  toast('Определяем местоположение…');
  const pos = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
  });
  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;

  // We keep a generic title (Open-Meteo reverse geocode isn't in this endpoint)
  state.place = { name: 'Моё место', country: '', lat, lon, tz: 'auto' };
  state.selectedDay = null;
  savePrefs();
  await refresh();
}

/* ---------------------------
   Events
---------------------------- */
function bindEvents() {
  // tabs
  els.tabs.forEach((t) => t.addEventListener('click', () => {
    const v = t.getAttribute('data-view');
    setView(v);
    if (v === 'forecast') {
      // map might be visible lower; keep lazy
    } else if (v === 'cities') {
      renderDashboard();
    }
  }));

  // settings button (shortcut)
  els.settingsBtn?.addEventListener('click', () => setView('settings'));

  // unit
  els.unitBtns.forEach((b) => b.addEventListener('click', async () => {
    const u = b.getAttribute('data-unit');
    if (!u || u === state.unit) return;
    state.unit = u === 'imperial' ? 'imperial' : 'metric';
    savePrefs();
    updateUnitUI();
    await refresh();
    // widget shares unit key
    localStorage.setItem(LS.unit, state.unit);
  }));
  updateUnitUI();

  // theme
  els.themeBtn?.addEventListener('click', () => {
    state.theme = state.theme === 'auto' ? 'dark' : state.theme === 'dark' ? 'light' : 'auto';
    savePrefs();
    applyThemeUI();
  });
  applyThemeUI();

  // settings toggles
  setToggle(els.soundToggle, state.sound);
  setToggle(els.a11yToggle, state.a11y);
  setToggle(els.refreshToggle, state.autoRefresh);

  els.soundToggle?.addEventListener('click', () => {
    state.sound = !state.sound;
    savePrefs();
    setToggle(els.soundToggle, state.sound);
    if (!state.sound) Sound.stop();
    else if (state.wx) Sound.setWeather(weatherTheme(state.wx.current.weathercode, state.wx.current.is_day), state.wx.current.weathercode);
  });
  els.a11yToggle?.addEventListener('click', () => {
    state.a11y = !state.a11y;
    savePrefs();
    setToggle(els.a11yToggle, state.a11y);
    applyA11yUI();
  });
  applyA11yUI();

  els.refreshToggle?.addEventListener('click', () => {
    state.autoRefresh = !state.autoRefresh;
    savePrefs();
    setToggle(els.refreshToggle, state.autoRefresh);
  });

  // search: typeahead + submit
  els.cityInput?.addEventListener('input', updateSuggest);
  els.cityInput?.addEventListener('keydown', (e) => {
    if (els.suggestions?.hidden) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.sugIndex = clamp(state.sugIndex + 1, 0, state.suggestions.length - 1);
      renderSuggestions();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.sugIndex = clamp(state.sugIndex - 1, -1, state.suggestions.length - 1);
      renderSuggestions();
    } else if (e.key === 'Enter') {
      if (state.suggestions.length > 0) {
        e.preventDefault();
        const pick = state.sugIndex >= 0 ? state.suggestions[state.sugIndex] : state.suggestions[0];
        state.place = pick;
        state.selectedDay = null;
        hideSuggestions();
        savePrefs();
        refresh();
      }
    } else if (e.key === 'Escape') {
      hideSuggestions();
    }
  });

  els.searchForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = els.cityInput?.value?.trim();
    if (!q) return;
    try {
      const list = await geocode(q);
      if (!list.length) {
        toast('Город не найден');
        return;
      }
      state.place = list[0];
      state.selectedDay = null;
      hideSuggestions();
      savePrefs();
      await refresh();
    } catch {
      toast('Не удалось найти город');
    }
  });

  // geo
  els.geoBtn?.addEventListener('click', () => geoLocate().catch(() => toast('Не удалось получить геолокацию')));

  // favorite star
  els.favBtn?.addEventListener('click', async () => {
    if (!state.place) return;
    const idx = state.favorites.findIndex((f) => samePlace(f, state.place));
    if (idx >= 0) {
      state.favorites.splice(idx, 1);
      toast('Удалено из избранного');
    } else {
      state.favorites.unshift({ ...state.place });
      toast('Добавлено в избранное');
    }
    savePrefs();
    renderFavButton();
    renderFavoritesList();
    renderDashboard();
  });

  // clear favorites
  els.clearFavBtn?.addEventListener('click', () => {
    state.favorites = [];
    savePrefs();
    renderFavoritesList();
    renderDashboard();
    toast('Избранное очищено');
  });

  // explain modal
  els.explainBtn?.addEventListener('click', () => {
    const expl = explainWeather();
    const c = state.wx?.current;
    openModal('Почему так?', `
      <div class="modal-grid">
        <div class="modal-col">
          <div class="muted">Коротко</div>
          <div style="font-weight:900;font-size:16px;letter-spacing:-.2px">${escapeHtml(expl.title)}</div>
          <div class="muted">${escapeHtml(expl.text)}</div>
        </div>
        <div class="modal-col">
          <div class="muted">Сейчас</div>
          <div class="pill-row">
            <div class="pill">Ощущается: <b>${escapeHtml(fmtTemp(c?.apparent_temperature, state.unit))}</b></div>
            <div class="pill">Ветер: <b>${escapeHtml(fmtWind(c?.windspeed, state.unit))}</b></div>
            <div class="pill">Влажность: <b>${Number.isFinite(c?.relativehumidity) ? Math.round(c.relativehumidity) + '%' : '—'}</b></div>
          </div>
        </div>
      </div>
    `);
  });

  // compare modal
  els.compareBtn?.addEventListener('click', () => {
    if (!state.wx?.daily?.length) return;
    const opts = state.wx.daily.slice(0, 7).map((d) => {
      const s = new Date(d.date).toLocaleDateString('ru-RU', { weekday: 'short', day: '2-digit', month: 'short' });
      return `<option value="${d.date}">${escapeHtml(s)}</option>`;
    }).join('');
    openModal('Сравнение дней', `
      <div class="compare">
        <div class="compare__row"><label class="muted">День 1</label><select class="select" id="cmpA">${opts}</select></div>
        <div class="compare__row"><label class="muted">День 2</label><select class="select" id="cmpB">${opts}</select></div>
        <button class="btn btn--primary" id="cmpGo" type="button">Сравнить</button>
        <div id="cmpOut"></div>
      </div>
    `);
    const a = document.getElementById('cmpA');
    const b = document.getElementById('cmpB');
    const go = document.getElementById('cmpGo');
    const out = document.getElementById('cmpOut');
    if (b) b.selectedIndex = Math.min(1, b.options.length - 1);
    go?.addEventListener('click', () => {
      const da = state.wx.daily.find((d) => d.date === a.value);
      const db = state.wx.daily.find((d) => d.date === b.value);
      if (!da || !db) return;
      const row = (k, va, vb) => `
        <div class="compare__item">
          <div class="muted">${escapeHtml(k)}</div>
          <div class="compare__vals"><b>${escapeHtml(va)}</b><span class="muted">vs</span><b>${escapeHtml(vb)}</b></div>
        </div>`;
      out.innerHTML = `
        <div class="compare__grid">
          ${row('Макс/мин', `${fmtTemp(da.temp_max, state.unit)} / ${fmtTemp(da.temp_min, state.unit)}`, `${fmtTemp(db.temp_max, state.unit)} / ${fmtTemp(db.temp_min, state.unit)}`)}
          ${row('Осадки', `${Math.round(da.precip_sum || 0)} мм`, `${Math.round(db.precip_sum || 0)} мм`)}
          ${row('Вероятность осадков', `${Math.round(da.precip_prob_max || 0)}%`, `${Math.round(db.precip_prob_max || 0)}%`)}
          ${row('УФ-индекс', `${Number.isFinite(da.uv_max) ? da.uv_max.toFixed(1) : '—'}`, `${Number.isFinite(db.uv_max) ? db.uv_max.toFixed(1) : '—'}`)}
        </div>`;
    });
    setTimeout(() => go?.click(), 0);
  });

  // modal close
  els.modal?.addEventListener('click', (e) => {
    const close = e.target?.getAttribute?.('data-close') === '1' || e.target?.closest?.('[data-close=\"1\"]');
    if (close) closeModal();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // offline try
  els.offlineTry?.addEventListener('click', () => refresh());

  // online/offline events
  window.addEventListener('online', () => { setOfflineUI(false); refresh(); });
  window.addEventListener('offline', () => { 
  if (!navigator.onLine) setOfflineUI(true);
  });


  // lazy map init when scrolled into view
  const obs = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) {
        ensureMap();
        obs.disconnect();
        break;
      }
    }
  }, { root: null, threshold: 0.2 });
  if (els.map) obs.observe(els.map);
}

/* ---------------------------
   Boot
---------------------------- */
async function boot() {
  bindEvents();

  // service worker
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./sw.js'); } catch {}
  }

  // initial place fallback
  if (!state.place) {
    state.place = { name: 'Amsterdam', country: 'NL', lat: 52.3676, lon: 4.9041, tz: 'auto' };
  }

  // render favorites sections early
  renderFavoritesList();
  renderDashboard();
  renderFavButton();
  renderWidgetPreview();

  await refresh();

  // auto refresh
  setInterval(() => {
    if (state.autoRefresh && document.visibilityState === 'visible') refresh();
  }, 30 * 60 * 1000);

  // refresh on focus
  document.addEventListener('visibilitychange', () => {
    if (state.autoRefresh && document.visibilityState === 'visible') refresh();
  });
}

boot();
