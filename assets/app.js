import { fmtTemp, fmtWind, fmtKm, fmtPressure, wmoToText, clamp, debounce, toast, fmtClock, weatherTheme } from './ui.js';

const state = {
  unit: 'metric', // metric (°C, m/s) | imperial (°F, mph)
  theme: 'auto',
  place: null, // {name, country, lat, lon, tz}
  favorites: [],
  map: null,
  marker: null,
  suggestions: [],
  sugIndex: -1,
  selectedDay: null,
};

const els = {
  app: document.documentElement,
  form: document.getElementById('searchForm'),
  input: document.getElementById('cityInput'),
  suggestions: document.getElementById('suggestions'),
  geoBtn: document.getElementById('geoBtn'),
  temp: document.getElementById('temp'),
  summary: document.getElementById('summary'),
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
  placeTitle: document.getElementById('placeTitle'),
  placeKicker: document.getElementById('placeKicker'),
  placeMeta: document.getElementById('placeMeta'),
  hourly: document.getElementById('hourly'),
  daily: document.getElementById('daily'),
  hourlyMeta: document.getElementById('hourlyMeta'),
  dailyMeta: document.getElementById('dailyMeta'),
  favBtn: document.getElementById('favBtn'),
  favIcon: document.getElementById('favIcon'),
  favorites: document.getElementById('favorites'),
  favHint: document.getElementById('favHint'),
  clearFavBtn: document.getElementById('clearFavBtn'),
  themeBtn: document.getElementById('themeBtn'),
  notice: document.getElementById('notice'),
  noticeText: document.getElementById('noticeText'),
};


function setLoading(on){
  els.app.classList.toggle('is-loading', !!on);
  document.body.setAttribute('aria-busy', on ? 'true' : 'false');
}

async function updateSuggestions(q){
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', q);
  url.searchParams.set('count', '7');
  url.searchParams.set('language', 'ru');
  url.searchParams.set('format', 'json');

  const res = await fetch(url);
  if(!res.ok){ hideSuggestions(); return; }
  const data = await res.json();
  const results = data.results || [];
  state.suggestions = results.map(r => ({
    name: r.name,
    country: r.country,
    admin1: r.admin1,
    lat: r.latitude,
    lon: r.longitude,
    tz: r.timezone || 'auto',
  }));
  renderSuggestions();
}

function renderSuggestions(){
  const box = els.suggestions;
  const items = state.suggestions;
  if(!items.length){ hideSuggestions(); return; }
  state.sugIndex = -1;
  box.innerHTML = items.map((s, i)=>{
    const sub = [s.admin1, s.country].filter(Boolean).join(', ');
    return `<div class="suggestion" role="option" data-i="${i}" aria-selected="false">
      <div>
        <div class="suggestion__main">${escapeHtml(s.name)}</div>
        <div class="suggestion__sub">${escapeHtml(sub)}</div>
      </div>
    </div>`;
  }).join('');
  box.hidden = false;

  box.querySelectorAll('.suggestion').forEach(el=>{
    el.addEventListener('mousedown', (e)=>{
      e.preventDefault(); // keep focus
      const i = Number(el.dataset.i);
      pickSuggestion(i);
    });
  });
}

function hideSuggestions(){
  els.suggestions.hidden = true;
  els.suggestions.innerHTML = '';
  state.suggestions = [];
  state.sugIndex = -1;
}

function handleSuggestKeydown(e){
  if(els.suggestions.hidden) return;
  const max = state.suggestions.length - 1;
  if(e.key === 'ArrowDown'){
    e.preventDefault();
    state.sugIndex = clamp(state.sugIndex + 1, 0, max);
    updateSuggestActive();
  }else if(e.key === 'ArrowUp'){
    e.preventDefault();
    state.sugIndex = clamp(state.sugIndex - 1, 0, max);
    updateSuggestActive();
  }else if(e.key === 'Enter'){
    if(state.sugIndex >= 0){
      e.preventDefault();
      pickSuggestion(state.sugIndex);
    }
  }else if(e.key === 'Escape'){
    hideSuggestions();
  }
}

