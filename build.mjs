// Pakowanie gry do folderu app/: łączenie modułów (esbuild), zmniejszenie i zaciemnienie kodu
// (javascript-obfuscator), żeby nikt nie mógł łatwo skopiować ani podejrzeć kodu gry.
import * as esbuild from 'esbuild';
import JavaScriptObfuscator from 'javascript-obfuscator';
import fs from 'fs';

const SRC = 'src', OUT = 'app';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const common = { bundle: true, format: 'esm', minify: true, target: 'chrome120', legalComments: 'none', logLevel: 'warning' };

console.log('  - three.js');
await esbuild.build({ ...common, stdin: { contents: "export * from 'three';", resolveDir: process.cwd(), loader: 'js' }, outfile: `${OUT}/three.js` });
console.log('  - kod gry');
await esbuild.build({ ...common, entryPoints: [`${SRC}/js/main.js`], external: ['three'], outfile: `${OUT}/game.js` });
console.log('  - worker (teren, siatki)');
await esbuild.build({ ...common, entryPoints: [`${SRC}/js/worker.js`], outfile: `${OUT}/worker.js` });

const base = {
  compact: true, simplify: true, target: 'browser', sourceType: 'module',
  identifierNamesGenerator: 'hexadecimal', renameGlobals: false, renameProperties: false,
  controlFlowFlattening: false, deadCodeInjection: false, selfDefending: false, debugProtection: false,
  splitStrings: false, unicodeEscapeSequence: false, transformObjectKeys: false, numbersToExpressions: false,
};
const obf = (file, extra) => {
  const t0 = Date.now();
  const code = fs.readFileSync(file, 'utf8');
  const out = JavaScriptObfuscator.obfuscate(code, { ...base, ...extra }).getObfuscatedCode();
  fs.writeFileSync(file, '/* BlokCraft (c) Nathxn */\n' + out);
  console.log(`  - zaciemniono ${file} (${(out.length / 1024).toFixed(0)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
};
console.log('  - zaciemnianie kodu (to chwilę trwa)...');
obf(`${OUT}/game.js`, { stringArray: true, stringArrayThreshold: 0.6, stringArrayEncoding: ['base64'], stringArrayRotate: true, stringArrayShuffle: true });
// worker liczy teren i siatki – lżejsze zaciemnianie, żeby nie zwalniał
obf(`${OUT}/worker.js`, { stringArray: false });

let html = fs.readFileSync(`${SRC}/index.html`, 'utf8');
html = html.replace(/"three":\s*"[^"]+"/, '"three": "./three.js"').replace('src="js/main.js"', 'src="game.js"');
if (!html.includes('./three.js') || !html.includes('src="game.js"')) throw new Error('Nie udało się podmienić index.html');
fs.writeFileSync(`${OUT}/index.html`, html);
console.log('Gotowe: folder app/');
