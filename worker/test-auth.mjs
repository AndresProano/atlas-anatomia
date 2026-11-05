// Prueba de cuentas del Worker: node test-auth.mjs [url]
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const H = { 'Content-Type': 'application/json', Origin: 'https://andresproano.github.io' };
const email = `prueba+${Date.now()}@ejemplo.com`;
let fails = 0;
const check = (label, cond, extra = '') => { if (!cond) fails++; console.log(cond ? 'OK   ' : 'FALLA', label, extra); };
const post = (path, body, token) => fetch(`${BASE}${path}`, { method: 'POST', headers: { ...H, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body || {}) });
const prog = (method, token, body) => fetch(`${BASE}/v1/me/progress`, { method, headers: { ...H, Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });

let r = await post('/v1/auth/register', { email, password: 'corta', name: 'Valeria' });
check('contraseña corta -> 400', r.status === 400);
let t0 = Date.now();
r = await post('/v1/auth/register', { email, password: 'anatomia2026', name: 'Valeria' });
let d = await r.json();
check('registro', r.status === 201 && d.token && d.recovery, `(${Date.now() - t0} ms)`);
const recovery = d.recovery; let token = d.token;
r = await post('/v1/auth/register', { email: email.toUpperCase(), password: 'otraclave123', name: 'X' });
check('correo repetido (mayúsculas) -> 409', r.status === 409);

r = await prog('GET', token);
check('cuenta nueva sin progreso -> 404', r.status === 404);
r = await prog('PUT', token, { progress: { 'M:Tibia': { a: 1, c: 1, box: 1, t: 10 } } });
d = await r.json();
check('guardar progreso', r.status === 200 && d.progress['M:Tibia'] && d.name === 'Valeria');

// otro dispositivo
r = await post('/v1/auth/login', { email, password: 'anatomia2026' });
d = await r.json();
check('login', r.status === 200 && d.token && d.name === 'Valeria');
const token2 = d.token;
r = await prog('GET', token2);
d = await r.json();
check('el otro dispositivo ve el progreso', r.status === 200 && d.progress['M:Tibia']);

r = await post('/v1/auth/login', { email, password: 'mala' });
check('contraseña incorrecta -> 401', r.status === 401);
r = await prog('GET', 'f'.repeat(64));
check('token inventado -> 401', r.status === 401);

r = await post('/v1/auth/logout', {}, token2);
r = await prog('GET', token2);
check('después de cerrar sesión -> 401', r.status === 401);

r = await post('/v1/auth/reset', { email, recovery: 'AAAA-BBBB-CCCC', password: 'nuevaclave99' });
check('recuperación con código malo -> 401', r.status === 401);
r = await post('/v1/auth/reset', { email, recovery: recovery.toLowerCase(), password: 'nuevaclave99' });
d = await r.json();
check('recuperación con código bueno', r.status === 200 && d.token && d.recovery && d.recovery !== recovery);
r = await post('/v1/auth/login', { email, password: 'nuevaclave99' });
check('login con la contraseña nueva', r.status === 200);
r = await post('/v1/auth/reset', { email, recovery, password: 'otra12345' });
check('el código de recuperación usado ya no sirve', r.status === 401);

// bloqueo por intentos
const email2 = `bloqueo+${Date.now()}@ejemplo.com`;
await post('/v1/auth/register', { email: email2, password: 'clave12345' });
let last;
for (let i = 0; i < 9; i++) last = await post('/v1/auth/login', { email: email2, password: 'x' + i });
check('bloqueo tras muchos intentos -> 429', last.status === 429);
r = await post('/v1/auth/login', { email: email2, password: 'clave12345' });
check('bloqueado incluso con la clave correcta', r.status === 429);

// compatibilidad con códigos
r = await fetch(`${BASE}/v1/p/ABCD-EFGH-JKLM`, { method: 'PUT', headers: H, body: JSON.stringify({ name: 'x', progress: { k: { a: 1, c: 1, box: 1, t: 1 } } }) });
check('los códigos anteriores siguen funcionando', r.status === 200);
console.log(fails ? `${fails} fallas` : 'todos pasan');
process.exit(fails ? 1 : 0);