function updateSuggestActive(){
  const nodes = [...els.suggestions.querySelectorAll('.suggestion')];
  nodes.forEach((n, i)=> n.setAttribute('aria-selected', i === state.sugIndex ? 'true' : 'false'));
  const active = nodes[state.sugIndex];
  active?.scrollIntoView({ block: 'nearest' });
}

async function pickSuggestion(i){
  const s = state.suggestions[i];
  if(!s) return;
  hideSuggestions();
  els.input.value = s.name;
  state.place = { name: s.name, country: s.country, lat: s.lat, lon: s.lon, tz: s.tz };
  setHeader(state.place);
  setFavoriteUI();
  flyTo(state.place.lat, state.place.lon);
  await loadWeather();
}

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, (m)=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

function saveLastForecast(wx, aq){
  try{
    const payload = { ts: Date.now(), unit: state.unit, place: state.place, wx, aq };
    localStorage.setItem('wv:lastForecast', JSON.stringify(payload));
  }catch{}
}

function restoreLastForecast(){
  try{
    const raw = localStorage.getItem('wv:lastForecast');
    if(!raw) return false;
    const data = JSON.parse(raw);
    if(!data?.wx || !data?.place) return false;
    state.place = data.place;
    setHeader(state.place);
    renderCurrent(data.wx, data.aq);
    renderHourly(data.wx);
    renderDaily(data.wx);
    showNotice('Вы оффлайн. Показан последний сохранённый прогноз.');
    return true;
  }catch{
    return false;
  }
}

function tryOfflineFallback(){
  if(navigator.onLine) return false;
  return restoreLastForecast();
}

function registerSW(){
  if(!('serviceWorker' in navigator)) return;
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  });
}

boot();

function boot(){
  loadPrefs();
  bindUI();
  initMap();
  registerSW();
  window.addEventListener('online', ()=> toast('Снова онлайн'));
  // Если оффлайн — покажем последний прогноз из кэша
  if(!navigator.onLine){ restoreLastForecast(); }

  // Старт: геолокация, иначе — Амстердам
  geoLocate().catch(() => searchCity('Amsterdam'));
}

function loadPrefs(){
  try{
    state.favorites = JSON.parse(localStorage.getItem('wv:favorites')||'[]');
  }catch{ state.favorites = []; }
  state.unit = localStorage.getItem('wv:unit') || 'metric';
  const theme = localStorage.getItem('wv:theme') || 'auto';
  setTheme(theme);
  setUnit(state.unit);
  renderFavorites();
}

function bindUI(){
  els.form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const q = els.input.value.trim();
    if(!q) return;
    await searchCity(q);
  });

  // Autocomplete
  els.input.addEventListener('input', debounce(async ()=>{
    const q = els.input.value.trim();
    if(q.length < 2){ hideSuggestions(); return; }
    await updateSuggestions(q);
  }, 250));

  els.input.addEventListener('keydown', handleSuggestKeydown);
  els.input.addEventListener('blur', ()=> setTimeout(hideSuggestions, 120));

  els.geoBtn.addEventListener('click', async ()=>{
    await geoLocate();
  });

  // Unit segmented
  document.querySelectorAll('.seg__btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const unit = btn.dataset.unit;
      setUnit(unit);
      localStorage.setItem('wv:unit', unit);
      if(state.place) refresh();
    });
  });

  els.themeBtn.addEventListener('click', ()=>{
    const current = localStorage.getItem('wv:theme') || 'auto';
    const next = current === 'auto' ? 'dark' : current === 'dark' ? 'light' : 'auto';
    setTheme(next);
    localStorage.setItem('wv:theme', next);
    toast(`Тема: ${next === 'auto' ? 'системная' : next}`);
  });

  els.favBtn.addEventListener('click', ()=>{
    if(!state.place) return;
    toggleFavorite(state.place);
  });

  els.clearFavBtn.addEventListener('click', ()=>{
    state.favorites = [];
    localStorage.setItem('wv:favorites', JSON.stringify(state.favorites));
    renderFavorites();
    toast('Избранное очищено');
  });

  // QoL: debounce suggestions later — пока только Enter/submit
  els.input.addEventListener('input', debounce(()=>{
    els.notice.hidden = true;
  }, 250));
}

