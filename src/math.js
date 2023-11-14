const pot = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096];

/**
 * 
 * @param {Number} number - The number to snap to a power of two size
 * @returns 
 */
export function getPotSize(number) {
  const side = Math.floor(Math.sqrt(number)) + 1;
  for (let i = 0; i < pot.length; i++) {
    if (pot[i] >= side) {
      return pot[i];
    }
  }
  console.error('ForceDirectedGraph: Texture size is too big.',
    'Consider reducing the size of your data.');
}

/**
 * 
 * @param {Number} x - the value to clamp
 * @param {Number} min - the minimum possible value
 * @param {Number} max - the maximum possible value
 * @returns {Number}
 */
export function clamp(x, min, max) {
  return Math.min(Math.max(x, min), max);
}

const maxFrames = 1000;

/**
 * An asynchronous each loop. Max 
 * @param {Array} list - an array like object that can be iterated over
 * @param {Function} func - the function to iterate passing in the index and value each time it's invoked
 * @param {Number} [step] - the amount the iterator should increment by. Default is 1
 * @param {Number} [max] - the max number of iterations before request animation is invoked. Default is 1000
 * @returns {Promise}
 */
export function each(list, func, step, max) {

  if (typeof step !== 'number') {
    step = 1;
  }
  if (typeof max !== 'number') {
    max = maxFrames;
  }

  return new Promise((resolve) => {

    exec(0);

    function exec(start) {
      const limit = Math.min(start + maxFrames, list.length);
      let i = start;

      while (i < limit) {
        func(i, list[i]);
        i += step;
      }

      if (limit < list.length) {
        requestAnimationFrame(() => exec(i));
      } else {
        resolve();
      }
    }

  });

}