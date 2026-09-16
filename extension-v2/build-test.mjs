import * as esbuild from 'esbuild';

// Bundle src/core into a temporary node-compatible bundle for unit testing
await esbuild.build({
  entryPoints: {
    'dom-sanitizer': 'src/core/dom-sanitizer.ts',
    'privacy-gate': 'src/core/privacy-gate.ts',
    'action-validator': 'src/core/action-validator.ts',
    'secret-scanner': 'src/core/secret-scanner.ts',
  },
  bundle: true,
  outdir: 'dist-test',
  format: 'esm',
  platform: 'node',
  target: 'node18',
});
