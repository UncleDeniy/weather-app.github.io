
import { fmtTemp } from './ui.js';

const els = {
  city: document.getElementById('wCity'),
  sub: document.getElementById('wSub'),
  temp: document.getElementById('wTemp'),
  unit: document.getElementById('wUnit'),
  desc: document.getElementById('wDesc'),
  feels: document.getElementById('wFeels'),
  wind: document.getElementById('wWind'),
  icon: document.getElementById('wIcon'),
  svg: document.getElementById('wSvg'),
  tip: document.getElementById('wTip'),
  hours: document.getElementById('wHours'),
  refresh: document.getElementById('wRefresh'),
  openApp: document.getElementById('wOpenApp'),
  offline: document.getElementById('wOffline'),
  bg: document.getElementById('bgLayer'),
};

const TZ = 'auto';
let state = {
  unit: (localStorage.getItem('wv:unit') || 'metric') === 'imperial' ? 'imperial' : 'metric',
  place: null,
  wx: null,
  activeIdx: 0,
};

function readLast(){
  try{
    const raw = localStorage.getItem('wv:lastForecast');
    if(!raw) return null;
    return JSON.parse(raw);
  }catch{ return null; }
}

function saveLast(payload){
  try{ localStorage.setItem('wv:lastForecast', JSON.stringify(payload)); }catch{}
}

function weatherBucket(code){
  // Open-Meteo weathercode mapping buckets
  if(code === 0) return 'clear';
  if([1,2,3].includes(code)) return 'cloud';
  if([45,48].includes(code)) return 'fog';
  if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return 'rain';
  if([71,73,75,77,85,86].includes(code)) return 'snow';
  if([95,96,99].includes(code)) return 'storm';
  return 'cloud';
}

function weatherText(code){
  const map = new Map([
    [0,'Ясно'],
    [1,'Преимущественно ясно'],
    [2,'Переменная облачность'],
    [3,'Пасмурно'],
    [45,'Туман'], [48,'Иней/туман'],
    [51,'Морось слабая'], [53,'Морось'], [55,'Морось сильная'],
    [61,'Дождь слабый'], [63,'Дождь'], [65,'Дождь сильный'],
    [71,'Снег слабый'], [73,'Снег'], [75,'Снег сильный'], [77,'Снежные зёрна'],
    [80,'Ливни слабые'], [81,'Ливни'], [82,'Ливни сильные'],
    [85,'Снегопад'], [86,'Сильный снегопад'],
    [95,'Гроза'], [96,'Гроза с градом'], [99,'Сильная гроза с градом'],
  ]);
  return map.get(code) || 'Погода';
}

