// Packs the demo build (dist-demo) into one self-contained HTML page (demo.html)
// that runs without the server: the API runs in the browser (src/demo/mockApi.js).
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist-demo');
const assets = path.join(dist, 'assets');
const files = fs.readdirSync(assets);
const css = files.filter((f) => f.endsWith('.css')).map((f) => fs.readFileSync(path.join(assets, f), 'utf8')).join('\n');
const jsFiles = files.filter((f) => f.endsWith('.js'));
if (jsFiles.length !== 1) throw new Error(`expected one JS bundle, got ${jsFiles.join(', ')}`);
const js = fs.readFileSync(path.join(assets, jsFiles[0]), 'utf8').replace(/<\/script/gi, '<\\/script');

const html = `<title>CheffO3</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800&family=Secular+One&display=swap" rel="stylesheet">
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
document.documentElement.lang = 'he';
document.documentElement.dir = 'rtl';
${js}
</script>
`;
fs.writeFileSync(path.resolve('demo.html'), html);
console.log(`demo.html written (${Math.round(html.length / 1024)} KB)`);
