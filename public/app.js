import React, { useState, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import htm from "htm";
import { 
  Heart, 
  Flame, 
  Brain, 
  Image as ImageIcon, 
  Sliders, 
  Download, 
  Copy, 
  Check, 
  FileCode, 
  Layers, 
  Play, 
  RefreshCw, 
  ShieldAlert, 
  Sparkles, 
  ExternalLink, 
  BookOpen, 
  Eye, 
  Plus, 
  Trash2, 
  Settings, 
  User, 
  Zap, 
  Info,
  CheckCircle2,
  AlertTriangle,
  FolderZip,
  Wand2,
  FolderOpen
} from "lucide-react";
import JSZip from "jszip";

const html = htm.bind(React.createElement);

// MODULE FILE CONTENTS
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

const DEFAULT_HUNGER_LEVEL_MAP = {
  "0": "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=600&auto=format&fit=crop&q=80",
  "1": "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80",
  "2": "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80",
  "3": "https://images.unsplash.com/photo-1563089145-599997674d42?w=600&auto=format&fit=crop&q=80",
  "4": "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=600&auto=format&fit=crop&q=80",
  "5": "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80"
};

function App() {
  const [activeTab, setActiveTab] = useState("simulator");
  const [actorName, setActorName] = useState("Julian the Toreador");
  const [trackerMode, setTrackerMode] = useState("hunger"); // 'hunger', 'health', 'willpower'
  const [hungerVal, setHungerVal] = useState(2);
  const [healthMax, setHealthMax] = useState(6);
  const [healthAgg, setHealthAgg] = useState(0);
  const [healthSup, setHealthSup] = useState(2);
  const [wpMax, setWpMax] = useState(6);
  const [wpAgg, setWpAgg] = useState(0);
  const [wpSup, setWpSup] = useState(1);
  const [isDownloading, setIsDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [simulatedLog, setSimulatedLog] = useState([]);

  // Stat level images state
  const [statMapType, setStatMapType] = useState("hunger");
  const [hungerLevelImages, setHungerLevelImages] = useState(DEFAULT_HUNGER_LEVEL_MAP);
  const [autoFillPattern, setAutoFillPattern] = useState("modules/wod5e-dynamic-tile-tracker/assets/vampire_hunger_{level}.webp");

  // Conditional priority rules state
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
          matchedName: `Hunger Level ${hungerVal} Exact Image`,
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
      image: DEFAULT_HUNGER_LEVEL_MAP["0"],
      tint: null,
      alpha: 1.0,
      scale: 1.0
    };
  }, [statMapType, hungerLevelImages, hungerVal, healthMax, healthAgg, healthSup, wpMax, wpAgg, wpSup, rules]);

  // Record log entry
  useEffect(() => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
      id: Date.now(),
      time: timestamp,
      actor: actorName,
      matchedRule: tileEvaluation.matchedName,
      sourceType: tileEvaluation.type === "level_map" ? `Stat Level Map [Hunger = ${hungerVal}]` : tileEvaluation.type === "rule" ? "Rule Priority Match" : "Default Base Image",
      tint: tileEvaluation.tint || "None",
      healthState: isTorpor ? "TORPOR" : isHealthImpaired ? "IMPAIRED" : `${healthAgg} Agg / ${healthSup} Sup`,
      hungerState: `Hunger ${hungerVal}/5`
    };

    setSimulatedLog(prev => [logEntry, ...prev.slice(0, 9)]);
  }, [tileEvaluation, healthAgg, healthSup, hungerVal, isTorpor, isHealthImpaired]);

  const handleDownloadZip = async () => {
    try {
      setIsDownloading(true);
      const zip = new JSZip();
      const folder = zip.folder("wod5e-dynamic-tile-tracker");
      
      folder.file("module.json", MODULE_JSON_CONTENT);
      folder.file("scripts/module.mjs", MODULE_MJS_CONTENT);
      folder.file("scripts/wod5e-tile-tracker.mjs", WOD5E_TILE_TRACKER_MJS_CONTENT);

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
      console.error("ZIP Generation error:", err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopyManifest = () => {
    const url = "https://raw.githubusercontent.com/foundryvtt/wod5e-dynamic-tile-tracker/main/module.json";
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const applyAutoFillPattern = () => {
    const newMap = { ...hungerLevelImages };
    for (let i = 0; i <= 5; i++) {
      newMap[String(i)] = autoFillPattern.replace("{level}", String(i));
    }
    setHungerLevelImages(newMap);
  };

  return html`
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans">
      <!-- Top Banner Header -->
      <header className="bg-slate-900/90 border-b border-red-900/40 backdrop-blur sticky top-0 z-40 px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-red-950/60 border border-red-600 flex items-center justify-center shadow-lg shadow-red-900/30">
            <${Flame} className="w-6 h-6 text-red-500 animate-pulse" />
          </div>
          <div>
            <h1 className="font-serif text-lg md:text-xl font-bold tracking-wide text-red-100 flex items-center gap-2">
              WoD5e Dynamic Tile Tracker
              <span className="text-xs font-sans px-2 py-0.5 rounded-full bg-red-950/80 text-red-400 border border-red-800">
                Foundry VTT v14
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Real-time Canvas Tile Images per Stat Level (Hunger / Health / Willpower) & Priority Rules
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick=${handleCopyManifest}
            className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 border border-slate-700 transition"
          >
            ${copied ? html`<${Check} className="w-3.5 h-3.5 text-emerald-400" />` : html`<${Copy} className="w-3.5 h-3.5 text-slate-400" />`}
            <span>${copied ? "Manifest Copied!" : "Copy Manifest URL"}</span>
          </button>

          <button
            onClick=${handleDownloadZip}
            disabled=${isDownloading}
            className="flex items-center space-x-2 px-4 py-2 rounded-md bg-red-700 hover:bg-red-600 text-xs font-semibold text-white shadow-md shadow-red-900/40 transition border border-red-500"
          >
            <${FolderZip} className="w-4 h-4" />
            <span>${isDownloading ? "Generating ZIP..." : "Download Module ZIP"}</span>
          </button>
        </div>
      </header>

      <!-- Navigation Tabs -->
      <nav className="bg-slate-900 border-b border-slate-800 px-4 flex items-center gap-2 overflow-x-auto text-xs font-medium">
        <button
          onClick=${() => setActiveTab("simulator")}
          className=${`px-4 py-3 border-b-2 flex items-center space-x-2 transition whitespace-nowrap ${
            activeTab === "simulator"
              ? "border-red-500 text-red-400 font-bold bg-slate-800/50"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <${Eye} className="w-4 h-4 text-red-400" />
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
          <${ImageIcon} className="w-4 h-4 text-amber-400" />
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
          <${Sliders} className="w-4 h-4 text-purple-400" />
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
                  <${User} className="w-4 h-4 text-red-400" />
                  Actor & Tracker Controls
                </h2>
                <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  WoD5e 5.3.28
                </span>
              </div>

              <!-- HUNGER TRACKER SLIDER -->
              <div className="bg-slate-950 p-4 rounded-lg border border-red-950/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-red-400 font-semibold text-sm">
                    <${Flame} className="w-4 h-4 fill-red-500/20 text-red-500" />
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
                    <${Heart} className="w-4 h-4 fill-red-500/20 text-red-500" />
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
                        if (val + healthSup > healthMax) setHealthSup(healthMax - val);
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

            <!-- Right Column: Canvas Preview -->
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="font-serif text-base font-bold text-slate-200 flex items-center gap-2">
                    <${Layers} className="w-4 h-4 text-red-400" />
                    Simulated Foundry VTT Canvas Tile
                  </h3>
                  <span className="text-xs px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                    Active Rule: ${tileEvaluation.matchedName}
                  </span>
                </div>

                <!-- Tile Canvas Viewport -->
                <div className="relative w-full h-80 rounded-lg overflow-hidden bg-slate-950 bg-grid-pattern flex items-center justify-center border border-slate-800 shadow-inner">
                  <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-slate-900/90 backdrop-blur px-2.5 py-1 rounded border border-slate-800 text-xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                    <span className="text-slate-300 font-mono text-[11px]">Dynamic Canvas Render</span>
                  </div>

                  <img
                    src=${tileEvaluation.image}
                    alt="Tile Texture"
                    className="max-h-full max-w-full object-contain rounded shadow-2xl transition-all duration-300"
                    style=${{
                      filter: tileEvaluation.tint ? `drop-shadow(0 0 15px ${tileEvaluation.tint})` : 'none',
                      opacity: tileEvaluation.alpha,
                      transform: `scale(${tileEvaluation.scale})`
                    }}
                  />

                  <div className="absolute bottom-3 right-3 z-10 bg-slate-900/90 backdrop-blur px-3 py-1.5 rounded border border-slate-800 text-xs flex items-center gap-3 font-mono text-slate-300">
                    <div>Source: <span className="text-red-400 font-bold">${tileEvaluation.type}</span></div>
                    <div>Tint: <span className="text-amber-400">${tileEvaluation.tint || "None"}</span></div>
                  </div>
                </div>

                <!-- Live Updates Log -->
                <div className="bg-slate-950 rounded-lg p-3 border border-slate-800 font-mono text-xs space-y-2">
                  <div className="text-slate-400 text-[11px] font-semibold flex items-center justify-between">
                    <span>Hook Log Stream (updateActor -> evaluateTile)</span>
                    <span className="text-emerald-400">Real-Time Sync Ready</span>
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                    ${simulatedLog.map((log) => html`
                      <div key=${log.id} className="text-[11px] flex items-center justify-between p-1.5 rounded bg-slate-900 border border-slate-800/80">
                        <span className="text-slate-500">${log.time}</span>
                        <span className="text-slate-300 font-sans">${log.matchedRule}</span>
                        <span className="text-amber-400">${log.hungerState}</span>
                      </div>
                    `)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        `}

        ${activeTab === "statmap" && html`
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-xl space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h2 className="font-serif text-lg font-bold text-red-100 flex items-center gap-2">
                  <${ImageIcon} className="w-5 h-5 text-amber-400" />
                  Specific Images per Stat Level (Level Map)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Assign a unique image texture for each exact stat value (e.g. Hunger 0, 1, 2, 3, 4, 5). Includes 'Browse File' buttons to invoke native Foundry FilePicker!
                </p>
              </div>

              <div className="flex items-center space-x-3">
                <label className="text-xs font-semibold text-slate-300">Tracked Stat:</label>
                <select
                  value=${statMapType}
                  onChange=${(e) => setStatMapType(e.target.value)}
                  className="bg-slate-950 text-slate-200 border border-slate-700 rounded px-3 py-1.5 text-xs font-medium focus:border-red-500 outline-none"
                >
                  <option value="hunger">Hunger / Rage / Desperation (0 to 5)</option>
                  <option value="health_agg">Aggravated Health Damage (0 to 10)</option>
                  <option value="health_sup">Superficial Health Damage (0 to 10)</option>
                  <option value="health_total">Total Health Damage (0 to 10)</option>
                </select>
              </div>
            </div>

            <!-- Pattern Auto-Fill Tool -->
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-3">
              <div className="flex items-center space-x-2 text-xs text-slate-300 font-semibold">
                <${Wand2} className="w-4 h-4 text-amber-400" />
                <span>Level Path Auto-Fill Generator</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value=${autoFillPattern}
                  onChange=${(e) => setAutoFillPattern(e.target.value)}
                  className="flex-1 min-w-[280px] bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-200 focus:border-red-500 outline-none"
                  placeholder="e.g. tiles/hunger_{level}.webp"
                />
                <button
                  onClick=${applyAutoFillPattern}
                  className="px-4 py-1.5 bg-amber-700 hover:bg-amber-600 text-white font-semibold text-xs rounded border border-amber-500 transition flex items-center space-x-1.5"
                >
                  <${Zap} className="w-3.5 h-3.5" />
                  <span>Auto-fill All Levels</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Use <code className="text-amber-300 font-mono">{level}</code> as a placeholder for the numerical level.
              </p>
            </div>

            <!-- Level Rows Grid -->
            <div className="space-y-3">
              ${[0, 1, 2, 3, 4, 5].map((lvl) => html`
                <div key=${lvl} className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex flex-wrap items-center gap-3">
                  <div className="w-24 text-xs font-bold text-slate-200 flex items-center space-x-2">
                    <span className="w-6 h-6 rounded bg-red-950 text-red-300 border border-red-800 flex items-center justify-center font-mono">
                      ${lvl}
                    </span>
                    <span>Level ${lvl}</span>
                  </div>

                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="text"
                      value=${hungerLevelImages[String(lvl)] || ""}
                      onChange=${(e) => {
                        const val = e.target.value;
                        setHungerLevelImages(prev => ({ ...prev, [String(lvl)]: val }));
                      }}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-200 focus:border-red-500 outline-none"
                      placeholder="Image texture path (e.g. tiles/vampire_hunger_2.webp)"
                    />
                    <button
                      type="button"
                      onClick=${() => alert(`In Foundry VTT, clicking 'Browse File' opens native FilePicker modal to select tile textures!`)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs rounded border border-slate-700 flex items-center gap-1.5 transition"
                    >
                      <${FolderOpen} className="w-3.5 h-3.5 text-amber-400" />
                      <span>Browse File</span>
                    </button>
                  </div>
                </div>
              `)}
            </div>
          </div>
        `}

        ${activeTab === "rules" && html`
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="font-serif text-lg font-bold text-red-100 flex items-center gap-2">
                  <${Sliders} className="w-5 h-5 text-purple-400" />
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
                        <button
                          type="button"
                          onClick=${() => alert(`In Foundry VTT, opens native FilePicker for this rule!`)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded border border-slate-700 flex items-center gap-1"
                        >
                          <${FolderOpen} className="w-3.5 h-3.5 text-amber-400" />
                          <span>Browse</span>
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