function iconSVG(bucket, isDay=true, size=74){
  // Minimal animated SVG icons (self-contained)
  const common = `
  <style>
    .rot{ transform-origin: 50% 50%; animation: rot 6s linear infinite; }
    .float{ animation: float 3.2s ease-in-out infinite; }
    .drip{ animation: drip 1.1s linear infinite; }
    .drip2{ animation: drip 1.1s linear infinite .35s; }
    .flake{ animation: flake 2.8s linear infinite; }
    .bolt{ animation: bolt 2.2s ease-in-out infinite; }
    @keyframes rot{ to{ transform: rotate(360deg);} }
    @keyframes float{ 0%,100%{ transform: translateY(0);} 50%{ transform: translateY(3px);} }
    @keyframes drip{ from{ transform: translateY(-2px); opacity:.0;} 10%{opacity:.8;} to{ transform: translateY(10px); opacity:0;} }
    @keyframes flake{ from{ transform: translateY(-2px); opacity:.0;} 10%{opacity:.85;} to{ transform: translateY(10px); opacity:0;} }
    @keyframes bolt{ 0%,78%,100%{ opacity:.0;} 80%{ opacity:.9;} 84%{opacity:.0;} }
  </style>`;
  const sun = `
  <g>
    <circle cx="38" cy="38" r="12" fill="rgba(255,220,120,.95)"/>
    <g class="rot" opacity=".95">
      ${Array.from({length:8}).map((_,i)=>`<rect x="37" y="9" width="2" height="8" rx="1" fill="rgba(255,220,120,.9)" transform="rotate(${i*45} 38 38)"/>`).join('')}
    </g>
  </g>`;
  const moon = `
  <g opacity=".95">
    <path d="M48 30c-2 10-12 18-22 15 7 5 18 3 24-6 2-3 3-6 3-9-2 1-4 1-5 0z" fill="rgba(200,220,255,.9)"/>
    <circle cx="30" cy="30" r="2" fill="rgba(255,255,255,.55)"/>
    <circle cx="24" cy="38" r="1.5" fill="rgba(255,255,255,.45)"/>
  </g>`;
  const cloud = `
  <g class="float" opacity=".95">
    <path d="M22 48h30a10 10 0 0 0 0-20 14 14 0 0 0-27-3A9 9 0 0 0 22 48z"
      fill="rgba(255,255,255,.55)"/>
  </g>`;
  const rain = `
  <g opacity=".95">
    ${cloud}
    <g>
      <path class="drip" d="M28 52c2 3 2 6 0 8" stroke="rgba(120,200,255,.85)" stroke-width="2" stroke-linecap="round"/>
      <path class="drip2" d="M40 52c2 3 2 6 0 8" stroke="rgba(120,200,255,.85)" stroke-width="2" stroke-linecap="round"/>
      <path class="drip" style="animation-delay:.55s" d="M34 54c2 3 2 6 0 8" stroke="rgba(120,200,255,.75)" stroke-width="2" stroke-linecap="round"/>
    </g>
  </g>`;
  const snow = `
  <g opacity=".95">
    ${cloud}
    <g>
      <circle class="flake" cx="28" cy="56" r="1.4" fill="rgba(255,255,255,.9)"/>
      <circle class="flake" style="animation-delay:.4s" cx="36" cy="54" r="1.4" fill="rgba(255,255,255,.85)"/>
      <circle class="flake" style="animation-delay:.8s" cx="44" cy="56" r="1.4" fill="rgba(255,255,255,.9)"/>
    </g>
  </g>`;
  const fog = `
  <g opacity=".9">
    ${cloud}
    <g opacity=".75">
      <path d="M18 56h40" stroke="rgba(255,255,255,.35)" stroke-width="2" stroke-linecap="round"/>
      <path d="M22 61h36" stroke="rgba(255,255,255,.28)" stroke-width="2" stroke-linecap="round"/>
      <path d="M20 66h42" stroke="rgba(255,255,255,.22)" stroke-width="2" stroke-linecap="round"/>
    </g>
  </g>`;
  const storm = `
  <g opacity=".95">
    ${cloud}
    <path class="bolt" d="M34 50l-6 12h6l-4 10 12-16h-6l4-6z" fill="rgba(255,220,120,.95)"/>
    <path class="drip" d="M26 54c2 3 2 6 0 8" stroke="rgba(120,200,255,.75)" stroke-width="2" stroke-linecap="round"/>
    <path class="drip2" d="M44 54c2 3 2 6 0 8" stroke="rgba(120,200,255,.75)" stroke-width="2" stroke-linecap="round"/>
  </g>`;
  const base = isDay ? sun : moon;
  let overlay = cloud;
  if(bucket==='clear') overlay = '';
  if(bucket==='cloud') overlay = cloud;
  if(bucket==='rain') overlay = rain;
  if(bucket==='snow') overlay = snow;
  if(bucket==='fog') overlay = fog;
  if(bucket==='storm') overlay = storm;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 76 76" width="${size}" height="${size}" aria-hidden="true">${common}${base}${overlay}</svg>`;
}

function setBg(bucket){
  const isDay = state.wx?.current?.is_day === 1;
  const cls = ['widget-bg', `bg-${bucket}`, isDay ? 'is-day' : 'is-night'];
  els.bg.className = cls.join(' ');
  // Ensure fx layers exist
  els.bg.innerHTML = '';
  if(bucket === 'fog'){
    els.bg.insertAdjacentHTML('beforeend', `<div class="fx fog"></div>`);
  }else if(bucket === 'rain'){
    els.bg.insertAdjacentHTML('beforeend', `<div class="fx rain"></div>`);
  }else if(bucket === 'snow'){
    els.bg.insertAdjacentHTML('beforeend', `<div class="fx snow"></div>`);
  }else if(bucket === 'storm'){
    els.bg.insertAdjacentHTML('beforeend', `<div class="fx storm"></div><div class="fx flash"></div>`);
  }else if(bucket === 'cloud'){
    // subtle floating fog for cloudiness
    els.bg.insertAdjacentHTML('beforeend', `<div class="fx fog" style="opacity:.35"></div>`);
  }
}

