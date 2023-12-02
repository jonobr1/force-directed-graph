class Registry {
  map = {};
  constructor(list) {
    if (list && list.length > 0) {
      for (let i = 0; i < list.length; i++) {
        this.set(i, list[i]);
      }
    }
  }
  get(id) {
    return this.map[id];
  }
  set(index, item) {
    if (item.id !== 'undefined') {
      this.map[item.id] = index;
    }
  }
  clear() {
    this.map = {};
  }
}

export { Registry };
