/**
 * VisionLite AI — Build Script
 * 
 * Uses esbuild to compile TypeScript entry points into self-contained
 * IIFE bundles for the Chrome extension. Each output file has zero
 * external imports — perfect for MV3's content scripts and service workers.
 * 
 * Usage:
 *   node build.mjs          # One-shot build
 *   node build.mjs --watch  # Watch mode for development
 */

import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

// ---- Configuration ----
const ENTRY_POINTS = [
  'src/background/service-worker.ts',
  'src/content/content.ts',
  'src/popup/popup.ts',
  'src/offscreen/offscreen.ts',
  'src/sidepanel/sidepanel.ts',
  'src/debug/debug.ts',
];

const STATIC_FILES = [
  // [source, destination]
  ['manifest.json', 'dist/manifest.json'],
  ['src/popup/popup.html', 'dist/popup/popup.html'],
  ['src/popup/popup.css', 'dist/popup/popup.css'],
  ['src/offscreen/offscreen.html', 'dist/offscreen/offscreen.html'],
  ['src/sidepanel/sidepanel.html', 'dist/sidepanel/sidepanel.html'],
  ['src/sidepanel/sidepanel.css', 'dist/sidepanel/sidepanel.css'],
  ['src/debug/debug.html', 'dist/debug/debug.html'],
  
  // Tesseract.js Assets
  ['node_modules/tesseract.js/dist/worker.min.js', 'dist/lib/worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core.wasm.js', 'dist/lib/tesseract-core.wasm.js'],
  ['src/models/eng.traineddata.gz', 'dist/models/eng.traineddata.gz'],
];

const STATIC_DIRS = [
  // [source_dir, destination_dir]
  ['src/icons', 'dist/icons'],
  ['src/models', 'dist/models'],
];

// ---- Copy static files ----
function copyStatics() {
  for (const [src, dest] of STATIC_FILES) {
    const srcPath = resolve(__dirname, src);
    const destPath = resolve(__dirname, dest);
    if (existsSync(srcPath)) {
      mkdirSync(dirname(destPath), { recursive: true });
      cpSync(srcPath, destPath);
    } else {
      console.warn(`  ⚠ Missing: ${src}`);
    }
  }

  for (const [src, dest] of STATIC_DIRS) {
    const srcPath = resolve(__dirname, src);
    const destPath = resolve(__dirname, dest);
    if (existsSync(srcPath)) {
      cpSync(srcPath, destPath, { recursive: true });
    } else {
      console.warn(`  ⚠ Missing dir: ${src}`);
    }
  }
}

// ---- Build ----
const buildOptions = {
  entryPoints: ENTRY_POINTS,
  bundle: true,
  outdir: 'dist',
  outbase: 'src',                // Strip 'src/' prefix from output paths
  format: 'iife',                // Self-contained bundles, no import/export
  target: 'chrome120',           // Modern Chrome
  platform: 'browser',
  sourcemap: isWatch ? 'inline' : false,
  minify: !isWatch,
  logLevel: 'info',
  define: {
    'process.env.NODE_ENV': isWatch ? '"development"' : '"production"',
  },
};

async function build() {
  console.log('\n🛡️  VisionLite AI — Building extension-v2\n');

  // Copy static files first
  console.log('📋 Copying static files...');
  copyStatics();

  if (isWatch) {
    console.log('👀 Watch mode — rebuilding on changes...\n');
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();

    // Also watch static files (simple polling)
    let lastCopy = Date.now();
    setInterval(() => {
      const now = Date.now();
      if (now - lastCopy > 2000) {
        copyStatics();
        lastCopy = now;
      }
    }, 2000);
  } else {
    await esbuild.build(buildOptions);
    console.log('\n✅ Build complete → dist/\n');
  }
}

build().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});

