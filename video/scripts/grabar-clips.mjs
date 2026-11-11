// Graba clips del atlas publicado para el video de LinkedIn (cuadros de Chrome → MP4 a 30 fps).
// Uso: node grabar-clips.mjs <carpeta-salida>   (por ejemplo video/public/atlas)
// Necesita puppeteer-core instalado y Chrome. Usa el ffmpeg que trae Remotion porque no tiene el filtro «fps»
// que pide page.screencast() de Puppeteer: por eso guarda los cuadros a 30 fps y los une con libx264.
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const out = process.argv[2];
mkdirSync(out, { recursive: true });
const ffmpeg = 'C:/Users/andre/proyectos/videos-marketing/node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe';
const FPS = 30;
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('atlas-aviso', '1'); localStorage.setItem('atlas-fisio-visto', '1');
  localStorage.setItem('atlas-hint', '1'); localStorage.setItem('atlas-theme', 'dark');
});
await page.goto('https://andresproano.github.io/atlas-anatomia/', { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForFunction(() => window.__atlas?.body?.state.loaded.size >= 12, { timeout: 180000 });
await page.evaluate(() => window.__atlas.body.allLoaded);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (code) => page.evaluate(code);
const cdp = await page.createCDPSession();

// graba `seconds` segundos: guarda el último cuadro recibido cada 1/30 s (cuadros constantes)
async function record(name, seconds, during) {
  const dir = join(out, `_frames_${name}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  let last = null;
  const onFrame = async (f) => { last = f.data; cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); };
  cdp.on('Page.screencastFrame', onFrame);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1440, maxHeight: 900, everyNthFrame: 1 });
  while (!last) await wait(10);
  const total = Math.round(seconds * FPS);
  const t0 = Date.now();
  let duringDone = !during;
  for (let i = 0; i < total; i++) {
    const target = t0 + (i * 1000) / FPS;
    const d = target - Date.now();
    if (d > 0) await wait(d);
    if (!duringDone && Date.now() - t0 > 1500) { duringDone = true; js(during); }
    writeFileSync(join(dir, `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(last, 'base64'));
  }
  await cdp.send('Page.stopScreencast');
  cdp.off('Page.screencastFrame', onFrame);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(dir, 'f%05d.jpg'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', join(out, `${name}.mp4`)]);
  rmSync(dir, { recursive: true, force: true });
  console.log('grabado', name, total, 'cuadros');
}
async function clip(name, setup, seconds, during) {
  await js(setup);
  await wait(3500); // que la cámara termine de moverse antes de grabar
  await record(name, seconds, during);
}
const proc = (i) => `document.querySelector('#physio-box [data-proc="${i}"]').click()`;
const step = (i) => `document.querySelector('[data-step="${i}"]').click()`;

await js("window.__atlas.physio.setInitial('circulacion'); window.__atlas.setMode('physio')");
await wait(4000);
await clip('circulacion', '1', 7);
await clip('corazon', proc(1), 7);
await clip('infarto', `document.querySelector('[data-dz="infarto"]').click()`, 6);
await clip('vision', `${proc(3)}; setTimeout(() => { ${step(1)} }, 800)`, 7);
await clip('caso', proc(6), 7, `document.querySelector('[data-opt="1"]').click()`);
await browser.close();
