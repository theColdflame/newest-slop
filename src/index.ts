import { Hono } from "hono";

export interface Env {
  ASSETS: Fetcher;
}

const app = new Hono()
  .get("/api/health", (c) => c.json({ 
    status: "ok", 
    module: "wod5e-dynamic-tile-tracker", 
    fvttVersion: "14", 
    wod5eVersion: "5.3.28" 
  }))
  .get("/module.json", (c) => {
    const manifest = {
      id: "wod5e-dynamic-tile-tracker",
      title: "World of Darkness 5e - Dynamic Tile Tracker",
      description: "Foundry VTT v14 module for World of Darkness 5e (5.3.28) that updates tile textures, tints, and overlays in real-time based on Actor Health, Willpower, and Hunger/Rage trackers.",
      version: "1.0.0",
      compatibility: {
        minimum: "14",
        verified: "14"
      },
      authors: [
        {
          name: "WoD5e VTT Tools",
          discord: "wod5e-vtt-devs"
        }
      ],
      relationships: {
        systems: [
          {
            id: "wod5e",
            type: "system",
            compatibility: {
              minimum: "5.3.0",
              verified: "5.3.28"
            }
          }
        ]
      },
      esmodules: [
        "scripts/module.mjs"
      ],
      styles: [
        "styles/module.css"
      ],
      languages: [
        {
          lang: "en",
          name: "English",
          path: "lang/en.json"
        }
      ],
      url: "https://github.com/foundryvtt/wod5e-dynamic-tile-tracker",
      manifest: "https://raw.githubusercontent.com/foundryvtt/wod5e-dynamic-tile-tracker/main/module.json",
      download: "https://github.com/foundryvtt/wod5e-dynamic-tile-tracker/releases/download/v1.0.0/wod5e-dynamic-tile-tracker-v14.zip"
    };
    return c.json(manifest);
  })
  .get("/api/manifest.json", (c) => {
    return c.redirect("/module.json");
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await app.fetch(request, env);
    if (response.status !== 404) {
      return response;
    }
    return env.ASSETS.fetch(request);
  }
};
