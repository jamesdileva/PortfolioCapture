import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@renderer": path.resolve(__dirname, "apps/desktop/renderer/src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environmentMatchGlobs: [
      ["tests/renderer/**/*.test.tsx", "jsdom"],
    ],
    onConsoleLog(msg) {
      if (msg.includes("not wrapped in act")) return false;
    },
  },
});
