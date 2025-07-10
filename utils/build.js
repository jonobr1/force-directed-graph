const fs = require('fs');
const path = require('path');
const es = require('esbuild');
const { execSync } = require('child_process');
const entryPoints = [path.resolve(__dirname, '../src/index.js')];

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

es.buildSync({
  entryPoints,
  bundle: true,
  platform: 'node',
  external: ['three'],
  outfile: path.resolve(__dirname, '../build/fdg.umd.js')
});

es.buildSync({
  entryPoints,
  bundle: true,
  platform: 'neutral',
  external: ['three'],
  outfile: path.resolve(__dirname, '../build/fdg.module.js')
});

es.buildSync({
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
