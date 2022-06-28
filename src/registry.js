class Registry {
  map = {};
  constructor(list) {
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (item.id !== 'undefined') {
        this.map[item.id] = i;
      }
    }
  }
  get(id) {
    return this.map[id];
  }
}

export { Registry };
