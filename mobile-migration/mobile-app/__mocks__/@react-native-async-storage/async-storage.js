const store = {};

module.exports = {
  default: {
    getItem: jest.fn((key) => Promise.resolve(store[key] ?? null)),
    setItem: jest.fn((key, value) => {
      store[key] = value;
      return Promise.resolve(undefined);
    }),
    removeItem: jest.fn((key) => {
      delete store[key];
      return Promise.resolve(undefined);
    }),
  },
};
