const fs = require('fs');
const path = require('path');
const es = require('esbuild');
const entryPoints = [path.resolve(__dirname, '../src/index.js')];

es.buildSync({
  entryPoints,
  bundle: true,
  platform: 'node',
  outfile: path.resolve(__dirname, '../build/fdg.umd.js')
});

es.buildSync({
  entryPoints,
  bundle: true,
  platform: 'neutral',
  outfile: path.resolve(__dirname, '../build/fdg.module.js')
});

es.buildSync({
  entryPoints,
  bundle: true,
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
