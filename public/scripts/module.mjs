/**
 * World of Darkness 5e - Dynamic Tile Tracker Module
 * Compatible with Foundry VTT v14 & WoD5e system version 5.3.28
 */

import { WoD5eTileTrackerEngine } from "./wod5e-tile-tracker.mjs";
import { WoD5eTileConfigExtension } from "./tile-config-extension.mjs";
import { WoD5eTileHUDExtension } from "./tile-hud-extension.mjs";

Hooks.once("init", () => {
  console.log("WoD5e Dynamic Tile Tracker | Initializing module for Foundry VTT v14 & WoD5e 5.3.28");

  // Register Module Settings
  game.settings.register("wod5e-dynamic-tile-tracker", "enableDebug", {
    name: game.i18n.localize("WOD5E_TILE.SettingsEnableDebug") || "Enable Debug Logging",
    hint: game.i18n.localize("WOD5E_TILE.SettingsEnableDebugHint") || "Logs dynamic tile evaluation decisions to developer console.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register("wod5e-dynamic-tile-tracker", "updateDebounce", {
    name: game.i18n.localize("WOD5E_TILE.SettingsUpdateDebounce") || "Update Throttle Debounce (ms)",
    hint: game.i18n.localize("WOD5E_TILE.SettingsUpdateDebounceHint") || "Throttle rapid health/willpower adjustments before tile texture renders.",
    scope: "world",
    config: true,
    type: Number,
    default: 150
  });
});

Hooks.once("ready", () => {
  console.log("WoD5e Dynamic Tile Tracker | Ready hook - initializing tile engines");
  WoD5eTileTrackerEngine.init();
});

// Reactivity Hooks for Real-Time Actor Tracker Updates
Hooks.on("updateActor", (actor, changes, options, userId) => {
  const sys = changes.system;
  if (!sys) return;

  const healthChanged = "health" in sys;
  const willpowerChanged = "willpower" in sys;
  const hungerChanged = "hunger" in sys || "rage" in sys || "desperation" in sys;
  const frenzyChanged = "frenzy" in sys || "isFrenzied" in sys;

  if (healthChanged || willpowerChanged || hungerChanged || frenzyChanged) {
    WoD5eTileTrackerEngine.onActorTrackerUpdated(actor);
  }
});

// Reactivity Hooks for Active Effect Changes (e.g. Frenzy Effect applied / removed)
const onActiveEffectChange = (effect) => {
  const actor = effect.parent;
  if (actor && actor.documentName === "Actor") {
    const isFrenzyEffect = effect.name?.toLowerCase().includes("frenzy") || 
                           effect.label?.toLowerCase().includes("frenzy") ||
                           (effect.statuses && (effect.statuses.has("frenzy") || effect.statuses.has("frenzied")));
    if (isFrenzyEffect) {
      WoD5eTileTrackerEngine.onActorTrackerUpdated(actor);
    }
  }
};

Hooks.on("createActiveEffect", onActiveEffectChange);
Hooks.on("deleteActiveEffect", onActiveEffectChange);
Hooks.on("updateActiveEffect", onActiveEffectChange);

// Pre-update hook to parse dynamic level mapping and rules JSON before saving
Hooks.on("preUpdateTile", (tileDoc, changes, options, userId) => {
  const config = changes.flags?.["wod5e-dynamic-tile-tracker"]?.config;
  if (!config) return;

  if (typeof config.statMapJson === "string") {
    try {
      config.statMap = JSON.parse(config.statMapJson);
      delete config.statMapJson;
    } catch (e) {
      console.error("WoD5e Dynamic Tile Tracker | Error parsing statMapJson in preUpdateTile:", e);
    }
  }

  if (typeof config.rulesJson === "string") {
    try {
      config.rules = JSON.parse(config.rulesJson);
      delete config.rulesJson;
    } catch (e) {
      console.error("WoD5e Dynamic Tile Tracker | Error parsing rulesJson in preUpdateTile:", e);
    }
  }
});

// Re-eval Tile when Tile Document is Updated or Created
Hooks.on("updateTile", (tileDoc, changes, options, userId) => {
  const flags = changes.flags?.["wod5e-dynamic-tile-tracker"];
  if (flags) {
    WoD5eTileTrackerEngine.evaluateTile(tileDoc);
  }
});

// Inject Custom Configuration Tab into Tile Config Sheet
Hooks.on("renderTileConfig", (app, html, data) => {
  WoD5eTileConfigExtension.attachTab(app, html, data);
});

// Add HUD Action Button to Canvas Tile HUD
Hooks.on("renderTileHUD", (app, html, data) => {
  WoD5eTileHUDExtension.attachButton(app, html, data);
});
