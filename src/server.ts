// Local development server. The production build is a static site (see build.ts).
import { serve } from "bun";
import index from "./index.html";

const server = serve({
  routes: {
    // Serve the single-page app for every route; React Router handles the rest.
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,
    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
