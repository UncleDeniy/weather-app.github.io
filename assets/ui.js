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
