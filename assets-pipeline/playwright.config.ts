import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  use: {
    baseURL: process.env.SDK_PLAYGROUND_URL ?? "https://sdk.staging.libratech.ai",
    colorScheme: "light",
    deviceScaleFactor: 2,
    ...devices["Desktop Chrome"],
  },
  projects: [
    {
      name: "chromium-light",
      use: { ...devices["Desktop Chrome"], colorScheme: "light" },
    },
  ],
});
