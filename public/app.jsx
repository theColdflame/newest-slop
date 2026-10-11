import React, { useState, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
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
  Wand2
} from "lucide-react";
import JSZip from "jszip";

// --- MODULE FILES CONTENT FOR GENERATOR & CODE VIEWER ---

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
    let matchedRule = null;

    // 1. Level Map Check
    if (config.statMap?.enabled && config.statMap?.statType) {
      const levelImage = this.getStatLevelImage(config.statMap, stats);
      if (levelImage) {
        targetSrc = levelImage;
      }
    }

    // 2. Rules Priority Check
    if (!targetSrc && config.rules && config.rules.length > 0) {
      for (const rule of config.rules) {
        if (this.checkRuleMatch(rule, stats)) {
          matchedRule = rule;
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

    const img = statMap.levels[currentVal] || statMap.levels[String(currentVal)];
    return img && img.trim().length > 0 ? img.trim() : null;
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
 * Injects WoD5e Dynamic Tile Tracker Settings Tab into Foundry VTT v14 Tile Config Sheet
 */

export class WoD5eTileConfigExtension {
  static attachTab(app, html, data) {
    try {
      const rootEl = html instanceof HTMLElement ? html : (html && html[0] instanceof HTMLElement ? html[0] : (app.element ? (app.element instanceof HTMLElement ? app.element : app.element[0]) : null));
      if (!rootEl) return;

      const tileDoc = app.document || app.object;
      if (!tileDoc) return;
      if (rootEl.querySelector('.wod5e-tracker-tab-btn')) return;

      const config = tileDoc.getFlag("wod5e-dynamic-tile-tracker", "config") || {
        enabled: false, actorId: "", defaultImage: "",
        statMap: { enabled: true, statType: "hunger", levels: { "0": "", "1": "", "2": "", "3": "", "4": "", "5": "" } },
        rules: []
      };

      const navEl = rootEl.querySelector('nav.sheet-tabs') || rootEl.querySelector('nav.tabs') || rootEl.querySelector('nav');
      const bodyEl = rootEl.querySelector('section.sheet-body') || rootEl.querySelector('.sheet-body') || rootEl.querySelector('form') || rootEl;
      if (!navEl) return;

      const tabNavBtn = document.createElement('a');
      tabNavBtn.className = 'item wod5e-tracker-tab-btn';
      tabNavBtn.setAttribute('data-tab', 'wod5e-tracker');
      tabNavBtn.setAttribute('data-group', 'primary');
      tabNavBtn.innerHTML = '<i class="fas fa-droplet" style="color: #e53e3e; margin-right: 5px;"></i> WoD5e Tracker';
      navEl.appendChild(tabNavBtn);

      const tabContent = document.createElement('div');
      tabContent.className = 'tab wod5e-tracker-tab-content';
      tabContent.setAttribute('data-tab', 'wod5e-tracker');
      tabContent.setAttribute('data-group', 'primary');
      tabContent.style.padding = '10px 4px';

      tabContent.innerHTML = \`
        <div class="wod5e-tracker-config-wrapper" style="display: flex; flex-direction: column; gap: 12px;">
          <div class="form-group">
            <label style="font-weight: bold;"><i class="fas fa-power-off"></i> Enable Dynamic Updates</label>
            <input type="checkbox" name="flags.wod5e-dynamic-tile-tracker.config.enabled" \${config.enabled ? "checked" : ""}/>
          </div>
          <div class="form-group">
            <label style="font-weight: bold;"><i class="fas fa-user-shield"></i> Bound WoD5e Actor ID</label>
            <input type="text" name="flags.wod5e-dynamic-tile-tracker.config.actorId" value="\${config.actorId || ""}"/>
          </div>
          <input type="hidden" id="wod5e-statmap-json-input" name="flags.wod5e-dynamic-tile-tracker.config.statMapJson" value="\${JSON.stringify(config.statMap || {})}"/>
          <input type="hidden" id="wod5e-rules-json-input" name="flags.wod5e-dynamic-tile-tracker.config.rulesJson" value="\${JSON.stringify(config.rules || [])}"/>
        </div>
      \`;

      bodyEl.appendChild(tabContent);
    } catch (err) {
      console.error("WoD5e Tile Tracker | Config tab error:", err);
    }
  }
}
`;

const TILE_HUD_EXTENSION_MJS_CONTENT = `/**
 * Adds quick visual status HUD control button to Canvas Tile HUD
 */

export class WoD5eTileHUDExtension {
  static attachButton(app, html, data) {
    try {
      const rootEl = html instanceof HTMLElement ? html : (html && html[0] ? html[0] : app.element);
      if (!rootEl) return;
      const tileDoc = app.object?.document || app.document;
      if (!tileDoc) return;

      const config = tileDoc.getFlag("wod5e-dynamic-tile-tracker", "config");
      if (!config || !config.enabled) return;

      if (rootEl.querySelector('.wod5e-tracker-hud-btn')) return;

      const leftCol = rootEl.querySelector('.col.left') || rootEl.querySelector('.col') || rootEl;
      const button = document.createElement('div');
      button.className = 'control-icon wod5e-tracker-hud-btn';
      button.title = 'WoD5e Dynamic Tile Tracker Active';
      button.innerHTML = '<i class="fas fa-droplet" style="color: #e53e3e;"></i>';

      leftCol.appendChild(button);
    } catch (err) {
      console.error("WoD5e Dynamic Tile Tracker HUD error:", err);
    }
  }
}
`;

const MODULE_CSS_CONTENT = `/* WoD5e Dynamic Tile Tracker Module Styles */

.wod5e-tracker-tab {
  padding: 8px;
  background: rgba(15, 15, 20, 0.9);
  border-radius: 6px;
  color: #e2e8f0;
}

.wod5e-tracker-hud-btn {
  background: rgba(139, 0, 0, 0.4);
  border: 1px solid #dc2626;
  border-radius: 4px;
  padding: 4px;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
}

.wod5e-tracker-hud-btn:hover {
  background: rgba(220, 38, 38, 0.8);
  box-shadow: 0 0 10px rgba(220, 38, 38, 0.6);
}
`;

const EN_JSON_CONTENT = `{
  "WOD5E_TILE": {
    "Title": "WoD5e Dynamic Tile Tracker",
    "SettingsEnableDebug": "Enable Debug Logging",
    "SettingsEnableDebugHint": "Prints rule matches and tile update payloads to F12 Console.",
    "SettingsUpdateDebounce": "Tile Refresh Debounce (ms)",
    "TabTitle": "WoD5e Tracker"
  }
}`;

const README_MD_CONTENT = `# WoD5e Dynamic Tile Tracker - Foundry VTT v14 Module

An essential module for **Foundry VTT Version 14** and the **World of Darkness 5e (WoD5e)** system (version **5.3.28**).

Allows any canvas Tile (Portraits, Blood Stains, Character HUDs, Scene Overlays) to dynamically change its image texture based on exact stat level mappings (Hunger 0..5, Health Damage levels) or priority rules.

## 🛠️ Installation Instructions

1. Download \`wod5e-dynamic-tile-tracker-v14.zip\` from the download button above.
2. Extract the zip into your Foundry VTT user data directory:
   \`Data/modules/wod5e-dynamic-tile-tracker\`
3. Launch Foundry VTT v14, launch your WoD5e world, navigate to **Manage Modules**, and enable **World of Darkness 5e - Dynamic Tile Tracker**.
`;

// Default Level Images for Hunger Tracker Mapping Demo
const DEFAULT_HUNGER_LEVEL_MAP = {
  "0": "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=600&q=80", // Satisfied
  "1": "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80", // Slight Hunger
  "2": "https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=600&q=80", // Moderate Hunger
  "3": "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=600&q=80", // Severe Hunger
  "4": "https://images.unsplash.com/photo-1509248961158-e54f6934749c?auto=format&fit=crop&w=600&q=80", // Ravenous
  "5": "https://images.unsplash.com/photo-1514539079130-25950c84af65?auto=format&fit=crop&w=600&q=80"  // Bestial Frenzy
};

// Default Rule Matrix Presets for Sandbox Demo
const INITIAL_RULES = [
  {
    id: "rule_torpor",
    name: "Incapacitated / Torpor",
    enabled: true,
    conditionType: "health_torpor",
    value: 6,
    image: "https://images.unsplash.com/photo-1509248961158-e54f6934749c?auto=format&fit=crop&w=600&q=80",
    imageLabel: "Dark Vampire Torpor Ritual",
    tint: "#8b0000",
    alpha: 0.95,
    scale: 1.05,
    description: "Triggers when Health Aggravated damage fills max track (Torpor/Incapacitated)"
  },
  {
    id: "rule_bloodied",
    name: "Severely Bloodied (Aggravated ≥ 3)",
    enabled: true,
    conditionType: "health_aggravated",
    value: 3,
    image: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=600&q=80",
    imageLabel: "Blood Stained Wounds",
    tint: "#991b1b",
    alpha: 1.0,
    scale: 1.0,
    description: "Triggers when Aggravated Health Damage is 3 or higher"
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState("simulator"); // simulator | rules | statmap | package | docs
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);

  // Mode Selection: "statmap" (per-level image) vs "rules" (conditionals)
  const [trackerMode, setTrackerMode] = useState("statmap");

  // Stat Map State
  const [statMapType, setStatMapType] = useState("hunger");
  const [hungerLevelImages, setHungerLevelImages] = useState(DEFAULT_HUNGER_LEVEL_MAP);

  // --- WOD5E SIMULATION ACTOR STATE ---
  const [actorName, setActorName] = useState("Julian - Ventrue Ancilla");
  const [actorType, setActorType] = useState("vampire"); // vampire | werewolf | hunter
  
  // Health
  const [healthMax, setHealthMax] = useState(6);
  const [healthSup, setHealthSup] = useState(1);
  const [healthAgg, setHealthAgg] = useState(0);

  // Willpower
  const [wpMax, setWpMax] = useState(6);
  const [wpSup, setWpSup] = useState(1);
  const [wpAgg, setWpAgg] = useState(0);

  // Hunger / Rage
  const [hungerVal, setHungerVal] = useState(2);

  // Active Rule Set
  const [rules, setRules] = useState(INITIAL_RULES);
  const [simulatedLog, setSimulatedLog] = useState([]);

  // Calculate WoD5e Stats
  const totalHealthDamage = healthSup + healthAgg;
  const healthPercent = Math.max(0, Math.round(((healthMax - totalHealthDamage) / healthMax) * 100));
  const isHealthImpaired = totalHealthDamage >= healthMax;
  const isTorpor = healthAgg >= healthMax;

  const totalWpDamage = wpSup + wpAgg;
  const isWpImpaired = totalWpDamage >= wpMax;

  // Evaluate Active Tile Appearance
  const tileEvaluation = useMemo(() => {
    // 1. Level Map Check
    if (trackerMode === "statmap" && statMapType === "hunger") {
      const levelImg = hungerLevelImages[String(hungerVal)];
      if (levelImg) {
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

    // 2. Rules Fallback / Priority
    const stats = {
      healthMax, healthAgg, healthSup, totalHealthDamage, healthPercent,
      isHealthImpaired, isTorpor, wpMax, wpAgg, wpSup, totalWpDamage,
      isWpImpaired, hungerVal
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
  }, [trackerMode, statMapType, hungerLevelImages, hungerVal, healthMax, healthAgg, healthSup, wpMax, wpAgg, wpSup, rules]);

  // Record Log when Tile Updates
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

  // File list for downloader & code inspector
  const filesList = [
    { name: "module.json", path: "module.json", type: "json", content: MODULE_JSON_CONTENT, icon: FileCode },
    { name: "scripts/module.mjs", path: "scripts/module.mjs", type: "javascript", content: MODULE_MJS_CONTENT, icon: Play },
    { name: "scripts/wod5e-tile-tracker.mjs", path: "scripts/wod5e-tile-tracker.mjs", type: "javascript", content: WOD5E_TILE_TRACKER_MJS_CONTENT, icon: Zap },
    { name: "scripts/tile-config-extension.mjs", path: "scripts/tile-config-extension.mjs", type: "javascript", content: TILE_CONFIG_EXTENSION_MJS_CONTENT, icon: Sliders },
    { name: "scripts/tile-hud-extension.mjs", path: "scripts/tile-hud-extension.mjs", type: "javascript", content: TILE_HUD_EXTENSION_MJS_CONTENT, icon: Layers },
    { name: "styles/module.css", path: "styles/module.css", type: "css", content: MODULE_CSS_CONTENT, icon: Sparkles },
    { name: "lang/en.json", path: "lang/en.json", type: "json", content: EN_JSON_CONTENT, icon: BookOpen },
    { name: "README.md", path: "README.md", type: "markdown", content: README_MD_CONTENT, icon: Info }
  ];

  // ZIP Downloader Function
  const handleDownloadZip = async () => {
    try {
      setIsDownloading(true);
      const zip = new JSZip();
      
      const folder = zip.folder("wod5e-dynamic-tile-tracker");
      filesList.forEach(file => {
        zip.file(file.path, file.content);
        if (folder) folder.file(file.path, file.content);
      });

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

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans">
      {/* Top Banner Header */}
      <header className="bg-slate-900/90 border-b border-red-900/40 backdrop-blur sticky top-0 z-40 px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-red-950/60 border border-red-600 flex items-center justify-center shadow-lg shadow-red-900/30">
            <Flame className="w-6 h-6 text-red-500 animate-pulse" />
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

        {/* Action Badges & Download Button */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleCopyManifest}
            className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 border border-slate-700 transition"
            title="Copy Foundry VTT Manifest URL"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            <span>{copied ? "Manifest Copied!" : "Copy Manifest URL"}</span>
          </button>

          <button
            onClick={handleDownloadZip}
            disabled={isDownloading}
            className="flex items-center space-x-2 px-4 py-2 rounded-md bg-red-700 hover:bg-red-600 text-xs font-semibold text-white shadow-md shadow-red-900/40 transition border border-red-500"
          >
            <Download className="w-4 h-4" />
            <span>{isDownloading ? "Zipping..." : "Download Module ZIP"}</span>
          </button>
        </div>
      </header>

      {/* Main Tabs Navigation */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 flex items-center space-x-1 overflow-x-auto text-sm">
        <button
          onClick={() => setActiveTab("simulator")}
          className={`flex items-center space-x-2 px-4 py-2.5 border-b-2 font-medium transition ${
            activeTab === "simulator"
              ? "border-red-500 text-red-400 bg-red-950/20"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Eye className="w-4 h-4" />
          <span>Real-Time Canvas Simulator</span>
        </button>

        <button
          onClick={() => setActiveTab("statmap")}
          className={`flex items-center space-x-2 px-4 py-2.5 border-b-2 font-medium transition ${
            activeTab === "statmap"
              ? "border-teal-500 text-teal-400 bg-teal-950/20"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Images per Stat Level (Level Map)</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-teal-900/60 text-teal-300 border border-teal-700">
            Per-Level
          </span>
        </button>

        <button
          onClick={() => setActiveTab("rules")}
          className={`flex items-center space-x-2 px-4 py-2.5 border-b-2 font-medium transition ${
            activeTab === "rules"
              ? "border-red-500 text-red-400 bg-red-950/20"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Condition Rules Matrix</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-red-900/60 text-red-300 border border-red-700">
            {rules.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("package")}
          className={`flex items-center space-x-2 px-4 py-2.5 border-b-2 font-medium transition ${
            activeTab === "package"
              ? "border-red-500 text-red-400 bg-red-950/20"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <FileCode className="w-4 h-4" />
          <span>Module Source Inspector</span>
        </button>

        <button
          onClick={() => setActiveTab("docs")}
          className={`flex items-center space-x-2 px-4 py-2.5 border-b-2 font-medium transition ${
            activeTab === "docs"
              ? "border-red-500 text-red-400 bg-red-950/20"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Foundry VTT Setup Guide</span>
        </button>
      </div>

      {/* Tab Panels Content */}
      <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto space-y-6">

        {/* 1. REAL-TIME CANVAS SIMULATOR */}
        {activeTab === "simulator" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* Left Column: WoD5e Character Sheet Trackers Control Panel */}
            <div className="lg:col-span-5 bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2">
                  <User className="w-5 h-5 text-red-400" />
                  <h2 className="font-serif font-bold text-lg text-slate-100">WoD5e Actor Trackers</h2>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 uppercase tracking-wider">
                  System 5.3.28
                </span>
              </div>

              {/* Mode Toggle */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">Active Evaluation Mode:</span>
                <div className="flex space-x-1">
                  <button
                    onClick={() => setTrackerMode("statmap")}
                    className={`px-3 py-1 rounded text-xs font-semibold transition ${
                      trackerMode === "statmap" ? "bg-teal-700 text-white shadow" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    Exact Level Map
                  </button>
                  <button
                    onClick={() => setTrackerMode("rules")}
                    className={`px-3 py-1 rounded text-xs font-semibold transition ${
                      trackerMode === "rules" ? "bg-red-700 text-white shadow" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    Priority Rules
                  </button>
                </div>
              </div>

              {/* Character Profile Selectors */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Actor Name
                  </label>
                  <input
                    type="text"
                    value={actorName}
                    onChange={(e) => setActorName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              {/* HUNGER SLIDER (0 TO 5) */}
              <div className="bg-slate-950 p-4 rounded-lg border border-red-950/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-red-400 font-semibold text-sm">
                    <Flame className="w-4 h-4 text-red-500" />
                    <span>Hunger / Rage Level</span>
                  </div>
                  <span className="text-sm font-bold px-2.5 py-0.5 rounded bg-red-950 text-red-300 border border-red-700">
                    {hungerVal} / 5
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {[0, 1, 2, 3, 4, 5].map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setHungerVal(lvl)}
                      className={`flex-1 py-2 rounded font-bold text-xs border transition ${
                        hungerVal === lvl
                          ? "bg-red-600 border-red-400 text-white shadow-lg shadow-red-900/50 scale-105"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>

                <p className="text-[11px] text-slate-400 italic">
                  Change Hunger level (0 to 5) to watch the canvas tile instantly switch to the image assigned specifically for that level!
                </p>
              </div>

              {/* HEALTH TRACKER SLIDERS */}
              <div className="bg-slate-950 p-4 rounded-lg border border-red-950/60 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-red-400 font-semibold text-sm">
                    <Heart className="w-4 h-4 fill-red-500/20 text-red-500" />
                    <span>Health Tracker</span>
                  </div>
                  <div className="flex items-center space-x-2 text-xs">
                    {isTorpor ? (
                      <span className="px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-700 font-bold animate-pulse">
                        TORPOR / INCAP
                      </span>
                    ) : (
                      <span className="text-slate-400">{healthPercent}% Health</span>
                    )}
                  </div>
                </div>

                {/* Health Track Visual Squares */}
                <div className="flex items-center gap-1.5 pt-1">
                  {Array.from({ length: healthMax }).map((_, idx) => {
                    let boxState = "empty";
                    if (idx < healthAgg) boxState = "aggravated";
                    else if (idx < healthAgg + healthSup) boxState = "superficial";

                    return (
                      <div
                        key={idx}
                        className={`flex-1 h-8 rounded border flex items-center justify-center font-bold text-xs transition-all ${
                          boxState === "aggravated"
                            ? "bg-red-900 border-red-500 text-red-100 shadow-sm shadow-red-900"
                            : boxState === "superficial"
                            ? "bg-amber-900/80 border-amber-500 text-amber-200"
                            : "bg-slate-900 border-slate-700 text-slate-600"
                        }`}
                      >
                        {boxState === "aggravated" ? "X" : boxState === "superficial" ? "/" : ""}
                      </div>
                    );
                  })}
                </div>

                {/* Sliders for Aggravated & Superficial */}
                <div className="space-y-3 pt-2 text-xs">
                  <div>
                    <div className="flex justify-between text-slate-300 mb-1">
                      <span>Aggravated Damage [X]</span>
                      <span className="font-bold text-red-400">{healthAgg} / {healthMax}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={healthMax}
                      value={healthAgg}
                      onChange={(e) => {
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
                      <span className="font-bold text-amber-400">{healthSup} / {healthMax}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={healthMax - healthAgg}
                      value={healthSup}
                      onChange={(e) => setHealthSup(Number(e.target.value))}
                      className="w-full accent-amber-500 bg-slate-800 rounded h-1.5 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Simulated Foundry VTT Canvas & Tile Render */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Canvas Preview Viewport */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-2">
                    <ImageIcon className="w-5 h-5 text-teal-400" />
                    <h2 className="font-serif font-bold text-lg text-slate-100">Foundry VTT Scene Canvas</h2>
                  </div>
                  <div className="text-xs text-slate-400 flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                    <span>Real-time Reactive Sync</span>
                  </div>
                </div>

                {/* Tile Renderer Display */}
                <div className="relative aspect-video rounded-lg overflow-hidden border border-slate-700 bg-slate-950 flex items-center justify-center group shadow-2xl">
                  {/* Grid overlay */}
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:40px_40px]"></div>

                  {/* Dynamic Tile Image */}
                  <img
                    src={tileEvaluation.image}
                    alt="Canvas Tile Render"
                    className="object-cover w-full h-full transition-all duration-500 ease-out"
                    style={{
                      filter: tileEvaluation.tint ? `drop-shadow(0 0 20px ${tileEvaluation.tint})` : 'none',
                      opacity: tileEvaluation.alpha,
                      transform: `scale(${tileEvaluation.scale})`
                    }}
                  />

                  {/* Tile Active Trigger Overlay Badge */}
                  <div className="absolute top-3 left-3 bg-slate-900/90 border border-slate-700 backdrop-blur rounded-md px-3 py-1.5 text-xs flex items-center space-x-2 shadow-lg">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span className="font-semibold text-slate-200">{tileEvaluation.matchedName}</span>
                  </div>

                  <div className="absolute bottom-3 right-3 bg-slate-900/90 border border-slate-700 backdrop-blur rounded-md px-3 py-1 text-[11px] text-slate-400">
                    Source: <span className="text-teal-300 font-medium">{tileEvaluation.type}</span>
                  </div>
                </div>
              </div>

              {/* Reactive Console Event Log */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-3 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-xs font-semibold text-slate-400">
                  <span className="flex items-center space-x-1.5">
                    <RefreshCw className="w-3.5 h-3.5 text-teal-400" />
                    <span>Foundry VTT System Log (F12 Hook Debug)</span>
                  </span>
                  <span>{simulatedLog.length} updates</span>
                </div>

                <div className="font-mono text-xs space-y-1.5 max-h-48 overflow-y-auto pr-2">
                  {simulatedLog.map((log) => (
                    <div key={log.id} className="bg-slate-950/80 p-2 rounded border border-slate-800 flex items-center justify-between text-slate-300">
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-500">[{log.time}]</span>
                        <span className="text-red-400 font-semibold">{log.actor}</span>
                        <span className="text-slate-400">&rarr;</span>
                        <span className="text-teal-300 font-bold">{log.matchedRule}</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                        {log.hungerState}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>
        )}

        {/* 2. STAT LEVEL IMAGE MAPPING MATRIX TAB */}
        {activeTab === "statmap" && (
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="font-serif font-bold text-xl text-teal-300 flex items-center gap-2">
                  <Layers className="w-6 h-6 text-teal-400" />
                  Specific Images per Stat Level (Level Map)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Assign a unique tile image file for each possible value of Hunger (0, 1, 2, 3, 4, 5) or Health state.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-400">Select Stat:</span>
                <select
                  value={statMapType}
                  onChange={(e) => setStatMapType(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-teal-300 text-xs rounded-md px-3 py-1.5 focus:outline-none focus:border-teal-500 font-medium"
                >
                  <option value="hunger">Hunger / Rage / Desperation (0 to 5)</option>
                  <option value="health_agg">Aggravated Health Damage (0 to 10)</option>
                  <option value="health_remaining">Remaining Health Points (0 to 10)</option>
                </select>
              </div>
            </div>

            {/* Level Inputs Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[0, 1, 2, 3, 4, 5].map((lvl) => (
                <div key={lvl} className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-teal-400 px-2.5 py-1 rounded bg-teal-950/80 border border-teal-800">
                      Level {lvl} {lvl === 0 ? "(Satisfied)" : lvl === 5 ? "(Bestial)" : ""}
                    </span>
                    <span className="text-[11px] text-slate-500">Hunger = {lvl}</span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Image URL / Path</label>
                    <input
                      type="text"
                      value={hungerLevelImages[String(lvl)] || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setHungerLevelImages(prev => ({ ...prev, [String(lvl)]: val }));
                      }}
                      className="w-full bg-slate-900 border border-slate-700 text-xs rounded px-2.5 py-1.5 text-slate-200 focus:border-teal-500"
                    />
                  </div>

                  {/* Preview Thumbnail */}
                  <div className="h-28 rounded overflow-hidden border border-slate-800 bg-slate-900 flex items-center justify-center">
                    {hungerLevelImages[String(lvl)] ? (
                      <img src={hungerLevelImages[String(lvl)]} alt={`Level ${lvl}`} className="object-cover w-full h-full" />
                    ) : (
                      <span className="text-xs text-slate-600 font-italic">No image assigned</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. CONDITION RULES MATRIX TAB */}
        {activeTab === "rules" && (
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="font-serif font-bold text-xl text-red-100 flex items-center gap-2">
                  <Sliders className="w-6 h-6 text-red-400" />
                  Priority Condition Rules Matrix
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Rules are evaluated top-to-bottom as fallback logic.
                </p>
              </div>

              <button
                onClick={() => {
                  const newRule = {
                    id: `rule_${Date.now()}`,
                    name: `Custom Rule #${rules.length + 1}`,
                    enabled: true,
                    conditionType: "hunger_gte",
                    value: 4,
                    image: DEFAULT_HUNGER_LEVEL_MAP["4"],
                    imageLabel: "Custom Rule Image",
                    tint: "#dc2626",
                    alpha: 1.0,
                    scale: 1.0,
                    description: "Custom user-defined condition rule"
                  };
                  setRules([...rules, newRule]);
                }}
                className="flex items-center space-x-2 px-3 py-1.5 rounded-md bg-red-700 hover:bg-red-600 text-xs font-semibold text-white transition border border-red-500"
              >
                <Plus className="w-4 h-4" />
                <span>Add Rule</span>
              </button>
            </div>

            {/* Rules Cards List */}
            <div className="space-y-4">
              {rules.map((rule, idx) => (
                <div key={rule.id} className="bg-slate-950 p-4 rounded-lg border border-slate-800 flex flex-wrap lg:flex-nowrap items-center justify-between gap-4">
                  <div className="flex items-center space-x-3">
                    <span className="w-7 h-7 rounded-full bg-red-950 text-red-400 border border-red-800 font-bold text-xs flex items-center justify-center">
                      #{idx + 1}
                    </span>
                    <div>
                      <h4 className="font-semibold text-sm text-slate-200">{rule.name}</h4>
                      <p className="text-xs text-slate-400">{rule.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <input
                      type="text"
                      value={rule.image}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRules(rules.map(r => r.id === rule.id ? { ...r, image: val } : r));
                      }}
                      className="bg-slate-900 border border-slate-700 text-xs rounded px-2 py-1 text-slate-200 w-64"
                    />

                    <button
                      onClick={() => setRules(rules.filter(r => r.id !== rule.id))}
                      className="p-1.5 rounded bg-slate-900 text-red-400 hover:bg-red-950 border border-slate-800 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. MODULE SOURCE INSPECTOR TAB */}
        {activeTab === "package" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-2">
              <h3 className="font-serif font-bold text-sm text-slate-200 mb-3 border-b border-slate-800 pb-2">
                Module Directory Files
              </h3>
              {filesList.map((f, idx) => {
                const Icon = f.icon;
                return (
                  <button
                    key={f.path}
                    onClick={() => setSelectedFileIndex(idx)}
                    className={`w-full flex items-center space-x-2 px-3 py-2 rounded-md text-xs font-mono transition text-left ${
                      selectedFileIndex === idx ? "bg-red-950/80 text-red-200 border border-red-800 font-semibold" : "text-slate-400 hover:bg-slate-800"
                    }`}
                  >
                    <Icon className="w-4 h-4 text-red-400 shrink-0" />
                    <span className="truncate">{f.path}</span>
                  </button>
                );
              })}
            </div>

            <div className="lg:col-span-8 bg-slate-900 rounded-xl border border-slate-800 p-4 font-mono text-xs overflow-x-auto bg-slate-950 text-slate-200 max-h-[600px] overflow-y-auto">
              <pre>{filesList[selectedFileIndex].content}</pre>
            </div>
          </div>
        )}

        {/* 5. SETUP GUIDE TAB */}
        {activeTab === "docs" && (
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-6 shadow-xl">
            <h2 className="font-serif font-bold text-xl text-red-100 border-b border-slate-800 pb-3">
              Foundry VTT v14 Installation & Usage Guide
            </h2>

            <div className="space-y-4 text-sm text-slate-300">
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
                <h3 className="font-bold text-red-400">1. Install Module Folder</h3>
                <p>Extract the downloaded ZIP into your Foundry data folder:</p>
                <code className="block bg-slate-900 p-2 rounded text-xs font-mono text-amber-300">
                  Data/modules/wod5e-dynamic-tile-tracker/
                </code>
              </div>

              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
                <h3 className="font-bold text-red-400">2. Configure Tile</h3>
                <p>Open any tile on canvas and select the <strong>WoD5e Tracker</strong> tab to set your actor & image map.</p>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
