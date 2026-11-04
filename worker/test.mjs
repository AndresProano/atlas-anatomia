// Prueba del Worker (contra `npm run dev`): node test.mjs [url]
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const CODE = 'TEST-' + Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[01IO]/g, 'X') + '-ABCD';
const H = { 'Content-Type': 'application/json', Origin: 'https://andresproano.github.io' };
let fails = 0;
const check = (label, cond, extra = '') => { if (!cond) fails++; console.log(cond ? 'OK   ' : 'FALLA', label, extra); };

let r = await fetch(`${BASE}/v1/p/${CODE}`, { headers: H });
check('GET de un código nuevo -> 404', r.status === 404);

r = await fetch(`${BASE}/v1/p/${CODE}`, { method: 'PUT', headers: H, body: JSON.stringify({ name: 'Valeria', progress: { 'M:Tibia': { a: 2, c: 2, box: 2, t: 1000 }, 'M:Fémur': { a: 1, c: 0, box: 0, t: 1000 } } }) });
let d = await r.json();
check('PUT guarda', r.status === 200 && d.name === 'Valeria' && Object.keys(d.progress).length === 2);
check('CORS para el sitio', r.headers.get('access-control-allow-origin') === 'https://andresproano.github.io');

// otro dispositivo: Fémur más reciente y una estructura nueva; Tibia más vieja no debe pisar
r = await fetch(`${BASE}/v1/p/${CODE}`, { method: 'PUT', headers: H, body: JSON.stringify({ name: 'Valeria', progress: { 'M:Fémur': { a: 3, c: 2, box: 2, t: 2000 }, 'M:Tibia': { a: 1, c: 0, box: 0, t: 500 }, 'c:func:corazon': { a: 1, c: 1, box: 1, t: 2000 } } }) });
d = await r.json();
check('combina: gana lo más reciente', d.progress['M:Fémur'].a === 3 && d.progress['M:Tibia'].a === 2 && d.progress['c:func:corazon']);

r = await fetch(`${BASE}/v1/p/${CODE}`, { headers: H });
d = await r.json();
check('GET devuelve lo guardado', r.status === 200 && Object.keys(d.progress).length === 3, `(${Object.keys(d.progress).length} estructuras)`);

r = await fetch(`${BASE}/v1/p/hola`, { headers: H });
check('código inválido -> 400', r.status === 400);
r = await fetch(`${BASE}/v1/p/${CODE}`, { headers: { Origin: 'https://otra-pagina.com' } });
check('otra página -> 403', r.status === 403);
r = await fetch(`${BASE}/v1/p/${CODE}`, { method: 'PUT', headers: H, body: '{"progress": 5}' });
check('datos inválidos -> 400', r.status === 400);
r = await fetch(`${BASE}/v1/p/${CODE}`, { method: 'PUT', headers: H, body: JSON.stringify({ name: 'x', progress: { k: { a: 'mucho', box: 99, t: -5 } } }) });
d = await r.json();
check('limpia valores raros', d.progress.k && d.progress.k.box === 4 && d.progress.k.a === 0);
console.log(fails ? `${fails} fallas` : 'todos pasan');
process.exit(fails ? 1 : 0);
