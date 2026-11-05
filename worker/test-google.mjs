// Prueba de "Continuar con Google" con un Google simulado.
// 1) node test-google.mjs --jwks   (sirve claves públicas en :5199 y escribe la privada en .test-google-key.json)
// 2) npx wrangler dev --port 8787 --local --var GOOGLE_CLIENT_ID:test-client --var GOOGLE_JWKS_URL:http://127.0.0.1:5199/jwks.json
// 3) node test-google.mjs          (firma tokens y prueba el Worker)
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8787';
const KEYFILE = new URL('./.test-google-key.json', import.meta.url);

if (process.argv.includes('--jwks')) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'prueba-1', alg: 'RS256', use: 'sig' };
  fs.writeFileSync(KEYFILE, JSON.stringify({ kid: 'prueba-1', pem: privateKey.export({ format: 'pem', type: 'pkcs8' }) }));
  http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=60' });
    res.end(JSON.stringify({ keys: [jwk] }));
  }).listen(5199, () => console.log('JWKS de prueba en http://127.0.0.1:5199/jwks.json'));
} else {
  const { kid, pem } = JSON.parse(fs.readFileSync(KEYFILE, 'utf8'));
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const sign = (payload, { k = kid, key = pem } = {}) => {
    const head = b64({ alg: 'RS256', kid: k, typ: 'JWT' }) + '.' + b64(payload);
    return head + '.' + crypto.sign('RSA-SHA256', Buffer.from(head), key).toString('base64url');
  };
  const email = `valeria.g${Date.now()}@gmail.com`;
  const good = { iss: 'https://accounts.google.com', aud: 'test-client', sub: '1234567890', email, email_verified: true, name: 'Valeria G', iat: now, exp: now + 3600 };
  const H = { 'Content-Type': 'application/json', Origin: 'https://andresproano.github.io' };
  const g = (credential) => fetch(`${BASE}/v1/auth/google`, { method: 'POST', headers: H, body: JSON.stringify({ credential }) });
  let fails = 0;
  const check = (label, cond, extra = '') => { if (!cond) fails++; console.log(cond ? 'OK   ' : 'FALLA', label, extra); };

  let r = await g(sign(good)); let d = await r.json();
  check('token válido -> sesión', r.status === 200 && d.token && d.name === 'Valeria G' && d.email === email, d.error || '');
  const token = d.token;
  r = await fetch(`${BASE}/v1/me/progress`, { method: 'PUT', headers: { ...H, Authorization: `Bearer ${token}` }, body: JSON.stringify({ progress: { 'M:Tibia': { a: 1, c: 1, box: 1, t: 5 } } }) });
  check('guarda progreso con la sesión de Google', r.status === 200);
  r = await g(sign(good)); d = await r.json();
  r = await fetch(`${BASE}/v1/me/progress`, { headers: { ...H, Authorization: `Bearer ${d.token}` } });
  check('segundo inicio con Google ve el mismo progreso', r.status === 200 && (await r.json()).progress['M:Tibia']);

  r = await g(sign({ ...good, aud: 'otra-app' }));
  check('token para otra app -> 401', r.status === 401);
  r = await g(sign({ ...good, exp: now - 600 }));
  check('token vencido -> 401', r.status === 401);
  r = await g(sign({ ...good, iss: 'https://evil.example' }));
  check('emisor falso -> 401', r.status === 401);
  r = await g(sign({ ...good, email_verified: false }));
  check('correo no verificado -> 401', r.status === 401);
  const fake = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ format: 'pem', type: 'pkcs8' });
  r = await g(sign(good, { key: fake }));
  check('firmado con otra clave (falsificado) -> 401', r.status === 401);
  const t = sign(good).split('.');
  r = await g(`${t[0]}.${b64({ ...good, email: 'otra@gmail.com' })}.${t[2]}`);
  check('datos alterados -> 401', r.status === 401);
  r = await g('basura');
  check('basura -> 401', r.status === 401);
  r = await g(sign({ ...good, sub: '999' }));
  check('mismo correo con otra cuenta de Google -> 409', r.status === 409);
  // cuenta de Google no tiene contraseña
  r = await fetch(`${BASE}/v1/auth/login`, { method: 'POST', headers: H, body: JSON.stringify({ email, password: 'cualquiera1' }) });
  check('cuenta de Google no entra con contraseña', r.status === 401);
  // ligar: cuenta con contraseña existente + Google del mismo correo
  const email2 = `ligar.${Date.now()}@gmail.com`;
  await fetch(`${BASE}/v1/auth/register`, { method: 'POST', headers: H, body: JSON.stringify({ email: email2, password: 'clave12345', name: 'Ana' }) });
  r = await g(sign({ ...good, email: email2, sub: '777', name: 'Ana Google' })); d = await r.json();
  check('Google se liga a la cuenta con contraseña del mismo correo', r.status === 200 && d.name === 'Ana');
  console.log(fails ? `${fails} fallas` : 'todos pasan');
  process.exit(fails ? 1 : 0);
}