function setUnit(unit){
  state.unit = unit;
  document.querySelectorAll('.seg__btn').forEach(b=>{
    const on = b.dataset.unit === unit;
    b.setAttribute('aria-pressed', on ? 'true':'false');
  });
}

function setTheme(theme){
  // theme: auto|light|dark
  if(theme === 'auto'){
    els.app.removeAttribute('data-theme');
  }else{
    els.app.setAttribute('data-theme', theme);
  }
}

async function geoLocate(){
  if(!navigator.geolocation){
    toast('Геолокация не поддерживается');
    return searchCity('Amsterdam');
  }
  toast('Определяем местоположение…');
  const pos = await new Promise((resolve, reject)=>{
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy:true, timeout: 10000 });
  });
  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;
  const place = await reverseGeocode(lat, lon);
  state.place = place;
  await refresh();
}

async function searchCity(query){
  toast('Ищем город…');
  const place = await geocode(query);
  state.place = place;
  await refresh();
}

async function refresh(){
  const p = state.place;
  if(!p) return;

  setHeader(p);
  setFavoriteUI();

  setLoading(true);
  // Weather + AQ parallel (AQ optional)
  try{
    const [wx, aq] = await Promise.all([
      fetchWeather(p.lat, p.lon, p.tz, state.unit),
      fetchAirQuality(p.lat, p.lon, p.tz).catch(()=>null),
    ]);

    state.wx = wx;
    const todayISO = wx.current.time.slice(0,10);
    if(!state.selectedDay) state.selectedDay = todayISO;
    // if selected day is out of range, reset
    const hasDay = wx.daily && wx.daily.some(d=>d.date===state.selectedDay);
    if(!hasDay) state.selectedDay = todayISO;

    renderCurrent(wx, aq);
    renderHourly(wx);
    renderDaily(wx);
    saveLastForecast(wx, aq);
    setLoading(false);
    updateMap(p.lat, p.lon, p.name);
    await renderFavorites(true);

    setLoading(false);
  }catch(err){
    console.error(err);
    showNotice('Не удалось загрузить данные. Проверь соединение и попробуй ещё раз.');
    toast('Ошибка загрузки');
  }
}

function setHeader(p){
  els.placeKicker.textContent = p.country || '—';
  els.placeTitle.textContent = p.name;
  const meta = `${p.lat.toFixed(3)}, ${p.lon.toFixed(3)} • ${p.tz}`;
  els.placeMeta.textContent = meta;
}

function showNotice(text){
  els.noticeText.textContent = text;
  els.notice.hidden = false;
}

function setFavoriteUI(){
  const on = state.place && state.favorites.some(f => samePlace(f, state.place));
  els.favIcon.textContent = on ? '★' : '☆';
  els.favBtn.setAttribute('aria-label', on ? 'Убрать из избранного' : 'Добавить в избранное');
}

function toggleFavorite(place){
  const idx = state.favorites.findIndex(f => samePlace(f, place));
  if(idx >= 0){
    state.favorites.splice(idx, 1);
    toast('Удалено из избранного');
  }else{
    state.favorites.unshift({ name: place.name, country: place.country, lat: place.lat, lon: place.lon, tz: place.tz });
    state.favorites = state.favorites.slice(0, 24);
    toast('Добавлено в избранное');
  }
  localStorage.setItem('wv:favorites', JSON.stringify(state.favorites));
  setFavoriteUI();
  renderFavorites();
}

function samePlace(a,b){
  return Math.abs(a.lat-b.lat) < 1e-6 && Math.abs(a.lon-b.lon) < 1e-6;
}

