import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Connect } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// The NDJSON feeds live at the repo root. Serve them from the dev/preview
// server so the app can fetch them live, the same way the old Bun server did.
const FEEDS: Record<string, string> = {
  "/api/dotprice": join(repoRoot, "dotprice.ndjson"),
  "/api/usdprice": join(repoRoot, "usdprice.ndjson"),
};

const feedMiddleware: Connect.NextHandleFunction = async (req, res, next) => {
  const path = (req.url ?? "").split("?")[0] ?? "";
  const file = FEEDS[path];
  if (!file) return next();
  try {
    const text = await readFile(file, "utf8");
    res.setHeader("content-type", "application/x-ndjson; charset=utf-8");
    res.end(text);
  } catch {
    res.statusCode = 404;
    res.end(`missing feed: ${file}`);
  }
};

function feedApi() {
  return {
    name: "feed-api",
    configureServer(server: { middlewares: Connect.Server }) {
      server.middlewares.use(feedMiddleware);
    },
    configurePreviewServer(server: { middlewares: Connect.Server }) {
      server.middlewares.use(feedMiddleware);
    },
  };
}

export default defineConfig({
  plugins: [react(), feedApi()],
  server: { port: 3000 },
  preview: { port: 3000 },
});
