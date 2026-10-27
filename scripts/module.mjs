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

  game.settings.register("wod5e-dynamic-tile-tracker", "defaultFileSource", {
    name: game.i18n.localize("WOD5E_TILE.SettingsDefaultFileSource") || "Default File Picker Storage Location",
    hint: game.i18n.localize("WOD5E_TILE.SettingsDefaultFileSourceHint") || "Path through User Data directory (Data/), S3, Forge, or Public.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      "data": "User Data Directory (Data/) [Default]",
      "s3": "Amazon S3 Storage (s3)",
      "forgevtt": "The Forge VTT Storage (forgevtt)",
      "public": "Core / Public Packages (public)"
    },
    default: "data"
  });
});

Hooks.once("ready", () => {
  console.log("WoD5e Dynamic Tile Tracker | Ready hook - initializing tile engines");
  WoD5eTileTrackerEngine.init();
});

// Reactivity Hooks for Real-Time Actor Tracker Updates
Hooks.on("updateActor", (actor, changes, options, userId) => {
  WoD5eTileTrackerEngine.onActorTrackerUpdated(actor);
});

// Reactivity Hooks for Token Document Updates (Synthetic Tokens)
Hooks.on("updateToken", (tokenDoc, changes, options, userId) => {
  const actor = tokenDoc.actor;
  if (actor) {
    WoD5eTileTrackerEngine.onActorTrackerUpdated(actor);
  }
});

// Reactivity Hooks for Active Effect Changes (e.g. Frenzy Effect applied / removed)
const onActiveEffectChange = (effect) => {
  const actor = effect.parent;
  if (actor && actor.documentName === "Actor") {
    const nameStr = (effect.name || effect.label || "").toLowerCase();
    const isFrenzyEffect = nameStr.includes("frenzy") || 
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
  const expanded = typeof foundry !== "undefined" && foundry.utils?.expandObject 
    ? foundry.utils.expandObject(changes) 
    : changes;

  const moduleConfig = expanded.flags?.["wod5e-dynamic-tile-tracker"]?.config || 
                       changes.flags?.["wod5e-dynamic-tile-tracker"]?.config;

  if (!moduleConfig) return;

  if (moduleConfig.statMapJson !== undefined) {
    try {
      const parsedMap = typeof moduleConfig.statMapJson === "string" 
        ? JSON.parse(moduleConfig.statMapJson) 
        : moduleConfig.statMapJson;

      if (!changes.flags) changes.flags = {};
      if (!changes.flags["wod5e-dynamic-tile-tracker"]) changes.flags["wod5e-dynamic-tile-tracker"] = {};
      if (!changes.flags["wod5e-dynamic-tile-tracker"].config) changes.flags["wod5e-dynamic-tile-tracker"].config = {};

      changes.flags["wod5e-dynamic-tile-tracker"].config.statMap = parsedMap;
      changes["flags.wod5e-dynamic-tile-tracker.config.statMap"] = parsedMap;
    } catch (e) {
      console.error("WoD5e Dynamic Tile Tracker | Error parsing statMapJson in preUpdateTile:", e);
    }
  }

  if (moduleConfig.rulesJson !== undefined) {
    try {
      const parsedRules = typeof moduleConfig.rulesJson === "string" 
        ? JSON.parse(moduleConfig.rulesJson) 
        : moduleConfig.rulesJson;

      if (!changes.flags) changes.flags = {};
      if (!changes.flags["wod5e-dynamic-tile-tracker"]) changes.flags["wod5e-dynamic-tile-tracker"] = {};
      if (!changes.flags["wod5e-dynamic-tile-tracker"].config) changes.flags["wod5e-dynamic-tile-tracker"].config = {};

      changes.flags["wod5e-dynamic-tile-tracker"].config.rules = parsedRules;
      changes["flags.wod5e-dynamic-tile-tracker.config.rules"] = parsedRules;
    } catch (e) {
      console.error("WoD5e Dynamic Tile Tracker | Error parsing rulesJson in preUpdateTile:", e);
    }
  }
});

// Re-eval Tile when Tile Document is Updated or Created
Hooks.on("updateTile", (tileDoc, changes, options, userId) => {
  const hasModuleFlags = changes.flags?.["wod5e-dynamic-tile-tracker"] ||
                         Object.keys(changes).some(k => k.startsWith("flags.wod5e-dynamic-tile-tracker"));
  if (hasModuleFlags) {
    WoD5eTileTrackerEngine.debouncedEvaluateTile(tileDoc);
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
