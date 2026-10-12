const fs = require('fs');
const path = require('path');
const es = require('esbuild');
const { execSync } = require('child_process');
const entryPoints = [path.resolve(__dirname, '../src/index.js')];

// Externalize only the bare Three.js package; its ESM addons must be bundled
// into CommonJS entry points for runtimes without synchronous require(ESM).
const bareThreeExternal = {
  name: 'bare-three-external',
  setup(build) {
    build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', external: true }));
  },
};

async function build() {
  // Ensure build directory exists
  const buildDir = path.resolve(__dirname, '../build');
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir);
  }

  // Build AssemblyScript WASM module first
  console.log('Building AssemblyScript WASM module...');
  try {
    execSync('npm run build:wasm', {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..')
    });
    console.log('WASM build completed successfully');

    // Verify WASM file was created
    const wasmPath = path.resolve(__dirname, '../build/texture-processor.wasm');
    if (fs.existsSync(wasmPath)) {
      const wasmStats = fs.statSync(wasmPath);
      console.log(`WASM file size: ${(wasmStats.size / 1024).toFixed(2)} KB`);
    } else {
      console.warn('WASM file was not created at expected location');
    }
  } catch (error) {
    console.warn('WASM build failed, continuing with JavaScript builds:', error.message);
  }

  await es.build({
    entryPoints,
    bundle: true,
    platform: 'node',
    plugins: [bareThreeExternal],
    outfile: path.resolve(__dirname, '../build/fdg.umd.js')
  });

  await es.build({
    entryPoints,
    bundle: true,
    platform: 'neutral',
    external: ['three'],
    outfile: path.resolve(__dirname, '../build/fdg.module.js')
  });

  await es.build({
    entryPoints,
    bundle: true,
    external: ['three'],
    outfile: path.resolve(__dirname, '../build/fdg.js')
  });

  var contents = fs.readFileSync(path.resolve(__dirname, '../build/fdg.js'), 'utf-8');
  contents = contents.replace(
    /(var ForceDirectedGraph = )/i,
    '$1 window.ForceDirectedGraph = '
  );
  fs.writeFileSync(
    path.resolve(__dirname, '../build/fdg.js'),
    contents
  );

  // Keep React and Fiber optional and out of the core and each other's bundles.
  for (const component of ['react', 'r3f']) {
    for (const [format, extension] of [['esm', 'mjs'], ['cjs', 'cjs']]) {
      await es.build({
        entryPoints: [path.resolve(__dirname, `../src/${component}/index.js`)],
        bundle: true,
        format,
        platform: 'neutral',
        external: format === 'cjs'
          ? ['react', '@react-three/fiber']
          : ['three', 'react', '@react-three/fiber'],
        plugins: format === 'cjs' ? [bareThreeExternal] : [],
        outfile: path.resolve(__dirname, `../build/${component}.${extension}`),
      });
    }
  }

  // Portable CodePen snippets embed the current implementation, so no unpublished
  // package version or feature branch URL is required to run them.
  const imports = {
    react: 'https://esm.sh/react@18.3.1',
    'react/jsx-runtime': 'https://esm.sh/react@18.3.1/jsx-runtime?external=react',
    'react-dom/client': 'https://esm.sh/react-dom@18.3.1/client?external=react',
    '@react-three/fiber': 'https://esm.sh/@react-three/fiber@8.18.0?external=react,react-dom,three',
    'react-dom': 'https://esm.sh/react-dom@18.3.1?external=react',
    three: 'https://cdn.jsdelivr.net/npm/three@0.150.1/build/three.module.js',
    'three/': 'https://cdn.jsdelivr.net/npm/three@0.150.1/',
  };
  const exampleDir = path.resolve(__dirname, '../examples/codepen');
  fs.mkdirSync(exampleDir, { recursive: true });
  for (const component of ['react', 'r3f']) {
    const result = await es.build({
      entryPoints: [path.resolve(__dirname, `../examples/${component}.js`)],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      external: ['three', 'react', 'react-dom', '@react-three/fiber'],
      write: false,
    });
    const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
    fs.writeFileSync(path.join(exampleDir, `${component}.html`), `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Force Directed Graph — ${component}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #111827; color: #f1f5f9; font: 15px system-ui; }
  header { height: 170px; padding: 16px 24px; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  p { color: #94a3b8; }
  button { margin-right: 8px; padding: 7px 12px; cursor: pointer; }
  output { display: block; margin-top: 8px; }
</style>
<div id="root"></div>
<script type="importmap">${JSON.stringify({ imports }, null, 2)}</script>
<script type="module">
${script}
</script>
`);
  }
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
