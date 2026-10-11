const { useState, useEffect, useMemo, createElement: h } = React;
const { createRoot } = ReactDOM;
const html = htm.bind(h);

// MODULE FILE CONTENTS FOR ZIP PACKAGING
const MODULE_JSON_CONTENT = `{
  "id": "wod5e-dynamic-tile-tracker",
  "title": "World of Darkness 5e - Dynamic Tile Tracker",
  "description": "Foundry VTT v14 module for World of Darkness 5e (5.3.28) that updates tile textures, tints, and overlays in real-time based on Actor Health, Willpower, and Hunger/Rage trackers.",
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

  if (healthChanged || willpowerChanged || hungerChanged) {
    WoD5eTileTrackerEngine.onActorTrackerUpdated(actor);
  }
});

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

    if (config.statMap?.enabled && config.statMap?.statType) {
      const levelImage = this.getStatLevelImage(config.statMap, stats);
      if (levelImage) {
        targetSrc = levelImage;
      }
    }

    if (!targetSrc && config.rules && config.rules.length > 0) {
      for (const rule of config.rules) {
        if (this.checkRuleMatch(rule, stats)) {
          targetSrc = rule.image;
          targetTint = rule.tint || null;
          targetAlpha = rule.alpha ?? null;
          targetScale = rule.scale ?? null;
          break;
        }
      }
    }

    if (!targetSrc) {
      targetSrc = config.defaultImage || tileDoc.texture.src;
    }

    targetTint = targetTint || config.defaultTint || null;
    targetAlpha = targetAlpha ?? config.defaultAlpha ?? 1.0;
    targetScale = targetScale ?? config.defaultScale ?? 1.0;

    const updates = {
      texture: { src: targetSrc, tint: targetTint },
      alpha: targetAlpha,
      scaleX: targetScale,
      scaleY: targetScale
    };

    if (tileDoc.texture.src !== targetSrc || tileDoc.texture.tint !== targetTint || tileDoc.alpha !== targetAlpha) {
      await tileDoc.update(updates);
    }
  }

  static getStatLevelImage(statMap, stats) {
    if (!statMap || !statMap.levels) return null;
    let currentVal = 0;
    switch (statMap.statType) {
      case "hunger": currentVal = stats.hungerVal; break;
      case "health_agg": currentVal = stats.healthAgg; break;
      case "health_sup": currentVal = stats.healthSup; break;
      case "health_total": currentVal = stats.totalHealthDamage; break;
      case "health_remaining": currentVal = Math.max(0, stats.healthMax - stats.totalHealthDamage); break;
      case "willpower_agg": currentVal = stats.wpAgg; break;
      case "willpower_total": currentVal = stats.totalWpDamage; break;
      default: currentVal = 0;
    }

    const img = statMap.levels[currentVal] ?? statMap.levels[String(currentVal)];
    return img && typeof img === "string" && img.trim().length > 0 ? img.trim() : null;
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

    return {
      healthMax, healthAgg, healthSup, totalHealthDamage, healthPercent,
      isHealthImpaired: totalHealthDamage >= healthMax,
      isTorpor: healthAgg >= healthMax,
      wpMax, wpAgg, wpSup, totalWpDamage,
      isWpImpaired: totalWpDamage >= wpMax,
      hungerVal
    };
  }

  static checkRuleMatch(rule, stats) {
    if (!rule || !rule.enabled) return false;
    if ((rule.conditionType === "hunger_equals" || rule.conditionType === "hunger_exact") && stats.hungerVal !== rule.value) return false;
    if (rule.conditionType === "hunger_gte" && stats.hungerVal < rule.value) return false;
    if ((rule.conditionType === "health_agg_equals") && stats.healthAgg !== rule.value) return false;
    if (rule.conditionType === "health_aggravated" && stats.healthAgg < rule.value) return false;
    if (rule.conditionType === "health_torpor" && !stats.isTorpor) return false;
    return true;
  }
}
`;

