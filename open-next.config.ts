import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Revisit once the real R2 bucket exists: add the R2 incremental-cache
// override here (see opennext.js.org/cloudflare/caching) so ISR/cache
// revalidation persists across Worker invocations instead of using the
// default in-memory fallback.
export default defineCloudflareConfig();
