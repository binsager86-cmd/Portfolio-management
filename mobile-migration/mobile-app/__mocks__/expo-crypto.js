module.exports = {
  digestStringAsync: jest.fn().mockResolvedValue("mock-sha256-hash"),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
};
