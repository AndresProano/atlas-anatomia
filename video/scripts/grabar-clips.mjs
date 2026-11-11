// Graba clips del atlas publicado para el video de LinkedIn, sin temblor.
// Uso: node grabar-clips.mjs <carpeta-salida>   (por ejemplo video/public/atlas)
//
// El atlas corre con un reloj virtual: durante la grabación cada cuadro avanza exactamente 1/30 s
// (requestAnimationFrame y performance.now controlados desde aquí) y recién entonces se toma la foto.
// Así el movimiento queda perfectamente parejo aunque la captura sea lenta.
// Necesita puppeteer-core y Chrome. Une los cuadros con el ffmpeg que trae Remotion (libx264).
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
  // reloj virtual: apagado hasta que el grabador lo active
  const realNow = performance.now.bind(performance), realRAF = window.requestAnimationFrame.bind(window);
  let virtual = false, vt = 0, queue = [];
  performance.now = () => (virtual ? vt : realNow());
  window.requestAnimationFrame = (cb) => { if (!virtual) return realRAF(cb); queue.push(cb); return queue.length; };
  window.__clock = {
    start() { vt = realNow(); virtual = true; },
    step(ms) { vt += ms; const run = queue; queue = []; for (const cb of run) cb(vt); },
    stop() { virtual = false; const run = queue; queue = []; for (const cb of run) realRAF(cb); },
  };
});
await page.goto('https://andresproano.github.io/atlas-anatomia/', { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForFunction(() => window.__atlas?.body?.state.loaded.size >= 12, { timeout: 180000 });
await page.evaluate(() => window.__atlas.body.allLoaded);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (code) => page.evaluate(code);

async function record(name, seconds, during) {
  const dir = join(out, `_frames_${name}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const total = Math.round(seconds * FPS);
  await js('window.__clock.start()');
  for (let i = 0; i < total; i++) {
    if (during && i === Math.round(1.5 * FPS)) await js(during);
    await js(`window.__clock.step(${1000 / FPS})`);
    const img = await page.screenshot({ type: 'jpeg', quality: 92 });
    writeFileSync(join(dir, `f${String(i).padStart(5, '0')}.jpg`), img);
  }
  await js('window.__clock.stop()');
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
