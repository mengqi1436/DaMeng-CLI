import { build, context } from 'esbuild';

const isWatch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['src/cli.ts'],
  bundle: true,
  outfile: 'dist/cli.js',
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: true,
  minify: !isWatch,
  treeShaking: true,
  banner: {
    js: '#!/usr/bin/env node\n',
  },
  external: [
    'dmdb',
    'fsevents',
  ],
  define: {
    'process.env.NODE_ENV': isWatch ? '"development"' : '"production"',
  },
};

if (isWatch) {
  const ctx = await context(buildOptions);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await build(buildOptions);
  console.log('Build complete!');
}