const TILE_CONFIG_EXTENSION_MJS_CONTENT = `/**
 * Extension for Tile Config Sheet in Foundry VTT v14
 */

export class WoD5eTileConfigExtension {
  static attachTab(app, html, data) {
    const nav = html.find("nav.sheet-tabs, nav.tabs");
    if (!nav.length) return;

    const tabButton = \`
      <a class="item" data-tab="wod5e-tracker">
        <i class="fas fa-tint text-red-500"></i> WoD5e Tracker
      </a>
    \`;
    nav.append(tabButton);

    const tileDoc = app.object;
    const config = tileDoc?.getFlag("wod5e-dynamic-tile-tracker", "config") || {
      enabled: false,
      actorId: "",
      defaultImage: tileDoc?.texture?.src || "",
      statMap: {
        enabled: true,
        statType: "hunger",
        levels: {}
      },
      rules: []
    };

    const actors = game.actors.contents.map(a => \`<option value="\${a.id}" \${a.id === config.actorId ? "selected" : ""}>\${a.name}</option>\`).join("");

    const tabContent = \`
      <div class="tab wod5e-tracker-tab" data-tab="wod5e-tracker">
        <div class="form-group">
          <label>Enable Real-Time WoD5e Tracking</label>
          <input type="checkbox" name="flags.wod5e-dynamic-tile-tracker.config.enabled" \${config.enabled ? "checked" : ""}/>
        </div>

        <div class="form-group">
          <label>Target Actor</label>
          <select name="flags.wod5e-dynamic-tile-tracker.config.actorId">
            <option value="">-- Select Actor --</option>
            \${actors}
          </select>
        </div>

        <div class="form-group">
          <label>Default / Fallback Texture</label>
          <div class="form-fields">
            <input type="text" name="flags.wod5e-dynamic-tile-tracker.config.defaultImage" value="\${config.defaultImage || ''}"/>
            <button type="button" class="file-picker wod5e-browse-btn" data-type="imagevideo" data-target="flags.wod5e-dynamic-tile-tracker.config.defaultImage">
              <i class="fas fa-folder-open"></i> Browse
            </button>
          </div>
        </div>
      </div>
    \`;

    const body = html.find("section.sheet-body");
    body.append(tabContent);
  }
}
`;

