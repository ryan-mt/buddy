// Unit-test config, separate from vite.config.ts on purpose: tests don't need
// the react/tailwind plugins (or the fixed Tauri dev port), and skipping them
// keeps the test startup fast.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
