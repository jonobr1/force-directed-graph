var pot = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096];

function getPotSize(number) {
  const side = Math.floor(Math.sqrt(number)) + 1;
  for (let i = 0; i < pot.length; i++) {
    if (pot[i] >= side) {
      return pot[i];
    }
  }
  console.error('ForceDirectedGraph: Texture size is too big.',
    'Consider reducing the size of your data.');
}

export { getPotSize };