const TILE_HUD_EXTENSION_MJS_CONTENT = `/**
 * Tile HUD Extension for quick toggle and refresh
 */

export class WoD5eTileHUDExtension {
  static attachButton(app, html, data) {
    const tileDoc = app.object?.document;
    if (!tileDoc) return;

    const config = tileDoc.getFlag("wod5e-dynamic-tile-tracker", "config");
    if (!config || !config.enabled) return;

    const btn = \`
      <div class="control-icon wod5e-hud-btn" title="Re-evaluate WoD5e Dynamic Tile">
        <i class="fas fa-blood-drop text-red-500"></i>
      </div>
    \`;

    const col = html.find(".col.right");
    if (col.length) {
      const el = $(btn);
      el.click(async () => {
        const { WoD5eTileTrackerEngine } = await import("./wod5e-tile-tracker.mjs");
        await WoD5eTileTrackerEngine.evaluateTile(tileDoc);
        ui.notifications.info("WoD5e Dynamic Tile re-evaluated!");
      });
      col.append(el);
    }
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

const STAT_TYPES = [
  { id: "hunger", label: "Hunger / Rage / Desperation (0 to 5)", maxLevel: 5 },
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
  const [healthMax, setHealthMax] = useState(6);
  const [healthAgg, setHealthAgg] = useState(0);
  const [healthSup, setHealthSup] = useState(2);
  const [wpMax, setWpMax] = useState(6);
  const [wpAgg, setWpAgg] = useState(0);
  const [wpSup, setWpSup] = useState(1);
  const [isDownloading, setIsDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Stat level images state
  const [statMapType, setStatMapType] = useState("hunger");
  const [hungerLevelImages, setHungerLevelImages] = useState(DEFAULT_HUNGER_LEVEL_MAP);
  const [autoFillPattern, setAutoFillPattern] = useState("modules/wod5e-dynamic-tile-tracker/assets/vampire_hunger_{level}.webp");
  const [defaultImage, setDefaultImage] = useState(DEFAULT_HUNGER_LEVEL_MAP["0"]);

  // Priority Rules State
  const [rules, setRules] = useState([
    { id: "1", name: "Torpor Condition", conditionType: "health_torpor", value: 6, image: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80", tint: "#581c87", alpha: 0.8, enabled: true },
    { id: "2", name: "High Aggravated Health", conditionType: "health_aggravated", value: 3, image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80", tint: "#991b1b", alpha: 1.0, enabled: true },
    { id: "3", name: "Hunger 5 Bestial Frenzy", conditionType: "hunger_equals", value: 5, image: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=600&auto=format&fit=crop&q=80", tint: "#7f1d1d", alpha: 1.0, enabled: true }
  ]);

  const totalHealthDamage = healthAgg + healthSup;
  const isTorpor = healthAgg >= healthMax;
  const isHealthImpaired = totalHealthDamage >= healthMax;
  const healthPercent = Math.max(0, Math.min(100, Math.round(((healthMax - totalHealthDamage) / healthMax) * 100)));

  // Tile evaluation computation
  const tileEvaluation = useMemo(() => {
    if (statMapType === "hunger" && hungerLevelImages) {
      const levelImg = hungerLevelImages[String(hungerVal)];
      if (levelImg && levelImg.trim().length > 0) {
        return {
          type: "level_map",
          matchedName: `Hunger Level ${hungerVal} Specific Image`,
          image: levelImg,
          tint: null,
          alpha: 1.0,
          scale: 1.0
        };
      }
    }

    const stats = {
      healthMax, healthAgg, healthSup, totalHealthDamage, healthPercent,
      isHealthImpaired, isTorpor, wpMax, wpAgg, wpSup,
      hungerVal
    };

    for (const rule of rules) {
      if (!rule.enabled) continue;
      
      let matched = false;
      if (rule.conditionType === "health_torpor" && stats.isTorpor) matched = true;
      else if (rule.conditionType === "health_aggravated" && stats.healthAgg >= rule.value) matched = true;
      else if (rule.conditionType === "hunger_equals" && stats.hungerVal === rule.value) matched = true;
      else if (rule.conditionType === "hunger_gte" && stats.hungerVal >= rule.value) matched = true;

      if (matched) {
        return {
          type: "rule",
          matchedName: rule.name,
          image: rule.image,
          tint: rule.tint,
          alpha: rule.alpha ?? 1.0,
          scale: rule.scale ?? 1.0
        };
      }
    }

    return {
      type: "default",
      matchedName: "Default Base Texture",
      image: defaultImage || DEFAULT_HUNGER_LEVEL_MAP["0"],
      tint: null,
      alpha: 1.0,
      scale: 1.0
    };
  }, [statMapType, hungerLevelImages, hungerVal, healthMax, healthAgg, healthSup, wpMax, wpAgg, wpSup, rules, defaultImage]);

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
      zip.file("scripts/tile-config-extension.mjs", TILE_CONFIG_EXTENSION_MJS_CONTENT);
      zip.file("scripts/tile-hud-extension.mjs", TILE_HUD_EXTENSION_MJS_CONTENT);

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
    setHungerLevelImages(newMap);
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
            <p className="text-xs text-slate-400">WoD5e System 5.3.28 Compatible • Real-time Health, Willpower & Hunger Sync</p>
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

              <!-- HUNGER TRACKER -->
              <div className="bg-slate-950 p-4 rounded-lg border border-red-950/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-red-400 font-semibold text-sm">
                    <i className="fas fa-fire text-red-500"></i>
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
                <p className="text-[11px] text-slate-400 italic">
                  Change Hunger level (0 to 5) to watch the canvas tile instantly switch to the image assigned specifically for that level!
                </p>
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
                </div>
              </div>

              <!-- Matched Evaluation Details -->
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-300 font-semibold border-b border-slate-800 pb-2">
                  <span>Current Active Rule/Map Output:</span>
                  <span className="text-amber-400 font-mono">${tileEvaluation.type}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                  <div>Active Image: <span className="text-slate-200 font-mono truncate block">${tileEvaluation.image}</span></div>
                  <div>Tint Color: <span className="text-slate-200 font-mono">${tileEvaluation.tint || "None"}</span></div>
                  <div>Alpha / Opacity: <span className="text-slate-200 font-mono">${tileEvaluation.alpha}</span></div>
                  <div>Scale Multiplier: <span className="text-slate-200 font-mono">${tileEvaluation.scale}x</span></div>
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
                  Assign a unique image path for every numerical value of a stat (e.g., Hunger 0, 1, 2, 3, 4, 5). Includes <strong>Browse File</strong> buttons for each row!
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-300 font-semibold">Tracked Stat:</label>
                <select
                  value=${statMapType}
                  onChange=${(e) => setStatMapType(e.target.value)}
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
                  const currentVal = hungerLevelImages[keyStr] || "";
                  return html`
                    <div key=${level} className="flex items-center gap-3 bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 hover:border-slate-700">
                      <div className="w-20 font-mono text-xs font-bold text-amber-400 flex items-center gap-1.5">
                        <span className="w-6 h-6 rounded bg-amber-950 text-amber-300 border border-amber-800 flex items-center justify-center text-[11px]">
                          ${level}
                        </span>
                        <span>Level ${level}</span>
                      </div>

                      <input
                        type="text"
                        value=${currentVal}
                        onChange=${(e) => {
                          const val = e.target.value;
                          setHungerLevelImages(prev => ({ ...prev, [keyStr]: val }));
                        }}
                        placeholder=${`Image path for level ${level}...`}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-200 outline-none focus:border-amber-500"
                      />

                      <!-- BROWSE FILE BUTTON -->
                      <button
                        type="button"
                        onClick=${() => alert(`In Foundry VTT, opens FilePicker modal to select image for Level ${level}!`)}
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
                  Evaluated from top to bottom if no stat level map image is configured.
                </p>
              </div>
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
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
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
                        />
                        <!-- BROWSE FILE BUTTON -->
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

                    <div>
                      <label className="text-slate-400 block text-[11px] mb-1">Color Tint (Hex):</label>
                      <input
                        type="text"
                        value=${rule.tint || ""}
                        onChange=${(e) => {
                          const val = e.target.value;
                          setRules(prev => prev.map(r => r.id === rule.id ? { ...r, tint: val } : r));
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-slate-200 outline-none"
                        placeholder="#991b1b"
                      />
                    </div>
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