async function renderFavorites(withTemps=false){
  const favs = state.favorites;
  els.favorites.innerHTML = '';
  els.favHint.hidden = favs.length > 0;

  if(favs.length === 0) return;

  let temps = null;
  if(withTemps){
    temps = await Promise.allSettled(favs.slice(0,10).map(f=>fetchMini(f.lat,f.lon,f.tz,state.unit)));
  }

  favs.forEach((f, i)=>{
    const row = document.createElement('div');
    row.className = 'fav';
    row.tabIndex = 0;
    row.role = 'button';
    row.setAttribute('aria-label', `Открыть ${f.name}`);

    const left = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'fav__name';
    name.textContent = f.name;
    const meta = document.createElement('div');
    meta.className = 'fav__meta';
    meta.textContent = f.country || '—';
    left.append(name, meta);

    const right = document.createElement('div');
    right.className = 'fav__temp';

    if(withTemps && temps && temps[i] && temps[i].status === 'fulfilled'){
      right.textContent = fmtTemp(temps[i].value.temp, state.unit);
    }else{
      right.textContent = '—';
    }

    row.append(left, right);

    const open = async ()=>{
      state.place = { ...f };
      await refresh();
    };
    row.addEventListener('click', open);
    row.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' ') open(); });

    els.favorites.appendChild(row);
  });
}

function renderCurrent(wx, aq){
  const c = wx.current;
  // Dynamic background theme
  els.app.setAttribute('data-weather', weatherTheme(c.weathercode, c.is_day));
  els.temp.textContent = fmtTemp(c.temperature, state.unit);
  els.summary.textContent = wmoToText(c.weathercode);
  els.feels.textContent = fmtTemp(c.apparent_temperature, state.unit);
  els.wind.textContent = fmtWind(c.windspeed, state.unit);
  els.humidity.textContent = `${Math.round(c.relativehumidity)}%`;

  els.pressure.textContent = fmtPressure(c.pressure);
  els.uv.textContent = (Number.isFinite(c.uv_index) ? c.uv_index.toFixed(1) : '—');
  els.visibility.textContent = fmtKm(c.visibility_km);

  // Details (next hour + today)
  const h0 = wx.hourly?.[0];
  const prob = Number.isFinite(h0?.precip_prob) ? `${Math.round(h0.precip_prob)}%` : '—';
  els.precipChance.textContent = prob;
  els.dewPoint.textContent = fmtTemp(h0?.dewpoint, state.unit);
  els.sunrise.textContent = fmtClock(wx.daily?.[0]?.sunrise);
  els.sunset.textContent = fmtClock(wx.daily?.[0]?.sunset);

  const nowLocal = new Date(c.time);
  const ts = nowLocal.toLocaleString('ru-RU', { weekday:'long', day:'2-digit', month:'long', hour:'2-digit', minute:'2-digit' });

  const aqText = aq?.us_aqi ? ` • AQI ${aq.us_aqi} (${aq.label})` : '';
  els.placeMeta.textContent = `${ts}${aqText}`;

  if(aq?.us_aqi && aq.us_aqi >= 101){
    showNotice(`Качество воздуха: ${aq.label} (AQI ${aq.us_aqi}). Ограничь длительные нагрузки на улице.`);
  }else{
    els.notice.hidden = true;
  }
}

function renderHourly(wx){
  const dayISO = state.selectedDay || wx.current.time.slice(0,10);
  els.hourly.innerHTML = '';
  const hours = wx.hourly;
  const meta = `${new Date(dayISO).toLocaleDateString('ru-RU',{weekday:'long', day:'2-digit', month:'long'})} • почасовой прогноз`;
  els.hourlyMeta.textContent = meta;

  const dayHours = hours.filter(h => h.time.startsWith(dayISO));
  (dayHours.length ? dayHours.slice(0,24) : hours.slice(0,24)).forEach(h=>{
    const item = document.createElement('div');
    item.className = 'hour';
    item.role = 'listitem';

    const t = document.createElement('div');
    t.className = 'hour__t';
    t.textContent = new Date(h.time).toLocaleTimeString('ru-RU',{hour:'2-digit', minute:'2-digit'});

    const v = document.createElement('div');
    v.className = 'hour__v';
    v.textContent = fmtTemp(h.temperature, state.unit);

    const m = document.createElement('div');
    m.className = 'hour__m';
    m.innerHTML = `<span>${wmoToText(h.weathercode)}</span><span>${fmtWind(h.windspeed, state.unit)}</span>`;

    item.append(t,v,m);
    els.hourly.appendChild(item);
  });
}

