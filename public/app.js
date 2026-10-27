const { useState, useEffect, useMemo, createElement: h } = React;
const { createRoot } = ReactDOM;
const html = htm.bind(h);

// MODULE FILE CONTENTS FOR ZIP PACKAGING
const MODULE_JSON_CONTENT = `{
  "id": "wod5e-dynamic-tile-tracker",
  "title": "World of Darkness 5e - Dynamic Tile Tracker",
  "description": "Foundry VTT v14 module for World of Darkness 5e (5.3.28) that updates tile textures, tints, and overlays in real-time based on Actor Health, Willpower, Hunger, and Frenzy trackers.",
  "version": "1.0.0",
  "compatibility": {
    "minimum": "14",
    "verified": "14"
  },
  "authors": [
    {
      "name": "WoD5e VTT Tools",
      "discord": "wod5e-vtt-devs"
    }
  ],
  "relationships": {
    "systems": [
      {
        "id": "wod5e",
        "type": "system",
        "compatibility": {
          "minimum": "5.3.0",
          "verified": "5.3.28"
        }
      }
    ]
  },
  "esmodules": [
    "scripts/module.mjs"
  ],
  "styles": [
    "styles/module.css"
  ],
  "languages": [
    {
      "lang": "en",
      "name": "English",
      "path": "lang/en.json"
    }
  ],
  "url": "https://github.com/foundryvtt/wod5e-dynamic-tile-tracker",
  "manifest": "https://raw.githubusercontent.com/foundryvtt/wod5e-dynamic-tile-tracker/main/module.json",
  "download": "https://github.com/foundryvtt/wod5e-dynamic-tile-tracker/releases/download/v1.0.0/wod5e-dynamic-tile-tracker-v14.zip"
}`;

const MODULE_MJS_CONTENT = `/**
 * World of Darkness 5e - Dynamic Tile Tracker Module
 * Compatible with Foundry VTT v14 & WoD5e system version 5.3.28
 */

import { WoD5eTileTrackerEngine } from "./wod5e-tile-tracker.mjs";
import { WoD5eTileConfigExtension } from "./tile-config-extension.mjs";
import { WoD5eTileHUDExtension } from "./tile-hud-extension.mjs";

Hooks.once("init", () => {
  console.log("WoD5e Dynamic Tile Tracker | Initializing module for Foundry VTT v14 & WoD5e 5.3.28");

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

Hooks.on("updateTile", (tileDoc, changes, options, userId) => {
  const flags = changes.flags?.["wod5e-dynamic-tile-tracker"];
  if (flags) {
    WoD5eTileTrackerEngine.evaluateTile(tileDoc);
  }
});

Hooks.on("renderTileConfig", (app, html, data) => {
  WoD5eTileConfigExtension.attachTab(app, html, data);
});

Hooks.on("renderTileHUD", (app, html, data) => {
  WoD5eTileHUDExtension.attachButton(app, html, data);
});
`;

