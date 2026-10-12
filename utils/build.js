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
    build.onResolve({ filter: /^three$/ }, () => ({
      path: 'three',
      external: true,
    }));
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
      cwd: path.resolve(__dirname, '..'),
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
    console.warn(
      'WASM build failed, continuing with JavaScript builds:',
      error.message,
    );
  }

  await es.build({
    entryPoints,
    bundle: true,
    platform: 'node',
    plugins: [bareThreeExternal],
    outfile: path.resolve(__dirname, '../build/fdg.umd.js'),
  });

  await es.build({
    entryPoints,
    bundle: true,
    platform: 'neutral',
    external: ['three'],
    outfile: path.resolve(__dirname, '../build/fdg.module.js'),
  });

  await es.build({
    entryPoints,
    bundle: true,
    external: ['three'],
    outfile: path.resolve(__dirname, '../build/fdg.js'),
  });

  var contents = fs.readFileSync(
    path.resolve(__dirname, '../build/fdg.js'),
    'utf-8',
  );
  contents = contents.replace(
    /(var ForceDirectedGraph = )/i,
    '$1 window.ForceDirectedGraph = ',
  );
  fs.writeFileSync(path.resolve(__dirname, '../build/fdg.js'), contents);

  // Keep React and Fiber optional and out of the core and each other's bundles.
  for (const component of ['react', 'r3f']) {
    for (const [format, extension] of [
      ['esm', 'mjs'],
      ['cjs', 'cjs'],
    ]) {
      await es.build({
        entryPoints: [path.resolve(__dirname, `../src/${component}/index.js`)],
        bundle: true,
        format,
        platform: 'neutral',
        external:
          format === 'cjs'
            ? ['react', '@react-three/fiber']
            : ['three', 'react', '@react-three/fiber'],
        plugins: format === 'cjs' ? [bareThreeExternal] : [],
        outfile: path.resolve(__dirname, `../build/${component}.${extension}`),
      });
    }
  }
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