function setParallax(){
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const max = 10;
  const onMove = (e)=>{
    const x = (e.clientX / window.innerWidth - .5) * 2;
    const y = (e.clientY / window.innerHeight - .5) * 2;
    els.bg.style.setProperty('--px', `${-x*max}px`);
    els.bg.style.setProperty('--py', `${-y*max}px`);
  };
  window.addEventListener('pointermove', onMove, { passive:true });
}

async function fetchWidgetWeather(lat, lon, tz, unit){
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('timezone', tz === 'auto' ? 'auto' : tz);
  url.searchParams.set('current', [
    'temperature_2m','apparent_temperature','weathercode','wind_speed_10m','is_day'
  ].join(','));
  url.searchParams.set('hourly', [
    'temperature_2m','precipitation_probability','precipitation','weathercode','is_day'
  ].join(','));
  url.searchParams.set('forecast_days', '2');
  if(unit === 'imperial'){
    url.searchParams.set('temperature_unit','fahrenheit');
    url.searchParams.set('wind_speed_unit','mph');
  }else{
    url.searchParams.set('temperature_unit','celsius');
    url.searchParams.set('wind_speed_unit','ms');
  }
  const res = await fetch(url);
  if(!res.ok) throw new Error('Weather failed');
  return res.json();
}

function pickNext12(data){
  const now = new Date();
  const times = data.hourly.time.map(t=>new Date(t));
  const start = times.findIndex(d=>d >= now);
  const idx0 = Math.max(0, start);
  const slice = (arr)=>arr.slice(idx0, idx0+12);
  return {
    idx0,
    time: slice(times),
    temp: slice(data.hourly.temperature_2m),
    pr: slice(data.hourly.precipitation_probability),
    pmm: slice(data.hourly.precipitation),
    code: slice(data.hourly.weathercode),
    isDay: slice(data.hourly.is_day),
  };
}

function fmtHour(d){
  return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
}