const WOD5E_TILE_TRACKER_MJS_CONTENT = `/**
 * Core Tile Tracker Engine for WoD5e 5.3.28 in Foundry VTT v14
 */

export class WoD5eTileTrackerEngine {
  static MODULE_ID = "wod5e-dynamic-tile-tracker";

  static init() {
    this._debouncedUpdates = new Map();
  }

  static onActorTrackerUpdated(actor) {
    if (!actor) return;
    const scene = canvas.scene;
    if (!scene) return;

    const boundTiles = scene.tiles.filter(t => {
      const config = t.getFlag(this.MODULE_ID, "config");
      return config && config.enabled && config.actorId === actor.id;
    });

    for (const tileDoc of boundTiles) {
      this.evaluateTile(tileDoc, actor);
    }
  }

  static async evaluateTile(tileDoc, actorOverride = null) {
    const config = tileDoc.getFlag(this.MODULE_ID, "config");
    if (!config || !config.enabled) return;

    const actor = actorOverride || game.actors.get(config.actorId);
    if (!actor) return;

    const stats = this.extractWoD5eStats(actor);

    let targetSrc = null;
    let targetTint = null;
    let targetAlpha = null;
    let targetScale = null;
    let targetHidden = null;

    const isNoTileVal = (val) => {
      if (val === undefined || val === null) return false;
      const s = String(val).trim().toLowerCase();
      return s === "__none__" || s === "none" || s === "hidden" || s === "invisible";
    };

    if (config.statMap?.enabled && config.statMap?.statType) {
      const levelImage = this.getStatLevelImage(config.statMap, stats);
      if (levelImage !== null) {
        if (isNoTileVal(levelImage)) {
          targetSrc = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E";
          targetAlpha = 0;
          targetHidden = true;
        } else {
          targetSrc = levelImage;
        }
      }
    }

    if (targetSrc === null && targetHidden !== true && config.rules && config.rules.length > 0) {
      for (const rule of config.rules) {
        if (this.checkRuleMatch(rule, stats)) {
          if (rule.hideTile || isNoTileVal(rule.image)) {
            targetSrc = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E";
            targetAlpha = 0;
            targetHidden = true;
          } else {
            targetSrc = rule.image;
            targetTint = rule.tint || null;
            targetAlpha = rule.alpha ?? null;
            targetScale = rule.scale ?? null;
            targetHidden = false;
          }
          break;
        }
      }
    }

    if (targetSrc === null && targetHidden !== true) {
      if (config.defaultHide || isNoTileVal(config.defaultImage)) {
        targetSrc = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E";
        targetAlpha = 0;
        targetHidden = true;
      } else {
        targetSrc = config.defaultImage || tileDoc.texture.src;
      }
    }

    targetTint = targetTint || config.defaultTint || null;
    targetAlpha = targetAlpha ?? (targetHidden ? 0 : (config.defaultAlpha ?? 1.0));
    targetScale = targetScale ?? config.defaultScale ?? 1.0;
    targetHidden = targetHidden ?? false;

    const updates = {
      texture: { src: targetSrc, tint: targetTint },
      alpha: targetAlpha,
      scaleX: targetScale,
      scaleY: targetScale,
      hidden: targetHidden
    };

    if (tileDoc.texture.src !== targetSrc || tileDoc.texture.tint !== targetTint || tileDoc.alpha !== targetAlpha || tileDoc.hidden !== targetHidden) {
      await tileDoc.update(updates);
    }
  }

  static getStatLevelImage(statMap, stats) {
    if (!statMap || !statMap.levels) return null;
    let currentVal = 0;
    switch (statMap.statType) {
      case "hunger": currentVal = stats.hungerVal; break;
      case "frenzy": currentVal = stats.isFrenzied ? 1 : 0; break;
      case "health_agg": currentVal = stats.healthAgg; break;
      case "health_sup": currentVal = stats.healthSup; break;
      case "health_total": currentVal = stats.totalHealthDamage; break;
      case "health_remaining": currentVal = Math.max(0, stats.healthMax - stats.totalHealthDamage); break;
      case "willpower_agg": currentVal = stats.wpAgg; break;
      case "willpower_total": currentVal = stats.totalWpDamage; break;
      default: currentVal = 0;
    }

    const img = statMap.levels[currentVal] ?? statMap.levels[String(currentVal)];
    if (img === undefined || img === null) return null;
    return String(img).trim();
  }

  static extractWoD5eStats(actor) {
    const sys = actor.system || {};
    const health = sys.health || { max: 6, aggravated: 0, superficial: 0 };
    const healthMax = Number(health.max || 6);
    const healthAgg = Number(health.aggravated || 0);
    const healthSup = Number(health.superficial || 0);
    const totalHealthDamage = healthAgg + healthSup;
    const healthPercent = Math.max(0, Math.min(100, Math.round(((healthMax - totalHealthDamage) / healthMax) * 100)));

    const willpower = sys.willpower || { max: 6, aggravated: 0, superficial: 0 };
    const wpMax = Number(willpower.max || 6);
    const wpAgg = Number(willpower.aggravated || 0);
    const wpSup = Number(willpower.superficial || 0);
    const totalWpDamage = wpAgg + wpSup;

    const hungerVal = Number(sys.hunger?.value ?? sys.rage?.value ?? sys.desperation?.value ?? 0);

    const isFrenzied = Boolean(
      sys.frenzy?.active ||
      sys.frenzy?.value ||
      sys.frenzy === true ||
      sys.isFrenzied ||
      (actor.statuses && (actor.statuses.has("frenzy") || actor.statuses.has("frenzied"))) ||
      (actor.effects && actor.effects.some(e => !e.disabled && (
        e.name?.toLowerCase().includes("frenzy") ||
        e.label?.toLowerCase().includes("frenzy") ||
        (e.statuses && (e.statuses.has("frenzy") || e.statuses.has("frenzied")))
      )))
    );

    return {
      healthMax, healthAgg, healthSup, totalHealthDamage, healthPercent,
      isHealthImpaired: totalHealthDamage >= healthMax,
      isTorpor: healthAgg >= healthMax,
      wpMax, wpAgg, wpSup, totalWpDamage,
      isWpImpaired: totalWpDamage >= wpMax,
      hungerVal,
      isFrenzied,
      frenzyVal: isFrenzied ? 1 : 0
    };
  }

  static checkRuleMatch(rule, stats) {
    if (!rule || !rule.enabled) return false;
    if ((rule.conditionType === "hunger_equals" || rule.conditionType === "hunger_exact") && stats.hungerVal !== Number(rule.value)) return false;
    if (rule.conditionType === "hunger_gte" && stats.hungerVal < Number(rule.value)) return false;
    if ((rule.conditionType === "health_agg_equals") && stats.healthAgg !== Number(rule.value)) return false;
    if (rule.conditionType === "health_aggravated" && stats.healthAgg < Number(rule.value)) return false;
    if (rule.conditionType === "health_torpor" && !stats.isTorpor) return false;
    if (rule.conditionType === "frenzy_active" && !stats.isFrenzied) return false;
    if (rule.conditionType === "frenzy_inactive" && stats.isFrenzied) return false;
    if (rule.conditionType === "hunger_and_frenzy" && (!stats.isFrenzied || stats.hungerVal < Number(rule.value))) return false;
    return true;
  }
}
`;

