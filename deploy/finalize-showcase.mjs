import { rename, rmdir } from "node:fs/promises";

// Vite preserves the second entry's directory; Render expects a root index.
await rename("dist-showcase/showcase/index.html", "dist-showcase/index.html");
await rmdir("dist-showcase/showcase");
