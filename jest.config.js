module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["**/__tests__/**/*.test.ts?(x)"],
  collectCoverageFrom: [
    "src/lib/poker/**/*.{ts,tsx}",
    "!src/lib/poker/**/*.d.ts",
    "!src/lib/poker/__tests__/**",
  ],
};
