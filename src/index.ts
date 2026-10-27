import { Hono } from "hono";

type Bindings = {
  ASSETS: Fetcher;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    module: "wod5e-dynamic-tile-tracker",
    fvttVersion: "14",
    wod5eVersion: "5.3.28",
  });
});

app.get("/module.json", (c) => {
  return c.json({
    id: "wod5e-dynamic-tile-tracker",
    title: "World of Darkness 5e - Dynamic Tile Tracker",
    description: "Foundry VTT v14 module for World of Darkness 5e (5.3.28) that updates tile textures, tints, and overlays in real-time based on Actor Health, Willpower, Hunger, Rage, and Frenzy trackers.",
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
  });
});

app.get("/*", async (c) => {
  try {
    return await c.env.ASSETS.fetch(c.req.raw);
  } catch {
    return c.text("Not found", 404);
  }
});

export default app;