const DEFAULT_HUNGER_LEVEL_MAP = {
  "0": "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=600&auto=format&fit=crop&q=80",
  "1": "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80",
  "2": "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80",
  "3": "https://images.unsplash.com/photo-1563089145-599997674d42?w=600&auto=format&fit=crop&q=80",
  "4": "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=600&auto=format&fit=crop&q=80",
  "5": "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80"
};

const DEFAULT_FRENZY_LEVEL_MAP = {
  "0": "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=600&auto=format&fit=crop&q=80",
  "1": "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=600&auto=format&fit=crop&q=80"
};

const STAT_TYPES = [
  { id: "hunger", label: "Hunger / Rage / Desperation (0 to 5)", maxLevel: 5 },
  { id: "frenzy", label: "Frenzy State (0 = Calm, 1 = Frenzied)", maxLevel: 1 },
  { id: "health_agg", label: "Aggravated Health Damage (0 to 10)", maxLevel: 10 },
  { id: "health_sup", label: "Superficial Health Damage (0 to 10)", maxLevel: 10 },
  { id: "health_total", label: "Total Health Damage (0 to 10)", maxLevel: 10 },
  { id: "health_remaining", label: "Remaining Health Points (0 to 10)", maxLevel: 10 },
  { id: "willpower_agg", label: "Aggravated Willpower Damage (0 to 10)", maxLevel: 10 },
  { id: "willpower_total", label: "Total Willpower Damage (0 to 10)", maxLevel: 10 }
];