function renderDaily(wx){
  els.daily.innerHTML = '';
  els.dailyMeta.textContent = `Макс/мин • осадки • УФ`;

  wx.daily.forEach(d=>{
    const row = document.createElement('div');
    row.className = 'day' + ((state.selectedDay||wx.current.time.slice(0,10))===d.date ? ' day--active' : '');
    row.dataset.date = d.date;
    row.addEventListener('click', ()=>{
      state.selectedDay = d.date;
      renderDaily(state.wx || wx);
      renderHourly(state.wx || wx);
    });
    row.role = 'listitem';

    const left = document.createElement('div');
    left.className = 'day__l';

    const name = document.createElement('div');
    name.className = 'day__name';
    name.textContent = new Date(d.date).toLocaleDateString('ru-RU', { weekday:'long' });

    const desc = document.createElement('div');
    desc.className = 'day__desc';
    const pr = Number.isFinite(d.precip_mm) ? `${Math.round(d.precip_mm)} мм` : '—';
    const uv = Number.isFinite(d.uv_max) ? `УФ ${d.uv_max.toFixed(0)}` : 'УФ —';
    desc.textContent = `${wmoToText(d.weathercode)} • ${pr} • ${uv}`;

    left.append(name, desc);

    const right = document.createElement('div');
    right.className = 'day__r';
    const hi = document.createElement('div');
    hi.className = 'day__hi';
    hi.textContent = fmtTemp(d.temp_max, state.unit);
    const lo = document.createElement('div');
    lo.className = 'day__lo';
    lo.textContent = fmtTemp(d.temp_min, state.unit);

    right.append(hi, lo);
    row.append(left, right);

    els.daily.appendChild(row);
  });
}

function initMap(){
  const map = L.map('map', { zoomControl: true, scrollWheelZoom: false });
  state.map = map;

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  map.setView([52.3676, 4.9041], 9);
}

function updateMap(lat, lon, label){
  if(!state.map) return;
  state.map.setView([lat, lon], 10, { animate:true });
  if(state.marker) state.marker.remove();
  state.marker = L.marker([lat, lon]).addTo(state.map).bindPopup(label).openPopup();
}

// ---- API (Open-Meteo) ----

async function geocode(query){
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', query);
  url.searchParams.set('count', '1');
  url.searchParams.set('language', 'ru');
  url.searchParams.set('format', 'json');

  const res = await fetch(url);
  if(!res.ok) throw new Error('Geocode failed');
  const data = await res.json();
  const r = data?.results?.[0];
  if(!r) throw new Error('City not found');
  return {
    name: r.name,
    country: r.country,
    lat: r.latitude,
    lon: r.longitude,
    tz: r.timezone || 'auto',
  };
}

async function reverseGeocode(lat, lon){
  // Open‑Meteo geocoder does not provide reverse in all regions.
  // We'll do a small search by rounding and using "name" fallback: use Nominatim as a lightweight reverse.
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format','jsonv2');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('accept-language','ru');

  const res = await fetch(url, { headers: { 'User-Agent': 'WeatherVision (github pages)' } });
  if(!res.ok) throw new Error('Reverse failed');
  const data = await res.json();
  const name = data?.address?.city || data?.address?.town || data?.address?.village || data?.name || 'Ваше местоположение';
  const country = data?.address?.country || '';
  // timezone: let Open-Meteo decide based on coords (auto)
  return { name, country, lat, lon, tz: 'auto' };
}

