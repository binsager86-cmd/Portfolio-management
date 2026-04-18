// Shim that re-exports Node.js native web streams (fixes expo/virtual/streams crash in Node 24)
module.exports = require("node:stream/web");