function render(data){
  const place = state.place;
  const unit = state.unit === 'imperial' ? '°F' : '°C';
  const cur = data.current;
  const bucket = weatherBucket(cur.weathercode);
  state.wx = { data, current: cur };
  els.city.textContent = place?.name || '—';
  els.unit.textContent = unit;
  els.temp.textContent = Math.round(cur.temperature_2m);
  els.desc.textContent = weatherText(cur.weathercode);
  els.feels.textContent = `Ощущается ${Math.round(cur.apparent_temperature)}${unit}`;
  els.wind.textContent = `Ветер ${Math.round(cur.wind_speed_10m)} ${state.unit==='imperial'?'mph':'m/s'}`;
  els.icon.innerHTML = iconSVG(bucket, cur.is_day===1, 74);
  setBg(bucket);

  const next = pickNext12(data);
  renderChart(next);
  renderHourCards(next);
  els.sub.textContent = `Обновлено ${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
}

function renderChart(next){
  const svg = els.svg;
  const W = 320, H = 120, pad = 16;
  svg.innerHTML = '';

  const temps = next.temp;
  const prs = next.pr;
  const tMin = Math.min(...temps);
  const tMax = Math.max(...temps);
  const prMax = Math.max(10, ...prs);

  const x = (i)=> pad + i*( (W-2*pad) / (temps.length-1) );
  const yT = (v)=> {
    const span = (tMax - tMin) || 1;
    return pad + (H-2*pad) * (1 - (v - tMin)/span);
  };
  const yP = (v)=> pad + (H-2*pad) * (1 - v/prMax);

  // grid
  const grid = document.createElementNS('http://www.w3.org/2000/svg','g');
  grid.setAttribute('opacity','0.35');
  for(let i=0;i<4;i++){
    const yy = pad + i*( (H-2*pad)/3 );
    const line = document.createElementNS(svg.namespaceURI,'line');
    line.setAttribute('x1','0'); line.setAttribute('x2',String(W));
    line.setAttribute('y1',String(yy)); line.setAttribute('y2',String(yy));
    line.setAttribute('stroke','rgba(255,255,255,.18)');
    grid.appendChild(line);
  }
  svg.appendChild(grid);

  // precip bars
  const bars = document.createElementNS(svg.namespaceURI,'g');
  bars.setAttribute('opacity','0.55');
  temps.forEach((_,i)=>{
    const bar = document.createElementNS(svg.namespaceURI,'rect');
    const bw = 10;
    const xx = x(i) - bw/2;
    const yy = yP(prs[i]);
    bar.setAttribute('x', String(xx));
    bar.setAttribute('y', String(yy));
    bar.setAttribute('width', String(bw));
    bar.setAttribute('height', String(H-pad-yy));
    bar.setAttribute('rx','4');
    bar.setAttribute('fill','rgba(120,200,255,.55)');
    bars.appendChild(bar);
  });
  svg.appendChild(bars);

  // temp line
  const pts = temps.map((v,i)=>`${x(i)},${yT(v)}`).join(' ');
  const pl = document.createElementNS(svg.namespaceURI,'polyline');
  pl.setAttribute('points', pts);
  pl.setAttribute('fill','none');
  pl.setAttribute('stroke','rgba(255,255,255,.82)');
  pl.setAttribute('stroke-width','2.5');
  pl.setAttribute('stroke-linecap','round');
  pl.setAttribute('stroke-linejoin','round');
  svg.appendChild(pl);

  // points (interactive)
  const pg = document.createElementNS(svg.namespaceURI,'g');
  temps.forEach((v,i)=>{
    const c = document.createElementNS(svg.namespaceURI,'circle');
    c.setAttribute('cx', String(x(i)));
    c.setAttribute('cy', String(yT(v)));
    c.setAttribute('r', i===state.activeIdx ? '4.8' : '3.6');
    c.setAttribute('fill', i===state.activeIdx ? 'rgba(99,102,241,.95)' : 'rgba(255,255,255,.72)');
    c.setAttribute('stroke','rgba(0,0,0,.18)');
    c.setAttribute('stroke-width','1');
    c.dataset.idx = String(i);
    c.style.cursor = 'pointer';
    pg.appendChild(c);

    // temperature labels each 4 hours
    if(i % 4 === 0){
      const tx = document.createElementNS(svg.namespaceURI,'text');
      tx.setAttribute('x', String(x(i)));
      tx.setAttribute('y', String(yT(v) - 8));
      tx.setAttribute('text-anchor','middle');
      tx.setAttribute('font-size','10');
      tx.setAttribute('fill','rgba(255,255,255,.82)');
      tx.textContent = `${Math.round(v)}°`;
      pg.appendChild(tx);
    }
  });
  svg.appendChild(pg);

  const onPick = (idx, clientX, clientY)=>{
    setActive(idx);
    showTip(idx, clientX, clientY, next);
  };

  svg.addEventListener('pointermove', (e)=>{
    const target = e.target;
    if(!(target instanceof SVGCircleElement)) return;
    const idx = Number(target.dataset.idx);
    if(Number.isFinite(idx)) showTip(idx, e.clientX, e.clientY, next);
  }, { passive:true });

  svg.addEventListener('pointerleave', ()=>{ els.tip.hidden = true; });

  svg.addEventListener('click', (e)=>{
    const target = e.target;
    if(!(target instanceof SVGCircleElement)) return;
    const idx = Number(target.dataset.idx);
    if(Number.isFinite(idx)) onPick(idx, e.clientX, e.clientY);
  });

  // keyboard support
  svg.setAttribute('tabindex','0');
  svg.addEventListener('keydown', (e)=>{
    if(e.key === 'ArrowRight'){ setActive(Math.min(11, state.activeIdx+1)); e.preventDefault(); }
    if(e.key === 'ArrowLeft'){ setActive(Math.max(0, state.activeIdx-1)); e.preventDefault(); }
  });
}

function showTip(idx, clientX, clientY, next){
  const unit = state.unit === 'imperial' ? '°F' : '°C';
  const t = next.time[idx];
  const temp = Math.round(next.temp[idx]);
  const pr = Math.round(next.pr[idx] ?? 0);
  const mm = (next.pmm[idx] ?? 0);
  els.tip.innerHTML = `<b>${fmtHour(t)}</b> · ${temp}${unit} · ${pr}% · ${mm.toFixed(1)}мм`;
  els.tip.hidden = false;

  // Position tip inside chart
  const wrap = els.svg.getBoundingClientRect();
  const x = Math.min(Math.max(clientX - wrap.left, 20), wrap.width-20);
  const y = Math.min(Math.max(clientY - wrap.top, 20), wrap.height-10);
  els.tip.style.left = `${x}px`;
  els.tip.style.top = `${y}px`;
}

function renderHourCards(next){
  els.hours.innerHTML = '';
  next.time.forEach((d,i)=>{
    const bucket = weatherBucket(next.code[i]);
    const isDay = (next.isDay[i] ?? 1) === 1;
    const unit = state.unit === 'imperial' ? '°F' : '°C';
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'hour-card' + (i===state.activeIdx ? ' active' : '');
    card.dataset.idx = String(i);
    card.innerHTML = `
      <div class="h-time">${fmtHour(d)}</div>
      <div class="h-ic">${iconSVG(bucket, isDay, 38)}</div>
      <div class="h-temp">${Math.round(next.temp[i])}${unit}</div>
      <div class="h-pr">${Math.round(next.pr[i] ?? 0)}% осадков</div>
    `;
    card.addEventListener('click', ()=>{
      setActive(i);
      // magnet tooltip to the selected point center
      const svgRect = els.svg.getBoundingClientRect();
      const x = svgRect.left + (svgRect.width * (16 + i*((320-32)/11)) / 320);
      const y = svgRect.top + 40;
      showTip(i, x, y, next);
    });
    els.hours.appendChild(card);
  });
}

function setActive(idx){
  state.activeIdx = idx;
  // re-render chart points + cards highlight
  // lightweight: update classes and circle attributes
  [...els.hours.querySelectorAll('.hour-card')].forEach(el=>{
    el.classList.toggle('active', Number(el.dataset.idx) === idx);
  });
  // Update circles
  els.svg.querySelectorAll('circle').forEach(c=>{
    const i = Number(c.dataset.idx);
    const active = i === idx;
    c.setAttribute('r', active ? '4.8' : '3.6');
    c.setAttribute('fill', active ? 'rgba(99,102,241,.95)' : 'rgba(255,255,255,.72)');
  });
  // Scroll to selected card
  const card = els.hours.querySelector(`.hour-card[data-idx="${idx}"]`);
  if(card) card.scrollIntoView({ behavior:'smooth', inline:'center', block:'nearest' });
}

async function refresh(){
  const last = readLast();
  if(last?.place) state.place = last.place;
  if(!state.place){
    els.sub.textContent = 'Открой приложение и выбери город';
    els.openApp.hidden = false;
    return;
  }
  els.openApp.hidden = false;

  try{
    els.offline.hidden = true;
    els.sub.textContent = 'Обновление…';
    const data = await fetchWidgetWeather(state.place.lat, state.place.lon, TZ, state.unit);
    render(data);
    saveLast({ ts: Date.now(), unit: state.unit, place: state.place, wx: data, aq: null });
  }catch(e){
    // fallback
    if(last?.wx){
      render(last.wx);
      els.offline.hidden = false;
      els.sub.textContent = 'Оффлайн/ошибка сети';
    }else{
      els.sub.textContent = 'Не удалось обновить. Открой полное приложение.';
    }
  }
}

function bind(){
  els.openApp.addEventListener('click', ()=>{ location.href = './'; });
  els.refresh.addEventListener('click', ()=> refresh());

  // Quick unit toggle via long-press on temp
  let pressT;
  els.temp.parentElement?.addEventListener('pointerdown', ()=>{
    pressT = setTimeout(()=>{
      state.unit = state.unit === 'imperial' ? 'metric' : 'imperial';
      localStorage.setItem('wv:unit', state.unit);
      refresh();
    }, 520);
  });
  window.addEventListener('pointerup', ()=> clearTimeout(pressT));

  window.addEventListener('online', ()=> refresh(), { passive:true });
  setParallax();
}

bind();
refresh();