function App() {
  const [activeTab, setActiveTab] = useState("simulator");
  const [actorName, setActorName] = useState("Julian the Toreador");
  const [hungerVal, setHungerVal] = useState(2);
  const [isFrenzied, setIsFrenzied] = useState(false);
  const [healthMax, setHealthMax] = useState(6);
  const [healthAgg, setHealthAgg] = useState(0);
  const [healthSup, setHealthSup] = useState(2);
  const [wpMax, setWpMax] = useState(6);
  const [wpAgg, setWpAgg] = useState(0);
  const [wpSup, setWpSup] = useState(1);
  const [isDownloading, setIsDownloading] = useState(false);

  // Stat level maps per stat type
  const [statMapType, setStatMapType] = useState("hunger");
  const [allStatMaps, setAllStatMaps] = useState({
    hunger: DEFAULT_HUNGER_LEVEL_MAP,
    frenzy: DEFAULT_FRENZY_LEVEL_MAP
  });
  const [autoFillPattern, setAutoFillPattern] = useState("assets/wod5e/{type}_{level}.webp");
  const [defaultImage, setDefaultImage] = useState(DEFAULT_HUNGER_LEVEL_MAP["0"]);

  const statLevelImages = allStatMaps[statMapType] || {};

  // Priority Rules State
  const [rules, setRules] = useState([
    { id: "1", name: "Frenzy Active Override", conditionType: "frenzy_active", value: 1, hideTile: false, image: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=600&auto=format&fit=crop&q=80", tint: "#991b1b", alpha: 1.0, enabled: true },
    { id: "2", name: "Torpor Condition - Hide Tile", conditionType: "health_torpor", value: 6, hideTile: true, image: "__NONE__", tint: "#581c87", alpha: 0.0, enabled: true },
    { id: "3", name: "Hunger 5 & Frenzy Combined", conditionType: "hunger_and_frenzy", value: 5, hideTile: false, image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80", tint: "#7f1d1d", alpha: 1.0, enabled: true }
  ]);

  const totalHealthDamage = healthAgg + healthSup;
  const isTorpor = healthAgg >= healthMax;
  const isHealthImpaired = totalHealthDamage >= healthMax;
  const healthPercent = Math.max(0, Math.min(100, Math.round(((healthMax - totalHealthDamage) / healthMax) * 100)));

  // Helper to check if string means no visual tile
  const isNoTile = (val) => {
    if (!val) return false;
    const s = String(val).trim().toLowerCase();
    return s === "__none__" || s === "none" || s === "hidden" || s === "invisible";
  };

  // Tile evaluation computation
  const tileEvaluation = useMemo(() => {
    let currentVal = 0;
    switch (statMapType) {
      case "hunger": currentVal = hungerVal; break;
      case "frenzy": currentVal = isFrenzied ? 1 : 0; break;
      case "health_agg": currentVal = healthAgg; break;
      case "health_sup": currentVal = healthSup; break;
      case "health_total": currentVal = totalHealthDamage; break;
      case "health_remaining": currentVal = Math.max(0, healthMax - totalHealthDamage); break;
      case "willpower_agg": currentVal = wpAgg; break;
      case "willpower_sup": currentVal = wpSup; break;
      case "willpower_total": currentVal = wpAgg + wpSup; break;
      default: currentVal = 0;
    }

    if (statLevelImages) {
      const levelImg = statLevelImages[String(currentVal)];
      if (levelImg && levelImg.trim().length > 0) {
        if (isNoTile(levelImg)) {
          return {
            type: "level_map",
            matchedName: `${statMapType.toUpperCase()} Level ${currentVal} [TILE HIDDEN / NO VISUAL]`,
            image: null,
            hiddenTile: true,
            tint: null,
            alpha: 0,
            scale: 1.0
          };
        }
        return {
          type: "level_map",
          matchedName: `${statMapType.toUpperCase()} Level ${currentVal} Mapped Texture`,
          image: levelImg,
          hiddenTile: false,
          tint: null,
          alpha: 1.0,
          scale: 1.0
        };
      }
    }

    const stats = {
      healthMax, healthAgg, healthSup, totalHealthDamage, healthPercent,
      isHealthImpaired, isTorpor, wpMax, wpAgg, wpSup,
      hungerVal, isFrenzied
    };

    for (const rule of rules) {
      if (!rule.enabled) continue;
      
      let matched = false;
      if (rule.conditionType === "frenzy_active" && stats.isFrenzied) matched = true;
      else if (rule.conditionType === "frenzy_inactive" && !stats.isFrenzied) matched = true;
      else if (rule.conditionType === "hunger_and_frenzy" && stats.isFrenzied && stats.hungerVal >= rule.value) matched = true;
      else if (rule.conditionType === "health_torpor" && stats.isTorpor) matched = true;
      else if (rule.conditionType === "health_aggravated" && stats.healthAgg >= rule.value) matched = true;
      else if (rule.conditionType === "hunger_equals" && stats.hungerVal === rule.value) matched = true;
      else if (rule.conditionType === "hunger_gte" && stats.hungerVal >= rule.value) matched = true;

      if (matched) {
        if (rule.hideTile || isNoTile(rule.image)) {
          return {
            type: "rule",
            matchedName: `${rule.name} [HIDE TILE CONDITION TRIGGERED]`,
            image: null,
            hiddenTile: true,
            tint: null,
            alpha: 0,
            scale: 1.0
          };
        }
        return {
          type: "rule",
          matchedName: rule.name,
          image: rule.image,
          hiddenTile: false,
          tint: rule.tint,
          alpha: rule.alpha ?? 1.0,
          scale: rule.scale ?? 1.0
        };
      }
    }

    if (isNoTile(defaultImage)) {
      return {
        type: "default",
        matchedName: "Default Texture [HIDE TILE / NO VISUAL]",
        image: null,
        hiddenTile: true,
        tint: null,
        alpha: 0,
        scale: 1.0
      };
    }

    return {
      type: "default",
      matchedName: "Default Base Texture",
      image: defaultImage || DEFAULT_HUNGER_LEVEL_MAP["0"],
      hiddenTile: false,
      tint: null,
      alpha: 1.0,
      scale: 1.0
    };
  }, [statMapType, statLevelImages, hungerVal, isFrenzied, healthMax, healthAgg, healthSup, wpMax, wpAgg, wpSup, rules, defaultImage]);

  const handleDownloadZip = async () => {
    setIsDownloading(true);
    try {
      const zip = new JSZip();
      zip.file("module.json", MODULE_JSON_CONTENT);
      zip.file("README.md", `# World of Darkness 5e - Dynamic Tile Tracker\n\nFoundry VTT v14 & WoD5e 5.3.28 module.`);
      zip.file("lang/en.json", `{\n  "WOD5E_TILE.TabTitle": "WoD5e Tracker"\n}`);
      zip.file("styles/module.css", `/* WoD5e Dynamic Tile Tracker CSS */\n.wod5e-tracker-tab { padding: 8px; }`);
      zip.file("scripts/module.mjs", MODULE_MJS_CONTENT);
      zip.file("scripts/wod5e-tile-tracker.mjs", WOD5E_TILE_TRACKER_MJS_CONTENT);
      zip.file("scripts/tile-config-extension.mjs", `/* Tile Config Sheet Extension */`);
      zip.file("scripts/tile-hud-extension.mjs", `/* Tile HUD Extension */`);

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "wod5e-dynamic-tile-tracker-v14.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("ZIP package error:", err);
      alert("Error generating zip package: " + err.message);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleAutoFillPattern = () => {
    if (!autoFillPattern.includes("{level}")) {
      alert("Pattern must include '{level}' placeholder, e.g. tiles/hunger_{level}.webp");
      return;
    }
    const max = STAT_TYPES.find(s => s.id === statMapType)?.maxLevel || 5;
    const newMap = {};
    for (let i = 0; i <= max; i++) {
      newMap[String(i)] = autoFillPattern.replace("{level}", i);
    }
    setStatLevelImages(newMap);
  };

  const currentMaxLevel = STAT_TYPES.find(s => s.id === statMapType)?.maxLevel || 5;

  return html`
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <!-- Top Navigation Header -->
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-50">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-red-950 border border-red-700 flex items-center justify-center text-red-500 shadow-lg shadow-red-950/50">
            <i className="fas fa-droplet text-lg"></i>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="font-serif font-bold text-lg text-slate-100">WoD5e Dynamic Tile Tracker</h1>
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800 font-semibold">
                Foundry VTT v14
              </span>
            </div>
            <p className="text-xs text-slate-400">WoD5e System 5.3.28 Compatible • Real-Time Health, Willpower, Hunger & Frenzy Sync</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick=${handleDownloadZip}
            disabled=${isDownloading}
            className="px-4 py-2 bg-gradient-to-r from-red-700 to-red-900 hover:from-red-600 hover:to-red-800 text-white font-medium text-xs rounded-lg border border-red-500 shadow-lg shadow-red-950/50 flex items-center space-x-2 transition disabled:opacity-50"
          >
            <i className=${`fas ${isDownloading ? "fa-spinner fa-spin" : "fa-file-zipper"}`}></i>
            <span>${isDownloading ? "Packaging..." : "Download Module ZIP"}</span>
          </button>
        </div>
      </header>

      <!-- Navigation Tabs -->
      <nav className="bg-slate-900/80 border-b border-slate-800 px-4 flex items-center gap-2 overflow-x-auto text-xs font-medium">
        <button
          onClick=${() => setActiveTab("simulator")}
          className=${`px-4 py-3 border-b-2 flex items-center space-x-2 transition whitespace-nowrap ${
            activeTab === "simulator"
              ? "border-red-500 text-red-400 font-bold bg-slate-800/50"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <i className="fas fa-eye text-red-400"></i>
          <span>Interactive Canvas Simulator</span>
        </button>

        <button
          onClick=${() => setActiveTab("statmap")}
          className=${`px-4 py-3 border-b-2 flex items-center space-x-2 transition whitespace-nowrap ${
            activeTab === "statmap"
              ? "border-red-500 text-red-400 font-bold bg-slate-800/50"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <i className="fas fa-image text-amber-400"></i>
          <span>Images per Stat Level Grid</span>
        </button>

        <button
          onClick=${() => setActiveTab("rules")}
          className=${`px-4 py-3 border-b-2 flex items-center space-x-2 transition whitespace-nowrap ${
            activeTab === "rules"
              ? "border-red-500 text-red-400 font-bold bg-slate-800/50"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <i className="fas fa-sliders text-purple-400"></i>
          <span>Priority Rules Builder</span>
        </button>
      </nav>

      <!-- Main Body Container -->
      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6">
        ${activeTab === "simulator" && html`
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <!-- Left Column: Controls & Actor Trackers -->
            <div className="lg:col-span-5 space-y-6 bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h2 className="font-serif text-base font-bold text-red-200 flex items-center gap-2">
                  <i className="fas fa-user-ninja text-red-400"></i>
                  Actor & Tracker Controls
                </h2>
                <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  WoD5e 5.3.28
                </span>
              </div>

              <!-- FRENZY TOGGLE SWITCH -->
              <div className="bg-slate-950 p-4 rounded-lg border border-red-900/60 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 font-semibold text-sm text-red-400">
                    <i className="fas fa-fire-flame-curved text-red-500"></i>
                    <span>Frenzy State</span>
                  </div>
                  <button
                    onClick=${() => setIsFrenzied(!isFrenzied)}
                    className=${`px-4 py-1.5 rounded-full text-xs font-bold border transition flex items-center gap-2 ${
                      isFrenzied
                        ? "bg-gradient-to-r from-red-600 to-purple-800 border-red-400 text-white shadow-lg shadow-red-950/80 animate-pulse"
                        : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <i className=${`fas ${isFrenzied ? "fa-bolt" : "fa-shield"}`}></i>
                    <span>${isFrenzied ? "ACTIVE FRENZY" : "CALM / STANDARD"}</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Toggle Frenzy on/off to see Frenzy level mappings and priority rules trigger in real-time on the canvas tile!
                </p>
              </div>

              <!-- HUNGER TRACKER -->
              <div className="bg-slate-950 p-4 rounded-lg border border-red-950/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-red-400 font-semibold text-sm">
                    <i className="fas fa-droplet text-red-500"></i>
                    <span>Hunger Level Tracker</span>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-red-950 text-red-300 border border-red-800">
                    Hunger ${hungerVal} / 5
                  </span>
                </div>

                <div className="grid grid-cols-6 gap-1.5 pt-1">
                  ${[0, 1, 2, 3, 4, 5].map((lvl) => html`
                    <button
                      key=${lvl}
                      onClick=${() => setHungerVal(lvl)}
                      className=${`py-2 rounded font-bold text-xs border transition ${
                        hungerVal === lvl
                          ? "bg-red-600 border-red-400 text-white shadow-lg shadow-red-900/50 scale-105"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      ${lvl}
                    </button>
                  `)}
                </div>
              </div>

              <!-- HEALTH TRACKER -->
              <div className="bg-slate-950 p-4 rounded-lg border border-red-950/60 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-red-400 font-semibold text-sm">
                    <i className="fas fa-heart text-red-500"></i>
                    <span>Health Tracker</span>
                  </div>
                  <div className="text-xs">
                    ${isTorpor ? html`
                      <span className="px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-700 font-bold animate-pulse">
                        TORPOR / INCAP
                      </span>
                    ` : html`
                      <span className="text-slate-400">${healthPercent}% Health</span>
                    `}
                  </div>
                </div>

                <div className="space-y-3 pt-1 text-xs">
                  <div>
                    <div className="flex justify-between text-slate-300 mb-1">
                      <span>Aggravated Damage [X]</span>
                      <span className="font-bold text-red-400">${healthAgg} / ${healthMax}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max=${healthMax}
                      value=${healthAgg}
                      onChange=${(e) => {
                        const val = Number(e.target.value);
                        setHealthAgg(val);
                        if (val + healthSup > healthMax) setHealthSup(Math.max(0, healthMax - val));
                      }}
                      className="w-full accent-red-600 bg-slate-800 rounded h-1.5 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-300 mb-1">
                      <span>Superficial Damage [/]</span>
                      <span className="font-bold text-amber-400">${healthSup} / ${healthMax}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max=${healthMax - healthAgg}
                      value=${healthSup}
                      onChange=${(e) => setHealthSup(Number(e.target.value))}
                      className="w-full accent-amber-500 bg-slate-800 rounded h-1.5 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- Right Column: Simulated VTT Canvas View -->
            <div className="lg:col-span-7 bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-xl flex flex-col space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2">
                  <i className="fas fa-layer-group text-red-400"></i>
                  <h2 className="font-serif text-base font-bold text-slate-100">Live Foundry Canvas Tile Rendering</h2>
                </div>
                <div className="flex items-center space-x-2 text-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                  <span className="text-slate-400">Real-Time Evaluation</span>
                </div>
              </div>

              <!-- SIMULATED CANVAS TILE -->
              <div className="relative aspect-video rounded-xl overflow-hidden border border-slate-800 bg-grid-pattern bg-slate-950 flex items-center justify-center p-6 shadow-inner">
                <div className="relative group transition-all duration-300 transform scale-100">
                  ${tileEvaluation.hiddenTile ? html`
                    <!-- HIDDEN / NO VISUAL TILE RENDERING -->
                    <div className="w-64 h-64 rounded-lg border-2 border-dashed border-red-500/60 bg-red-950/20 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center space-y-2 shadow-2xl transition-all duration-300">
                      <i className="fas fa-eye-slash text-3xl text-red-400 animate-pulse"></i>
                      <span className="font-mono font-bold text-xs text-red-300 uppercase tracking-wider">
                        [ TILE HIDDEN / INVISIBLE ]
                      </span>
                      <p className="text-[11px] text-slate-400 max-w-[200px]">
                        Condition satisfied: No visual image displayed on canvas.
                      </p>
                    </div>
                  ` : html`
                    <!-- VISUAL TILE IMAGE RENDERING -->
                    <div
                      className="w-64 h-64 rounded-lg overflow-hidden border-2 border-red-900/60 shadow-2xl transition-all duration-500 relative"
                      style=${{
                        backgroundImage: `url(${tileEvaluation.image})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        opacity: tileEvaluation.alpha,
                        transform: `scale(${tileEvaluation.scale})`
                      }}
                    >
                      ${tileEvaluation.tint && html`
                        <div
                          className="absolute inset-0 transition-all duration-300 pointer-events-none mix-blend-multiply"
                          style=${{ backgroundColor: tileEvaluation.tint, opacity: 0.7 }}
                        />
                      `}

                      <div className="absolute inset-x-0 bottom-0 bg-slate-950/90 backdrop-blur-md p-3 border-t border-slate-800 text-xs space-y-1">
                        <div className="flex items-center justify-between font-bold text-slate-100">
                          <span className="text-red-400 truncate">${tileEvaluation.matchedName}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                            ${tileEvaluation.type}
                          </span>
                        </div>
                        <p className="text-[10px] font-mono text-slate-400 truncate">
                          ${tileEvaluation.image}
                        </p>
                      </div>
                    </div>
                  `}
                </div>
              </div>

              <!-- Matched Evaluation Details -->
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-300 font-semibold border-b border-slate-800 pb-2">
                  <span>Current Active Match:</span>
                  <span className="text-amber-400 font-mono">${tileEvaluation.matchedName}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                  <div>Visible Texture: <span className="text-slate-200 font-mono truncate block">${tileEvaluation.hiddenTile ? "NONE (Hidden)" : tileEvaluation.image}</span></div>
                  <div>Tint Color: <span className="text-slate-200 font-mono">${tileEvaluation.tint || "None"}</span></div>
                  <div>Alpha / Opacity: <span className="text-slate-200 font-mono">${tileEvaluation.alpha}</span></div>
                  <div>Tile State: <span className=${tileEvaluation.hiddenTile ? "text-red-400 font-bold" : "text-emerald-400 font-bold"}>${tileEvaluation.hiddenTile ? "HIDDEN (No Visual Tile)" : "VISIBLE"}</span></div>
                </div>
              </div>
            </div>
          </div>
        `}

        ${activeTab === "statmap" && html`
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-xl space-y-6">
            <div className="border-b border-slate-800 pb-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-serif text-lg font-bold text-amber-200 flex items-center gap-2">
                  <i className="fas fa-image text-amber-400"></i>
                  Specific Images Per Stat Level (Level Mapping)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Assign a unique image path (or click <strong>Hide Tile</strong>) for every numerical value of Hunger, Frenzy, or Health/Willpower damage!
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-300 font-semibold">Tracked Stat:</label>
                <select
                  value=${statMapType}
                  onChange=${(e) => {
                    const newType = e.target.value;
                    setStatMapType(newType);
                    if (newType === "frenzy") setStatLevelImages(DEFAULT_FRENZY_LEVEL_MAP);
                    else if (newType === "hunger") setStatLevelImages(DEFAULT_HUNGER_LEVEL_MAP);
                  }}
                  className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-100 font-medium outline-none focus:border-red-500"
                >
                  ${STAT_TYPES.map(s => html`
                    <option key=${s.id} value=${s.id}>${s.label}</option>
                  `)}
                </select>
              </div>
            </div>

            <!-- Auto-Fill Pattern Helper -->
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-3">
              <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <i className="fas fa-wand-magic-sparkles text-amber-400"></i>
                Batch Auto-Fill Level Image Pattern
              </h3>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value=${autoFillPattern}
                  onChange=${(e) => setAutoFillPattern(e.target.value)}
                  placeholder="modules/wod5e-dynamic-tile-tracker/assets/hunger_{level}.webp"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-200 outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick=${handleAutoFillPattern}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs rounded border border-amber-400 flex items-center gap-1.5 transition"
                >
                  <i className="fas fa-bolt"></i>
                  <span>Auto-fill Levels</span>
                </button>
              </div>
            </div>

            <!-- Level Entry Grid -->
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Level Mapping Entries (0 to ${currentMaxLevel})
              </h3>

              <div className="grid grid-cols-1 gap-2">
                ${Array.from({ length: currentMaxLevel + 1 }).map((_, level) => {
                  const keyStr = String(level);
                  const currentVal = statLevelImages[keyStr] || "";
                  const levelLabel = statMapType === "frenzy" 
                    ? (level === 0 ? "Level 0 (Calm / Inactive)" : "Level 1 (Frenzied / Active)")
                    : `Level ${level}`;

                  return html`
                    <div key=${level} className="flex items-center gap-3 bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 hover:border-slate-700">
                      <div className="w-48 font-mono text-xs font-bold text-amber-400 flex items-center gap-1.5">
                        <span className="w-6 h-6 rounded bg-amber-950 text-amber-300 border border-amber-800 flex items-center justify-center text-[11px]">
                          ${level}
                        </span>
                        <span>${levelLabel}</span>
                      </div>

                      <input
                        type="text"
                        value=${currentVal}
                        onChange=${(e) => {
                          const val = e.target.value;
                          setStatLevelImages(prev => ({ ...prev, [keyStr]: val }));
                        }}
                        placeholder="Path or __NONE__ to hide tile..."
                        className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-200 outline-none focus:border-amber-500"
                      />

                      <button
                        type="button"
                        onClick=${() => setStatLevelImages(prev => ({ ...prev, [keyStr]: "__NONE__" }))}
                        className="px-3 py-1.5 bg-red-950/80 hover:bg-red-900 text-red-300 text-xs font-medium rounded border border-red-800 flex items-center gap-1 transition"
                        title="Set this level to hide tile completely"
                      >
                        <i className="fas fa-eye-slash"></i>
                        <span>Hide Tile</span>
                      </button>

                      <button
                        type="button"
                        onClick=${() => alert(`In Foundry VTT, opens native FilePicker for level ${level}!`)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded border border-slate-700 flex items-center gap-1.5 transition"
                      >
                        <i className="fas fa-folder-open text-amber-400"></i>
                        <span>Browse File</span>
                      </button>
                    </div>
                  `;
                })}
              </div>
            </div>
          </div>
        `}

        ${activeTab === "rules" && html`
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-xl space-y-6">
            <div className="border-b border-slate-800 pb-4 flex items-center justify-between">
              <div>
                <h2 className="font-serif text-lg font-bold text-purple-200 flex items-center gap-2">
                  <i className="fas fa-sliders text-purple-400"></i>
                  Priority Condition Rules
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Evaluated top to bottom if no stat level map image matches. Toggle <strong>Hide Tile</strong> on any rule to render no visual tile when matched!
                </p>
              </div>

              <button
                type="button"
                onClick=${() => {
                  setRules(prev => [
                    ...prev,
                    { id: String(Date.now()), name: `Rule #${prev.length + 1}`, conditionType: "frenzy_active", value: 1, hideTile: false, image: "", tint: "#ffffff", alpha: 1.0, enabled: true }
                  ]);
                }}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded border border-purple-400 flex items-center gap-1.5 transition"
              >
                <i className="fas fa-plus"></i>
                <span>Add New Rule</span>
              </button>
            </div>

            <div className="space-y-4">
              ${rules.map((rule, index) => html`
                <div key=${rule.id} className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="w-5 h-5 rounded-full bg-purple-950 text-purple-300 border border-purple-800 text-[11px] font-bold flex items-center justify-center font-mono">
                        #${index + 1}
                      </span>
                      <input
                        type="text"
                        value=${rule.name}
                        onChange=${(e) => {
                          const val = e.target.value;
                          setRules(prev => prev.map(r => r.id === rule.id ? { ...r, name: val } : r));
                        }}
                        className="bg-transparent text-slate-100 font-semibold text-xs border-b border-slate-700 focus:border-red-500 outline-none px-1"
                      />
                    </div>

                    <div className="flex items-center space-x-3 text-xs">
                      <label className="flex items-center space-x-1.5 cursor-pointer text-red-400 font-medium">
                        <input
                          type="checkbox"
                          checked=${rule.hideTile || rule.image === "__NONE__"}
                          onChange=${(e) => {
                            const checked = e.target.checked;
                            setRules(prev => prev.map(r => r.id === rule.id ? { ...r, hideTile: checked, image: checked ? "__NONE__" : "" } : r));
                          }}
                          className="rounded border-slate-700 accent-red-600"
                        />
                        <span>Hide Tile Completely</span>
                      </label>

                      <button
                        type="button"
                        onClick=${() => setRules(prev => prev.filter(r => r.id !== rule.id))}
                        className="text-slate-500 hover:text-red-400 p-1 transition"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="text-slate-400 block text-[11px] mb-1">Trigger Condition:</label>
                      <select
                        value=${rule.conditionType}
                        onChange=${(e) => {
                          const val = e.target.value;
                          setRules(prev => prev.map(r => r.id === rule.id ? { ...r, conditionType: val } : r));
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200 outline-none"
                      >
                        <option value="frenzy_active">Frenzy Active (In Frenzy)</option>
                        <option value="frenzy_inactive">Frenzy Inactive (Calm)</option>
                        <option value="hunger_and_frenzy">Hunger >= Value AND In Frenzy</option>
                        <option value="health_torpor">Incapacitated / Torpor State</option>
                        <option value="hunger_equals">Hunger Exact Match (=)</option>
                        <option value="hunger_gte">Hunger Greater Than or Equal (>=)</option>
                        <option value="health_aggravated">Aggravated Health Damage (>=)</option>
                      </select>
                    </div>

                    ${!rule.hideTile && rule.image !== "__NONE__" && html`
                      <div>
                        <label className="text-slate-400 block text-[11px] mb-1">Image Texture Path:</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value=${rule.image}
                            onChange=${(e) => {
                              const val = e.target.value;
                              setRules(prev => prev.map(r => r.id === rule.id ? { ...r, image: val } : r));
                            }}
                            className="flex-1 bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-slate-200 outline-none"
                            placeholder="tiles/frenzy.png"
                          />
                          <button
                            type="button"
                            onClick=${() => alert(`In Foundry VTT, opens native FilePicker for this rule!`)}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded border border-slate-700 flex items-center gap-1 transition"
                          >
                            <i className="fas fa-folder-open text-amber-400"></i>
                            <span>Browse File</span>
                          </button>
                        </div>
                      </div>
                    `}
                  </div>
                </div>
              `)}
            </div>
          </div>
        `}
      </main>
    </div>
  `;
}

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(html`<${App} />`);
}
