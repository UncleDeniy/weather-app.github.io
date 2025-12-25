export function fmtTemp(v, unit){
  if(!Number.isFinite(v)) return '—';
  const s = Math.round(v);
  return `${s}°${unit === 'imperial' ? 'F' : 'C'}`;
}

export function fmtWind(v, unit){
  if(!Number.isFinite(v)) return '—';
  const s = Math.round(v);
  return unit === 'imperial' ? `${s} mph` : `${s} м/с`;
}

export function fmtKm(v){
  if(!Number.isFinite(v)) return '—';
  if(v < 1) return `${Math.round(v*1000)} м`;
  return `${v.toFixed(0)} км`;
}

export function fmtPressure(hpa){
  if(!Number.isFinite(hpa)) return '—';
  // hPa -> mmHg
  const mm = Math.round(hpa * 0.75006156);
  return `${mm} мм рт. ст.`;
}

export function clamp(v, a, b){
  return Math.max(a, Math.min(b, v));
}

export function debounce(fn, ms){
  let t;
  return (...args)=>{
    clearTimeout(t);
    t = setTimeout(()=>fn(...args), ms);
  };
}

export function toast(text){
  const el = document.getElementById('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(()=>{ el.hidden = true; }, 2200);
}

// WMO weather code mapping (basic)
export function wmoToText(code){
  const m = {
    0: 'Ясно',
    1: 'Преимущественно ясно',
    2: 'Переменная облачность',
    3: 'Облачно',
    45: 'Туман',
    48: 'Иней/туман',
    51: 'Слабая морось',
    53: 'Морось',
    55: 'Сильная морось',
    56: 'Морось (замерз.)',
    57: 'Сильная морось (замерз.)',
    61: 'Слабый дождь',
    63: 'Дождь',
    65: 'Сильный дождь',
    66: 'Дождь (замерз.)',
    67: 'Сильный дождь (замерз.)',
    71: 'Слабый снег',
    73: 'Снег',
    75: 'Сильный снег',
    77: 'Снежные зерна',
    80: 'Ливень слабый',
    81: 'Ливень',
    82: 'Ливень сильный',
    85: 'Снегопад слабый',
    86: 'Снегопад сильный',
    95: 'Гроза',
    96: 'Гроза с градом',
    99: 'Сильная гроза с градом'
  };
  return m[code] ?? '—';
}


export function fmtClock(iso){
  if(!iso) return '—';
  // open-meteo returns 'YYYY-MM-DDTHH:MM'
  const t = String(iso);
  const parts = t.split('T');
  if(parts.length < 2) return t;
  return parts[1].slice(0,5);
}

export function weatherTheme(code, isDay){
  const day = String(isDay ?? 1) === '1';
  // Categories by WMO weathercode
  if(code === 0) return day ? 'clear-day' : 'clear-night';
  if([1,2,3].includes(code)) return day ? 'cloudy-day' : 'cloudy-night';
  if([45,48].includes(code)) return 'fog';
  if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return 'rain';
  if([71,73,75,77,85,86].includes(code)) return 'snow';
  if([95,96,99].includes(code)) return 'storm';
  return day ? 'cloudy-day' : 'cloudy-night';
}


// Simple animated SVG icons (no external deps)
export function wmoToIcon(code, isDay=1){
  const day = String(isDay ?? 1) === '1';
  const theme = weatherTheme(Number(code), isDay);

  const stroke = 'rgba(255,255,255,.92)';
  const fill = 'rgba(255,255,255,.14)';

  const wrap = (svg)=>`<span class="wicon" aria-hidden="true">${svg}</span>`;

  const sun = wrap(`
  <svg viewBox="0 0 64 64" fill="none">
    <g class="sun-rays" stroke="${stroke}" stroke-width="3" stroke-linecap="round">
      <path d="M32 6v10"/><path d="M32 48v10"/><path d="M6 32h10"/><path d="M48 32h10"/>
      <path d="M13 13l7 7"/><path d="M44 44l7 7"/><path d="M51 13l-7 7"/><path d="M20 44l-7 7"/>
    </g>
    <circle cx="32" cy="32" r="10" stroke="${stroke}" stroke-width="3" fill="${fill}"/>
  </svg>`);

  const cloud = wrap(`
  <svg viewBox="0 0 64 64" fill="none">
    <g class="cloud" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 44h24a10 10 0 0 0 0-20 14 14 0 0 0-27-3A9 9 0 0 0 22 44z" fill="${fill}"/>
    </g>
  </svg>`);

  const partly = wrap(`
  <svg viewBox="0 0 64 64" fill="none">
    <g class="sun-rays" stroke="${stroke}" stroke-width="3" stroke-linecap="round">
      <path d="M22 10v6"/><path d="M22 34v6"/><path d="M10 22h6"/><path d="M34 22h6"/>
      <path d="M13 13l4 4"/><path d="M31 31l4 4"/><path d="M31 13l-4 4"/><path d="M13 31l4-4"/>
    </g>
    <circle cx="22" cy="22" r="7" stroke="${stroke}" stroke-width="3" fill="${fill}"/>
    <g class="cloud" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M26 48h20a8 8 0 0 0 0-16 11 11 0 0 0-21-2A7 7 0 0 0 26 48z" fill="${fill}"/>
    </g>
  </svg>`);

  const rain = wrap(`
  <svg viewBox="0 0 64 64" fill="none">
    <g class="cloud" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 38h26a9 9 0 0 0 0-18 13 13 0 0 0-25-3A8 8 0 0 0 20 38z" fill="${fill}"/>
    </g>
    <g class="drops" fill="${stroke}">
      <circle cx="24" cy="44" r="2.2"/><circle cx="34" cy="44" r="2.2"/><circle cx="44" cy="44" r="2.2"/>
    </g>
  </svg>`);

  const snow = wrap(`
  <svg viewBox="0 0 64 64" fill="none">
    <g class="cloud" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 38h26a9 9 0 0 0 0-18 13 13 0 0 0-25-3A8 8 0 0 0 20 38z" fill="${fill}"/>
    </g>
    <g opacity=".9" stroke="${stroke}" stroke-width="2" stroke-linecap="round">
      <path d="M24 44l0 8"/><path d="M20 48h8"/><path d="M22 46l4 4"/><path d="M26 46l-4 4"/>
      <path d="M40 44l0 8"/><path d="M36 48h8"/><path d="M38 46l4 4"/><path d="M42 46l-4 4"/>
    </g>
  </svg>`);

  const storm = wrap(`
  <svg viewBox="0 0 64 64" fill="none">
    <g class="cloud" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 38h28a9 9 0 0 0 0-18 13 13 0 0 0-25-3A8 8 0 0 0 18 38z" fill="${fill}"/>
    </g>
    <path class="bolt" d="M32 40l-6 10h7l-3 10 10-14h-7l3-6z" fill="rgba(255,255,255,.88)"/>
  </svg>`);

  const fog = wrap(`
  <svg viewBox="0 0 64 64" fill="none">
    <g stroke="${stroke}" stroke-width="3" stroke-linecap="round" opacity=".9">
      <path d="M14 26h36"/><path d="M10 34h44"/><path d="M14 42h36"/>
    </g>
  </svg>`);

  if(theme.startsWith('clear')) return sun;
  if(theme.startsWith('cloudy') && [1,2].includes(Number(code))) return partly;
  if(theme.startsWith('cloudy')) return cloud;
  if(theme==='rain') return rain;
  if(theme==='snow') return snow;
  if(theme==='storm') return storm;
  if(theme==='fog') return fog;
  return day ? partly : cloud;
}

export function themeGradient(theme){
  const g = {
    'clear-day': ['#0b2a5b','#1e40af','#38bdf8'],
    'clear-night': ['#070a14','#111a37','#312e81'],
    'cloudy-day': ['#0b1020','#1f2937','#2563eb'],
    'cloudy-night': ['#070a14','#111827','#1d4ed8'],
    'rain': ['#0b1020','#0f172a','#0ea5e9'],
    'snow': ['#0b1020','#0f172a','#e5e7eb'],
    'storm': ['#070a14','#111827','#ef4444'],
    'fog': ['#0b1020','#111827','#94a3b8'],
  };
  return g[theme] || g['cloudy-day'];
}