async function fetchWeather(lat, lon, tz, unit){
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('timezone', tz === 'auto' ? 'auto' : tz);

  // Current
  url.searchParams.set('current', [
    'temperature_2m',
    'relativehumidity_2m',
    'apparent_temperature',
    'weathercode',
    'wind_speed_10m',
    'pressure_msl',
    'visibility',
    'is_day',
  ].join(','));

  // Hourly
  url.searchParams.set('hourly', [
    'temperature_2m',
    'weathercode',
    'wind_speed_10m',
    'apparent_temperature',
    'dew_point_2m',
    'precipitation_probability',
  ].join(','));

  // Daily
  url.searchParams.set('daily', [
    'weathercode',
    'temperature_2m_max',
    'temperature_2m_min',
    'precipitation_sum',
    'uv_index_max',
    'sunrise',
    'sunset',
    'precipitation_probability_max',
  ].join(','));

  url.searchParams.set('forecast_days', '7');

  // units
  if(unit === 'imperial'){
    url.searchParams.set('temperature_unit','fahrenheit');
    url.searchParams.set('wind_speed_unit','mph');
  }else{
    url.searchParams.set('temperature_unit','celsius');
    url.searchParams.set('wind_speed_unit','ms');
  }

  const res = await fetch(url);
  if(!res.ok) throw new Error('Weather failed');
  const data = await res.json();

  const current = {
    time: data.current.time,
    temperature: data.current.temperature_2m,
    relativehumidity: data.current.relativehumidity_2m,
    apparent_temperature: data.current.apparent_temperature,
    weathercode: data.current.weathercode,
    windspeed: data.current.wind_speed_10m,
    pressure: data.current.pressure_msl,
    visibility_km: (data.current.visibility ?? 0) / 1000,
    is_day: data.current.is_day ?? 1,
    uv_index: data.daily?.uv_index_max?.[0] ?? NaN,
  };

  const hourly = data.hourly.time.map((t, i) => ({
    time: t,
    temperature: data.hourly.temperature_2m[i],
    weathercode: data.hourly.weathercode[i],
    windspeed: data.hourly.wind_speed_10m[i],
    apparent: data.hourly.apparent_temperature?.[i],
    dewpoint: data.hourly.dew_point_2m?.[i],
    precip_prob: data.hourly.precipitation_probability?.[i],
  }));

  const daily = data.daily.time.map((d, i) => ({
    date: d,
    weathercode: data.daily.weathercode[i],
    temp_max: data.daily.temperature_2m_max[i],
    temp_min: data.daily.temperature_2m_min[i],
    precip_mm: data.daily.precipitation_sum[i],
    uv_max: data.daily.uv_index_max[i],
    sunrise: data.daily.sunrise?.[i],
    sunset: data.daily.sunset?.[i],
    precip_prob_max: data.daily.precipitation_probability_max?.[i],
  }));

  return { current, hourly, daily };
}

async function fetchAirQuality(lat, lon, tz){
  const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('timezone', tz === 'auto' ? 'auto' : tz);
  url.searchParams.set('hourly', 'us_aqi');

  const res = await fetch(url);
  if(!res.ok) throw new Error('AQ failed');
  const data = await res.json();
  const aqi = data?.hourly?.us_aqi?.[0];
  if(!Number.isFinite(aqi)) return null;
  const label = aqi<=50 ? 'Хорошо' : aqi<=100 ? 'Умеренно' : aqi<=150 ? 'Вредно для чувствительных' : aqi<=200 ? 'Вредно' : aqi<=300 ? 'Очень вредно' : 'Опасно';
  return { us_aqi: Math.round(aqi), label };
}

async function fetchMini(lat, lon, tz, unit){
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('timezone', tz === 'auto' ? 'auto' : tz);
  url.searchParams.set('current', 'temperature_2m');
  if(unit === 'imperial') url.searchParams.set('temperature_unit','fahrenheit');
  const res = await fetch(url);
  if(!res.ok) throw new Error('mini failed');
  const data = await res.json();
  return { temp: data.current.temperature_2m };
}
