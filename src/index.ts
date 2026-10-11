import { DurableObject } from "cloudflare:workers";
import { Hono } from "hono";

export class App extends DurableObject {
  private app = new Hono()
    .get("/api/health", (c) => c.json({ status: "ok", module: "wod5e-dynamic-tile-tracker", fvttVersion: "14", wod5eVersion: "5.3.28" }))
    .get("/api/manifest.json", (c) => {
      const manifest = {
        id: "wod5e-dynamic-tile-tracker",
        title: "World of Darkness 5e - Dynamic Tile Tracker",
        description: "Foundry VTT v14 module that dynamically updates canvas tile textures and visuals in real-time based on WoD5e actor Health, Willpower, and Hunger trackers.",
        version: "1.0.0",
        compatibility: {
          minimum: "14",
          verified: "14"
        },
        authors: [
          {
            name: "WoD5e Foundry Tools",
            discord: "wod5e-devs"
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
        manifest: "https://github.com/foundryvtt/wod5e-dynamic-tile-tracker/releases/latest/download/module.json",
        download: "https://github.com/foundryvtt/wod5e-dynamic-tile-tracker/releases/download/v1.0.0/module.zip"
      };
      return c.json(manifest);
    });

  async fetch(request: Request) {
    return this.app.fetch(request);
  }
}
