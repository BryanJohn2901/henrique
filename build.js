#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { minify: minifyHtml } = require('html-minifier-terser');
const CleanCSS = require('clean-css');
const { minify: minifyJs } = require('terser');
const sharp = require('sharp');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const CANONICAL_BASE = 'https://henriquebattista.com.br';
const ASSET_FILES = ['1.png', '1-1.png', '2-1.png'];

const HTML_MINIFY_OPTIONS = {
  collapseWhitespace: true,
  removeComments: true,
  removeRedundantAttributes: true,
  removeScriptTypeAttributes: true,
  removeStyleLinkTypeAttributes: true,
  minifyCSS: true,
  minifyJS: false,
  keepClosingSlash: true,
  ignoreCustomComments: [/^\[/]
};

function hashFile(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function cleanDist() {
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true, force: true });
  }
  ensureDir(path.join(DIST, 'css'));
  ensureDir(path.join(DIST, 'js'));
  ensureDir(path.join(DIST, 'assets'));
  ensureDir(path.join(DIST, 'completa'));
}

function buildTailwind() {
  execSync(
    'npx tailwindcss -i ./src/input.css -o ./dist/css/tailwind.tmp.css --minify',
    { cwd: ROOT, stdio: 'inherit' }
  );
  const tailwindCss = fs.readFileSync(path.join(DIST, 'css/tailwind.tmp.css'), 'utf8');
  const customCss = fs.readFileSync(path.join(ROOT, 'css/custom.css'), 'utf8');
  const minifiedCustom = new CleanCSS({ level: 2 }).minify(customCss).styles;
  fs.writeFileSync(path.join(DIST, 'css/main.css'), tailwindCss + '\n' + minifiedCustom);
  fs.unlinkSync(path.join(DIST, 'css/tailwind.tmp.css'));
}

async function buildJs() {
  const source = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
  const result = await minifyJs(source, {
    compress: true,
    mangle: true,
    format: { comments: false }
  });
  fs.writeFileSync(path.join(DIST, 'js/main.js'), result.code);
}

async function optimizeAssets() {
  const mapping = {};
  for (const file of ASSET_FILES) {
    const input = path.join(ROOT, 'assets', file);
    if (!fs.existsSync(input)) continue;
    const base = path.basename(file, path.extname(file));
    const webpOut = path.join(DIST, 'assets', `${base}.webp`);
    await sharp(input)
      .webp({ quality: 82, effort: 6 })
      .toFile(webpOut);
    mapping[file] = `${base}.webp`;
    console.log(`  asset: ${file} -> ${base}.webp`);
  }
  return mapping;
}

