/**
 * Metro-compatible terser minifier wrapper.
 *
 * Metro expects minifierPath to point to a module exporting a `minify`
 * function with signature: (code, sourceMap, filename, config) => result.
 */
const { minify: terserMinify } = require("terser");

async function minify(code, sourceMap, _filename, config) {
  const result = await terserMinify(code, {
    ...config,
    sourceMap: sourceMap
      ? { content: sourceMap, asObject: true }
      : false,
  });
  return {
    code: result.code ?? "",
    map: result.map ?? undefined,
  };
}

module.exports = minify;
