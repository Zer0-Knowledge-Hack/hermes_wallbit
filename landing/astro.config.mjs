import { defineConfig } from "astro/config";

export default defineConfig({
  // Fully static: Cloudflare Pages serves the output directly, no adapter and
  // no server runtime. Anything that needs a secret or the Durable Objects
  // stays in the Worker.
  output: "static",
  compressHTML: true,
});