function patchHtml(html, { assetPrefix = '', canonicalPath = '/', isCompleta = false, cssHash = '', jsHash = '' }) {
  let out = html;

  out = out.replace(/src="\.\.\/assets\//g, `src="${assetPrefix}assets/`);
  out = out.replace(/href="\.\.\/assets\//g, `href="${assetPrefix}assets/`);

  for (const file of ASSET_FILES) {
    const webp = file.replace(/\.(png|jpe?g)$/i, '.webp');
    out = out.replaceAll(`assets/${file}`, `assets/${webp}`);
  }

  out = out.replace(/<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>\s*/g, '');
  out = out.replace(/<script>\s*tailwind\.config[\s\S]*?<\/script>\s*/g, '');
  out = out.replace(/<style>[\s\S]*?<\/style>\s*/g, '');
  out = out.replace(/<script>(?![\s\S]*src=)[\s\S]*?<\/script>\s*(?=<\/body>)/g, '');

  if (!out.includes('href="' + assetPrefix + 'css/main.css"')) {
    out = out.replace(
      '</head>',
      `    <link rel="stylesheet" href="${assetPrefix}css/main.css?v=${cssHash}">\n</head>`
    );
  }

  if (!out.includes('src="' + assetPrefix + 'js/main.js"')) {
    out = out.replace(
      '</body>',
      `    <script src="${assetPrefix}js/main.js?v=${jsHash}" defer></script>\n</body>`
    );
  }

  const canonical = `${CANONICAL_BASE}${canonicalPath === '/' ? '/' : canonicalPath}`;
  const ogImage = `${CANONICAL_BASE}/assets/1-1.webp`;

  if (!out.includes('rel="canonical"')) {
    out = out.replace(
      '<meta charset="UTF-8">',
      `<meta charset="UTF-8">\n    <link rel="canonical" href="${canonical}">`
    );
  } else {
    out = out.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${canonical}">`);
  }

  out = out.replace(/<title>[^<]*<\/title>/, '<title>Aula Gratuita | Henrique Batista | Instituto Valorize</title>');
  out = out.replace(/\(v2\)/g, '');

  const seoBlock = `
    <meta name="robots" content="index, follow">
    <meta property="og:url" content="${canonical}">
    <meta property="og:image" content="${ogImage}">
    <meta property="og:image:alt" content="Aula gratuita com Henrique Batista - Instituto Valorize">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Aula Gratuita | Henrique Batista">
    <meta name="twitter:description" content="Personal Trainer e Nutricionista: pare de pensar como autônomo e comece a se comportar como empresa. Aula ao vivo com Henrique Batista.">
    <meta name="twitter:image" content="${ogImage}">
    <link rel="preconnect" href="https://unpkg.com" crossorigin>
    <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>`;

  if (!out.includes('twitter:card')) {
    out = out.replace('<meta property="og:locale"', seoBlock + '\n    <meta property="og:locale"');
  }

  out = out.replace(
    /content="\/assets\/[^"]+"/g,
    `content="${ogImage}"`
  );

  out = out.replace(/<img src="assets\/1\.webp" alt="" /g, '<img src="assets/1.webp" alt="Henrique Batista - fundo hero desktop" ');
  out = out.replace(/<img src="assets\/1-1\.webp" alt="" /g, '<img src="assets/1-1.webp" alt="Henrique Batista - fundo hero mobile" ');

  if (isCompleta) {
    out = out.replace(/src="assets\//g, 'src="../assets/');
    out = out.replace(/href="assets\//g, 'href="../assets/');
    out = out.replace(/href="\.\.\/"/g, 'href="../"');
  } else {
    out = out.replace(/<div class="version-bar[\s\S]*?<\/div>\s*\n\s*<!-- HERO -->/, '<!-- HERO -->');
    out = out.replace(/href="\.\.\/"/g, 'href="completa/"');
  }

  return out;
}

async function processHtmlFile(relativeInput, relativeOutput, options) {
  const inputPath = path.join(ROOT, relativeInput);
  const outputPath = path.join(DIST, relativeOutput);
  let html = fs.readFileSync(inputPath, 'utf8');
  html = patchHtml(html, options);
  const minified = await minifyHtml(html, HTML_MINIFY_OPTIONS);
  fs.writeFileSync(outputPath, minified);
  console.log(`  html: ${relativeInput} -> dist/${relativeOutput}`);
}

async function main() {
  console.log('Limpando dist/...');
  cleanDist();

  console.log('Gerando Tailwind purgado...');
  buildTailwind();

  console.log('Minificando JavaScript...');
  await buildJs();

  console.log('Otimizando assets...');
  await optimizeAssets();

  const cssHash = hashFile(path.join(DIST, 'css/main.css'));
  const jsHash = hashFile(path.join(DIST, 'js/main.js'));

  console.log('Processando HTML...');
  await processHtmlFile('index.html', 'index.html', {
    assetPrefix: '',
    canonicalPath: '/',
    isCompleta: false,
    cssHash,
    jsHash
  });
  await processHtmlFile('completa/index.html', 'completa/index.html', {
    assetPrefix: '../',
    canonicalPath: '/completa/',
    isCompleta: true,
    cssHash,
    jsHash
  });

  const stats = {
    html: fs.statSync(path.join(DIST, 'index.html')).size,
    css: fs.statSync(path.join(DIST, 'css/main.css')).size,
    js: fs.statSync(path.join(DIST, 'js/main.js')).size,
    assets: fs.readdirSync(path.join(DIST, 'assets')).reduce((sum, f) => {
      return sum + fs.statSync(path.join(DIST, 'assets', f)).size;
    }, 0)
  };

  console.log('\nBuild concluído em dist/');
  console.log(`  index.html: ${(stats.html / 1024).toFixed(1)} KB`);
  console.log(`  css/main.css: ${(stats.css / 1024).toFixed(1)} KB`);
  console.log(`  js/main.js: ${(stats.js / 1024).toFixed(1)} KB`);
  console.log(`  assets/: ${(stats.assets / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
