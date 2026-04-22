// Jest shim for `expo/virtual/streams` — exposes the standard Web Streams
// API constructors that some Expo modules import via the virtual module.
// Node 18+ provides these as globals; we just re-export them for the
// virtual module path so jest-expo can resolve it during tests.
const g = globalThis;

module.exports = {
  ReadableStream: g.ReadableStream,
  WritableStream: g.WritableStream,
  TransformStream: g.TransformStream,
  ByteLengthQueuingStrategy: g.ByteLengthQueuingStrategy,
  CountQueuingStrategy: g.CountQueuingStrategy,
};
