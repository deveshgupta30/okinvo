import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

const alias = {
  "server-only": new URL("./tests/stubs/server-only.ts", import.meta.url).pathname,
};

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: { alias },
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/server/**", "scripts/**"],
      exclude: ["src/generated/**"],
    },
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"] },
      },
      {
        // Integration files share one database and global state (the default issuer profile,
        // AppSetting rows), so they run one file at a time.
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
