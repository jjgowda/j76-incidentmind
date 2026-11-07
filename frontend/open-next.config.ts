import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// This dashboard is dynamic and does not use ISR or an incremental cache.
export default defineCloudflareConfig({});
