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
  AlertTriangle
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
  "download": "https://github.com/foundryvtt/wod5e-dynamic-tile-tracker/releases/download/v1.0.0/module.zip"
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

  // Register Module Settings
  game.settings.register("wod5e-dynamic-tile-tracker", "enableDebug", {
    name: game.i18n.localize("WOD5E_TILE.SettingsEnableDebug"),
    hint: game.i18n.localize("WOD5E_TILE.SettingsEnableDebugHint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register("wod5e-dynamic-tile-tracker", "updateDebounce", {
    name: game.i18n.localize("WOD5E_TILE.SettingsUpdateDebounce"),
    hint: game.i18n.localize("WOD5E_TILE.SettingsUpdateDebounceHint"),
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
  // Check if changes affect Health, Willpower, Hunger, Rage, or Desperation
  const sys = changes.system;
  if (!sys) return;

  const healthChanged = "health" in sys;
  const willpowerChanged = "willpower" in sys;
  const hungerChanged = "hunger" in sys || "rage" in sys || "desperation" in sys;

  if (healthChanged || willpowerChanged || hungerChanged) {
    WoD5eTileTrackerEngine.onActorTrackerUpdated(actor);
  }
});

// Re-eval Tile when Tile Document is Updated or Created
Hooks.on("updateTile", (tileDoc, changes, options, userId) => {
  const flags = changes.flags?.["wod5e-dynamic-tile-tracker"];
  if (flags) {
    WoD5eTileTrackerEngine.evaluateTile(tileDoc);
  }
});

// Inject Custom Configuration Tab into Tile Config Application
Hooks.on("renderTileConfig", (app, html, data) => {
  WoD5eTileConfigExtension.attachTab(app, html, data);
});

// Add HUD Action Button to Tile HUD
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

  /**
   * Main listener when actor tracker values (Health, Willpower, Hunger) change
   */
  static onActorTrackerUpdated(actor) {
    if (!actor) return;

    // Find all tiles in current active scene (or across scenes) bound to this actor
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

  /**
   * Evaluates rules against actor state and updates tile texture / appearance
   */
  static async evaluateTile(tileDoc, actorOverride = null) {
    const config = tileDoc.getFlag(this.MODULE_ID, "config");
    if (!config || !config.enabled) return;

    const actor = actorOverride || game.actors.get(config.actorId);
    if (!actor) return;

    // Compute WoD5e Actor Tracker Stats (5.3.28 Data Structure)
    const stats = this.extractWoD5eStats(actor);

    // Default target image is base texture or configured fallback
    let matchedRule = null;
    const rules = config.rules || [];

    // Evaluate rules in order of priority (first matching rule wins)
    for (const rule of rules) {
      if (this.checkRuleMatch(rule, stats)) {
        matchedRule = rule;
        break;
      }
    }

    // Determine target properties
    const targetSrc = matchedRule?.image || config.defaultImage || tileDoc.texture.src;
    const targetTint = matchedRule?.tint || config.defaultTint || null;
    const targetAlpha = matchedRule?.alpha ?? config.defaultAlpha ?? 1.0;
    const targetScale = matchedRule?.scale ?? config.defaultScale ?? 1.0;

    // Prepare update payload for Foundry VTT v14 Tile Document
    const updates = {
      texture: {
        src: targetSrc,
        tint: targetTint
      },
      alpha: targetAlpha,
      scaleX: targetScale,
      scaleY: targetScale
    };

    // Apply smooth tile update if texture or parameters changed
    const currentSrc = tileDoc.texture.src;
    const currentTint = tileDoc.texture.tint;

    if (currentSrc !== targetSrc || currentTint !== targetTint || tileDoc.alpha !== targetAlpha) {
      if (game.settings.get(this.MODULE_ID, "enableDebug")) {
        console.log(\`WoD5e Tile Tracker | Updating Tile \${tileDoc.id} for Actor \${actor.name}:\`, updates, matchedRule);
      }
      await tileDoc.update(updates);
    }
  }

  /**
   * Extract Health, Willpower, Hunger, Rage trackers according to WoD5e 5.3.28 system schema
   */
  static extractWoD5eStats(actor) {
    const sys = actor.system || {};

    // Health Tracker (Aggravated, Superficial, Max)
    const health = sys.health || { max: 6, aggravated: 0, superficial: 0 };
    const healthMax = Number(health.max || 6);
    const healthAgg = Number(health.aggravated || 0);
    const healthSup = Number(health.superficial || 0);
    const totalHealthDamage = healthAgg + healthSup;
    const healthPercent = Math.max(0, Math.min(100, Math.round(((healthMax - totalHealthDamage) / healthMax) * 100)));

    const isHealthImpaired = totalHealthDamage >= healthMax;
    const isTorpor = healthAgg >= healthMax;

    // Willpower Tracker
    const willpower = sys.willpower || { max: 6, aggravated: 0, superficial: 0 };
    const wpMax = Number(willpower.max || 6);
    const wpAgg = Number(willpower.aggravated || 0);
    const wpSup = Number(willpower.superficial || 0);
    const totalWpDamage = wpAgg + wpSup;
    const isWpImpaired = totalWpDamage >= wpMax;

    // Hunger / Rage / Desperation
    const hungerVal = Number(sys.hunger?.value ?? sys.rage?.value ?? sys.desperation?.value ?? 0);

    return {
      healthMax,
      healthAgg,
      healthSup,
      totalHealthDamage,
      healthPercent,
      isHealthImpaired,
      isTorpor,
      wpMax,
      wpAgg,
      wpSup,
      totalWpDamage,
      isWpImpaired,
      hungerVal
    };
  }

  /**
   * Rule Condition Evaluator
   */
  static checkRuleMatch(rule, stats) {
    if (!rule || !rule.enabled) return false;

    // Condition 1: Health Threshold / Status
    if (rule.conditionType === "health_aggravated" && stats.healthAgg < rule.value) return false;
    if (rule.conditionType === "health_superficial" && stats.healthSup < rule.value) return false;
    if (rule.conditionType === "health_percent_below" && stats.healthPercent > rule.value) return false;
    if (rule.conditionType === "health_torpor" && !stats.isTorpor) return false;
    if (rule.conditionType === "health_impaired" && !stats.isHealthImpaired) return false;

    // Condition 2: Willpower Threshold
    if (rule.conditionType === "willpower_aggravated" && stats.wpAgg < rule.value) return false;
    if (rule.conditionType === "willpower_impaired" && !stats.isWpImpaired) return false;

    // Condition 3: Hunger / Rage Value
    if (rule.conditionType === "hunger_equals" && stats.hungerVal !== rule.value) return false;
    if (rule.conditionType === "hunger_gte" && stats.hungerVal < rule.value) return false;

    // Combined Rule Checks
    if (rule.requireHungerGte && stats.hungerVal < rule.requireHungerGte) return false;
    if (rule.requireHealthAggGte && stats.healthAgg < rule.requireHealthAggGte) return false;

    return true;
  }
}
`;

const TILE_CONFIG_EXTENSION_MJS_CONTENT = `/**
 * Injects WoD5e Dynamic Tile Tracker Settings Tab into Foundry VTT v14 Tile Config Sheet
 */

export class WoD5eTileConfigExtension {
  static attachTab(app, html, data) {
    const tileDoc = app.document;
    const flags = tileDoc.getFlag("wod5e-dynamic-tile-tracker", "config") || {
      enabled: false,
      actorId: "",
      rules: []
    };

    // Construct tab header button in Foundry v14 Tile Config DOM
    const nav = html.find('nav.sheet-tabs');
    if (nav.length) {
      nav.append(\`<a class="item" data-tab="wod5e-tracker"><i class="fas fa-tint text-red-600"></i> WoD5e Tracker</a>\`);
    }

    // Tab content container HTML
    const tabHtml = \`
      <div class="tab" data-tab="wod5e-tracker">
        <div class="form-group">
          <label>Enable WoD5e Real-Time Dynamic Updates</label>
          <input type="checkbox" name="flags.wod5e-dynamic-tile-tracker.config.enabled" \${flags.enabled ? "checked" : ""}/>
        </div>
        <div class="form-group">
          <label>Bound WoD5e Actor</label>
          <select name="flags.wod5e-dynamic-tile-tracker.config.actorId">
            <option value="">-- Select Scene or World Actor --</option>
            \${game.actors.map(a => \`<option value="\${a.id}" \${a.id === flags.actorId ? "selected" : ""}>\${a.name} (\${a.type})</option>\`).join("")}
          </select>
        </div>
        <p class="notes">Select a WoD5e Vampire, Werewolf, or Hunter actor to trigger real-time tile texture changes based on Health, Willpower, and Hunger trackers.</p>
      </div>
    \`;

    const body = html.find('.sheet-body');
    if (body.length) {
      body.append(tabHtml);
    }
  }
}
`;

const TILE_HUD_EXTENSION_MJS_CONTENT = `/**
 * Adds quick visual status HUD control button to Canvas Tile HUD
 */

export class WoD5eTileHUDExtension {
  static attachButton(app, html, data) {
    const tileDoc = app.object.document;
    const config = tileDoc.getFlag("wod5e-dynamic-tile-tracker", "config");

    if (!config || !config.enabled) return;

    const button = $(\`
      <div class="control-icon wod5e-tracker-hud-btn" title="WoD5e Dynamic Tile Tracker Active">
        <i class="fas fa-droplet text-red-500"></i>
      </div>
    \`);

    button.click((ev) => {
      ev.preventDefault();
      const actor = game.actors.get(config.actorId);
      if (actor) {
        actor.sheet.render(true);
      } else {
        ui.notifications.warn("No bound WoD5e Actor found for this Tile.");
      }
    });

    html.find('.col.left').append(button);
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

.wod5e-rule-card {
  background: #181820;
  border-left: 4px solid #dc2626;
  padding: 10px;
  margin-bottom: 8px;
  border-radius: 4px;
}
`;

const EN_JSON_CONTENT = `{
  "WOD5E_TILE": {
    "Title": "WoD5e Dynamic Tile Tracker",
    "SettingsEnableDebug": "Enable Debug Logging",
    "SettingsEnableDebugHint": "Prints rule matches and tile update payloads to F12 Console.",
    "SettingsUpdateDebounce": "Tile Refresh Debounce (ms)",
    "SettingsUpdateDebounceHint": "Time in milliseconds to wait before triggering canvas tile redraws during fast slider drags.",
    "TabTitle": "WoD5e Tracker",
    "EnableTracker": "Enable WoD5e Real-Time Tile Updates",
    "SelectActor": "Target WoD5e Actor",
    "RulesHeader": "Condition Priority Rules Matrix",
    "ConditionHealthAggravated": "Aggravated Health Damage ≥",
    "ConditionHealthSuperficial": "Superficial Health Damage ≥",
    "ConditionHealthTorpor": "Actor in Torpor / Incapacitated",
    "ConditionHungerGte": "Hunger / Rage Level ≥",
    "ConditionWillpowerImpaired": "Willpower Impaired"
  }
}`;

const README_MD_CONTENT = `# WoD5e Dynamic Tile Tracker - Foundry VTT v14 Module

An essential module for **Foundry VTT Version 14** and the **World of Darkness 5e (WoD5e)** system (version **5.3.28**).

Allows any canvas Tile (Portraits, Blood Stains, Character HUDs, Scene Overlays, Haven Maps) to dynamically change its image texture, tint color, and opacity in real time whenever an Actor's Health, Willpower, or Hunger trackers update.

## 🌟 Key Features

1. **Real-time Synchronization**: Responds instantly to changes on actor sheets, macros, or combat tracker updates.
2. **WoD5e 5.3.28 Tracker Engine**:
   - **Health Tracker**: Superficial, Aggravated, Health % thresholds, Impaired status, Torpor / Incapacitated.
   - **Willpower Tracker**: Superficial & Aggravated damage, Impaired status.
   - **Hunger / Rage / Desperation**: Levels 0 to 5 for Vampires, Werewolves, and Hunters.
3. **Priority Rule Matrix**: Define ordered rules. The top matching rule updates the tile texture, scale, tint, and alpha!
4. **Tile HUD Quick Action**: Fast access icon on the canvas tile HUD to inspect or open the bound actor sheet.

## 🛠️ Installation Instructions

1. Download \`module.zip\` from the [Releases Tab](https://github.com/foundryvtt/wod5e-dynamic-tile-tracker/releases).
2. Extract into your Foundry VTT user data directory under:
   \`Data/modules/wod5e-dynamic-tile-tracker\`
3. Launch Foundry VTT v14, launch your WoD5e world, navigate to **Manage Modules**, and enable **World of Darkness 5e - Dynamic Tile Tracker**.

## 📖 Usage & Setup

1. Double click any Tile on your Canvas or create a new Tile.
2. In the Tile Configuration window, open the **WoD5e Tracker** tab.
3. Check **Enable WoD5e Real-Time Tile Updates** and select your target WoD5e Actor (e.g. *Julian - Ventrue Ancilla*).
4. Add rules (e.g., *Rule 1: If Aggravated Health >= 6 -> Use Torpor portrait image*).
5. Click **Update Tile**.
6. Whenever health, willpower, or hunger changes on the actor's sheet, the tile on scene updates automatically in real-time!
`;

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
    id: "rule_starved_frenzy",
    name: "Bestial Hunger (Hunger = 5)",
    enabled: true,
    conditionType: "hunger_equals",
    value: 5,
    image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80",
    imageLabel: "Red Blood Aura Frenzy",
    tint: "#dc2626",
    alpha: 1.0,
    scale: 1.02,
    description: "Triggers when Hunger equals 5 (Bestial Frenzy Risk)"
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
  },
  {
    id: "rule_hungry",
    name: "Ravenous Hunger (Hunger ≥ 3)",
    enabled: true,
    conditionType: "hunger_gte",
    value: 3,
    image: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=600&q=80",
    imageLabel: "Crimson Glowing Fangs",
    tint: "#b91c1c",
    alpha: 0.95,
    scale: 1.0,
    description: "Triggers when Hunger is 3 or 4"
  }
];

const DEFAULT_BASE_IMAGE = "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=600&q=80";

export default function App() {
  const [activeTab, setActiveTab] = useState("simulator"); // simulator | rules | package | docs
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);

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
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [simulatedLog, setSimulatedLog] = useState([]);

  // Calculate WoD5e Stats
  const totalHealthDamage = healthSup + healthAgg;
  const healthPercent = Math.max(0, Math.round(((healthMax - totalHealthDamage) / healthMax) * 100));
  const isHealthImpaired = totalHealthDamage >= healthMax;
  const isTorpor = healthAgg >= healthMax;

  const totalWpDamage = wpSup + wpAgg;
  const isWpImpaired = totalWpDamage >= wpMax;

  // Evaluate Active Rule for Canvas Tile
  const activeRuleMatch = useMemo(() => {
    const stats = {
      healthMax,
      healthAgg,
      healthSup,
      totalHealthDamage,
      healthPercent,
      isHealthImpaired,
      isTorpor,
      wpMax,
      wpAgg,
      wpSup,
      totalWpDamage,
      isWpImpaired,
      hungerVal
    };

    for (const rule of rules) {
      if (!rule.enabled) continue;
      
      let matched = false;
      if (rule.conditionType === "health_torpor" && stats.isTorpor) matched = true;
      else if (rule.conditionType === "health_aggravated" && stats.healthAgg >= rule.value) matched = true;
      else if (rule.conditionType === "health_superficial" && stats.healthSup >= rule.value) matched = true;
      else if (rule.conditionType === "health_impaired" && stats.isHealthImpaired) matched = true;
      else if (rule.conditionType === "hunger_equals" && stats.hungerVal === rule.value) matched = true;
      else if (rule.conditionType === "hunger_gte" && stats.hungerVal >= rule.value) matched = true;
      else if (rule.conditionType === "willpower_impaired" && stats.isWpImpaired) matched = true;

      if (matched) return rule;
    }
    return null;
  }, [healthMax, healthAgg, healthSup, wpMax, wpAgg, wpSup, hungerVal, rules]);

  // Record Log when Tile Updates
  useEffect(() => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
      id: Date.now(),
      time: timestamp,
      actor: actorName,
      matchedRule: activeRuleMatch ? activeRuleMatch.name : "Default Base Texture",
      image: activeRuleMatch ? activeRuleMatch.imageLabel : "Base Haven Portrait",
      tint: activeRuleMatch?.tint || "None",
      healthState: isTorpor ? "TORPOR" : isHealthImpaired ? "IMPAIRED" : `${healthAgg} Agg / ${healthSup} Sup`,
      hungerState: `Hunger ${hungerVal}/5`
    };

    setSimulatedLog(prev => [logEntry, ...prev.slice(0, 9)]);
  }, [activeRuleMatch, healthAgg, healthSup, hungerVal, isTorpor, isHealthImpaired]);

  // File list for downloader & code inspector
  const filesList = [
    { name: "module.json", path: "module.json", type: "json", content: MODULE_JSON_CONTENT, icon: FileCode },
    { name: "scripts/module.mjs", path: "scripts/module.mjs", type: "javascript", content: MODULE_MJS_CONTENT, icon: Play },
    { name: "scripts/wod5e-tile-tracker.mjs", path: "scripts/wod5e-tile-tracker.mjs", type: "javascript", content: WOD5E_TILE_TRACKER_MJS_CONTENT, icon: CpuIcon },
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
      
      filesList.forEach(file => {
        zip.file(file.path, file.content);
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

  function CpuIcon(props) {
    return <Zap {...props} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans">
      {/* Top Banner Header */}
      <header className="bg-slate-900/90 border-b border-wod-accent/40 backdrop-blur sticky top-0 z-40 px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-wod-blood/40 border border-wod-crimson flex items-center justify-center wod-glow-red">
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
              Real-time Canvas Tile Image & Texture Updates for World of Darkness 5e (v5.3.28)
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
            className="flex items-center space-x-2 px-4 py-1.5 rounded-md bg-gradient-to-r from-red-700 to-wod-blood hover:from-red-600 hover:to-red-800 text-xs font-semibold text-white border border-red-500/50 shadow-lg shadow-red-950/50 transition"
          >
            <Download className="w-4 h-4" />
            <span>{isDownloading ? "Zipping..." : "Download Module ZIP"}</span>
          </button>
        </div>
      </header>

      {/* Main Tab Navigation */}
      <nav className="bg-slate-900/60 border-b border-slate-800 px-4 py-2 flex items-center space-x-2 text-xs overflow-x-auto">
        <button
          onClick={() => setActiveTab("simulator")}
          className={`flex items-center space-x-2 px-3 py-2 rounded-md font-medium transition ${
            activeTab === "simulator"
              ? "bg-wod-accent/30 text-red-300 border border-red-700/60"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
          }`}
        >
          <Play className="w-4 h-4 text-red-400" />
          <span>Interactive Canvas Simulator</span>
        </button>

        <button
          onClick={() => setActiveTab("rules")}
          className={`flex items-center space-x-2 px-3 py-2 rounded-md font-medium transition ${
            activeTab === "rules"
              ? "bg-wod-accent/30 text-red-300 border border-red-700/60"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
          }`}
        >
          <Sliders className="w-4 h-4 text-amber-400" />
          <span>Rule Matrix & Condition Builder ({rules.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("package")}
          className={`flex items-center space-x-2 px-3 py-2 rounded-md font-medium transition ${
            activeTab === "package"
              ? "bg-wod-accent/30 text-red-300 border border-red-700/60"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
          }`}
        >
          <FileCode className="w-4 h-4 text-emerald-400" />
          <span>Module Files & Code Inspector</span>
        </button>

        <button
          onClick={() => setActiveTab("docs")}
          className={`flex items-center space-x-2 px-3 py-2 rounded-md font-medium transition ${
            activeTab === "docs"
              ? "bg-wod-accent/30 text-red-300 border border-red-700/60"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
          }`}
        >
          <BookOpen className="w-4 h-4 text-blue-400" />
          <span>Setup & WoD5e 5.3.28 Integration</span>
        </button>
      </nav>

      {/* Main Workspace Content */}
      <main className="flex-1 p-4 max-w-7xl w-full mx-auto space-y-6">
        
        {/* TAB 1: INTERACTIVE FOUNDRY VTT SIMULATOR */}
        {activeTab === "simulator" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column: WoD5e Actor Tracker Control Panel (6 cols) */}
            <div className="lg:col-span-5 space-y-5">
              
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                  <div className="flex items-center space-x-2">
                    <User className="w-5 h-5 text-red-400" />
                    <h2 className="font-serif text-lg font-semibold text-slate-100">
                      WoD5e Actor Sheet Control
                    </h2>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    System 5.3.28
                  </span>
                </div>

                {/* Actor Profile Info */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Actor Name</label>
                      <input
                        type="text"
                        value={actorName}
                        onChange={(e) => setActorName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-100 focus:border-red-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Splat / Type</label>
                      <select
                        value={actorType}
                        onChange={(e) => setActorType(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-100 focus:border-red-500 focus:outline-none"
                      >
                        <option value="vampire">Vampire (Hunger Tracker)</option>
                        <option value="werewolf">Werewolf (Rage Tracker)</option>
                        <option value="hunter">Hunter (Desperation Tracker)</option>
                      </select>
                    </div>
                  </div>

                  {/* HEALTH TRACKER (Aggravated, Superficial, Max) */}
                  <div className="bg-slate-950 p-4 rounded-lg border border-red-950/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Heart className="w-4 h-4 text-red-500 fill-red-500" />
                        <span className="text-sm font-medium text-red-200">Health Tracker</span>
                      </div>
                      <div className="flex items-center space-x-2 text-xs">
                        {isTorpor && (
                          <span className="px-2 py-0.5 rounded bg-red-950 text-red-400 font-bold border border-red-800 animate-pulse">
                            TORPOR / INCAPACITATED
                          </span>
                        )}
                        {!isTorpor && isHealthImpaired && (
                          <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-400 font-bold border border-amber-800">
                            IMPAIRED (-2 PENALTY)
                          </span>
                        )}
                        <span className="text-slate-400 font-mono">
                          {healthPercent}% Healthy
                        </span>
                      </div>
                    </div>

                    {/* Health Box Visualization */}
                    <div className="flex items-center space-x-1 justify-between pt-1">
                      {Array.from({ length: healthMax }).map((_, idx) => {
                        let boxType = "none"; // none | superficial | aggravated
                        if (idx < healthAgg) boxType = "aggravated";
                        else if (idx < healthAgg + healthSup) boxType = "superficial";

                        return (
                          <div
                            key={idx}
                            className={`w-9 h-9 rounded flex items-center justify-center font-bold text-sm border transition-all ${
                              boxType === "aggravated"
                                ? "bg-red-950 border-red-600 text-red-300 shadow-inner wod-glow-red"
                                : boxType === "superficial"
                                ? "bg-amber-950 border-amber-600 text-amber-300"
                                : "bg-slate-900 border-slate-700 text-slate-600"
                            }`}
                          >
                            {boxType === "aggravated" ? "X" : boxType === "superficial" ? "/" : ""}
                          </div>
                        );
                      })}
                    </div>

                    {/* Health Controls */}
                    <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                      <div>
                        <div className="flex justify-between text-slate-400 mb-1">
                          <span>Superficial Damage (/)</span>
                          <span className="font-mono text-amber-400">{healthSup}</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max={healthMax - healthAgg}
                          value={healthSup}
                          onChange={(e) => setHealthSup(Number(e.target.value))}
                          className="w-full accent-amber-500 bg-slate-800 rounded"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-slate-400 mb-1">
                          <span>Aggravated Damage (X)</span>
                          <span className="font-mono text-red-400">{healthAgg}</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max={healthMax - healthSup}
                          value={healthAgg}
                          onChange={(e) => setHealthAgg(Number(e.target.value))}
                          className="w-full accent-red-600 bg-slate-800 rounded"
                        />
                      </div>
                    </div>
                  </div>

                  {/* WILLPOWER TRACKER */}
                  <div className="bg-slate-950 p-4 rounded-lg border border-purple-950/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Brain className="w-4 h-4 text-purple-400" />
                        <span className="text-sm font-medium text-purple-200">Willpower Tracker</span>
                      </div>
                      <div className="text-xs font-mono text-slate-400">
                        {isWpImpaired ? (
                          <span className="text-amber-400 font-semibold">IMPAIRED</span>
                        ) : (
                          <span>{wpMax - totalWpDamage} / {wpMax} Available</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 justify-between">
                      {Array.from({ length: wpMax }).map((_, idx) => {
                        let boxType = "none";
                        if (idx < wpAgg) boxType = "aggravated";
                        else if (idx < wpAgg + wpSup) boxType = "superficial";

                        return (
                          <div
                            key={idx}
                            className={`w-9 h-9 rounded flex items-center justify-center font-bold text-sm border transition-all ${
                              boxType === "aggravated"
                                ? "bg-purple-950 border-purple-600 text-purple-300"
                                : boxType === "superficial"
                                ? "bg-indigo-950 border-indigo-600 text-indigo-300"
                                : "bg-slate-900 border-slate-700 text-slate-600"
                            }`}
                          >
                            {boxType === "aggravated" ? "X" : boxType === "superficial" ? "/" : ""}
                          </div>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="flex justify-between text-slate-400 mb-1">
                          <span>Superficial WP (/)</span>
                          <span className="font-mono text-indigo-400">{wpSup}</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max={wpMax - wpAgg}
                          value={wpSup}
                          onChange={(e) => setWpSup(Number(e.target.value))}
                          className="w-full accent-indigo-500 bg-slate-800 rounded"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-slate-400 mb-1">
                          <span>Aggravated WP (X)</span>
                          <span className="font-mono text-purple-400">{wpAgg}</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max={wpMax - wpSup}
                          value={wpAgg}
                          onChange={(e) => setWpAgg(Number(e.target.value))}
                          className="w-full accent-purple-600 bg-slate-800 rounded"
                        />
                      </div>
                    </div>
                  </div>

                  {/* HUNGER / RAGE TRACKER */}
                  <div className="bg-slate-950 p-4 rounded-lg border border-red-900/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Flame className="w-4 h-4 text-red-500" />
                        <span className="text-sm font-medium text-red-300">
                          {actorType === "werewolf" ? "Rage Level" : actorType === "hunter" ? "Desperation Level" : "Vampire Hunger"}
                        </span>
                      </div>
                      <span className="text-xs font-mono font-bold text-red-400">
                        {hungerVal} / 5
                      </span>
                    </div>

                    {/* Hunger Blood Droplet Buttons */}
                    <div className="flex items-center justify-between gap-2">
                      {[0, 1, 2, 3, 4, 5].map((val) => (
                        <button
                          key={val}
                          onClick={() => setHungerVal(val)}
                          className={`flex-1 py-2 rounded-md font-bold text-xs border transition-all ${
                            hungerVal === val
                              ? val === 5
                                ? "bg-red-900 border-red-500 text-white wod-glow-red animate-pulse"
                                : "bg-red-950 border-red-600 text-red-200"
                              : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                          }`}
                        >
                          {val === 0 ? "0 (Satiated)" : `H${val}`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="pt-2">
                    <label className="block text-xs text-slate-400 mb-2">Simulate Common Scenarios:</label>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <button
                        onClick={() => { setHealthSup(0); setHealthAgg(0); setHungerVal(1); setWpSup(0); setWpAgg(0); }}
                        className="p-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                      >
                        Fully Healthy
                      </button>
                      <button
                        onClick={() => { setHealthSup(2); setHealthAgg(1); setHungerVal(4); }}
                        className="p-2 rounded bg-amber-950 hover:bg-amber-900 text-amber-200 border border-amber-800"
                      >
                        Bloodied & Hungry
                      </button>
                      <button
                        onClick={() => { setHealthAgg(6); setHealthSup(0); setHungerVal(5); }}
                        className="p-2 rounded bg-red-950 hover:bg-red-900 text-red-200 border border-red-800 font-semibold"
                      >
                        Enter Torpor
                      </button>
                    </div>
                  </div>

                </div>
              </div>

            </div>

            {/* Right Column: Simulated Canvas Tile Display (7 cols) */}
            <div className="lg:col-span-7 space-y-5">
              
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-2">
                    <ImageIcon className="w-5 h-5 text-amber-400" />
                    <h2 className="font-serif text-lg font-semibold text-slate-100">
                      Foundry VTT Canvas Tile Preview
                    </h2>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setShowConfigModal(true)}
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700"
                    >
                      <Settings className="w-3.5 h-3.5 text-amber-400" />
                      <span>Edit Tile Config</span>
                    </button>
                  </div>
                </div>

                {/* Simulated Canvas Scene Frame */}
                <div className="relative w-full h-[380px] rounded-lg bg-slate-950 border border-slate-800 overflow-hidden bg-grid-pattern flex items-center justify-center">
                  
                  {/* Canvas Grid Overlay Badge */}
                  <div className="absolute top-3 left-3 bg-slate-900/90 border border-slate-700 px-3 py-1 rounded text-xs text-slate-300 backdrop-blur z-20 flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    <span>Canvas Scene: Haven Chamber</span>
                  </div>

                  {/* Active Matched Condition Badge */}
                  <div className="absolute top-3 right-3 z-20">
                    {activeRuleMatch ? (
                      <div className="bg-red-950/90 border border-red-600 px-3 py-1 rounded text-xs text-red-200 backdrop-blur wod-glow-red flex items-center space-x-1.5">
                        <Zap className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
                        <span>Rule: <strong>{activeRuleMatch.name}</strong></span>
                      </div>
                    ) : (
                      <div className="bg-slate-900/90 border border-slate-700 px-3 py-1 rounded text-xs text-slate-400 backdrop-blur">
                        <span>Rule: Base Default Texture</span>
                      </div>
                    )}
                  </div>

                  {/* Simulated Canvas Tile Document Object */}
                  <div className="relative transition-all duration-500 transform hover:scale-105">
                    <div 
                      className="w-64 h-64 rounded-xl border-2 overflow-hidden shadow-2xl relative transition-all duration-500"
                      style={{
                        borderColor: activeRuleMatch?.tint || "#334155",
                        boxShadow: activeRuleMatch ? `0 0 35px ${activeRuleMatch.tint || "rgba(220,38,38,0.5)"}` : "0 10px 30px rgba(0,0,0,0.8)",
                        opacity: activeRuleMatch?.alpha ?? 1.0,
                        transform: `scale(${activeRuleMatch?.scale ?? 1.0})`
                      }}
                    >
                      {/* Tile Texture Image */}
                      <img
                        src={activeRuleMatch ? activeRuleMatch.image : DEFAULT_BASE_IMAGE}
                        alt="Canvas Tile Texture"
                        className="w-full h-full object-cover transition-all duration-700"
                      />

                      {/* Dynamic Color Overlay Tint */}
                      {activeRuleMatch?.tint && (
                        <div 
                          className="absolute inset-0 transition-opacity duration-500 pointer-events-none mixing-blend-multiply"
                          style={{
                            backgroundColor: activeRuleMatch.tint,
                            opacity: 0.35
                          }}
                        />
                      )}

                      {/* HUD Overlay Label */}
                      <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent text-white space-y-0.5">
                        <p className="text-xs font-bold text-amber-300 flex items-center justify-between">
                          <span>{actorName}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/60 border border-amber-500/30">
                            Bound Tile
                          </span>
                        </p>
                        <p className="text-[11px] text-slate-300">
                          {activeRuleMatch ? activeRuleMatch.imageLabel : "Unimpaired Haven Portrait"}
                        </p>
                      </div>

                      {/* Tile HUD Button Overlay Simulation */}
                      <div className="absolute top-2 right-2 bg-red-950/90 border border-red-500 p-1.5 rounded text-white cursor-pointer hover:bg-red-800 transition" title="WoD5e Tile HUD Active">
                        <Flame className="w-4 h-4 text-red-400" />
                      </div>
                    </div>
                  </div>

                  {/* Scene Footnote */}
                  <div className="absolute bottom-3 left-3 right-3 bg-slate-900/80 border border-slate-800 p-2 rounded text-[11px] text-slate-400 flex items-center justify-between backdrop-blur">
                    <span>Target Texture Path: <code className="text-amber-300 font-mono">{activeRuleMatch?.image ? activeRuleMatch.image.substring(0, 45) + "..." : DEFAULT_BASE_IMAGE.substring(0, 45) + "..."}</code></span>
                    <span>Alpha: <code className="text-slate-200">{activeRuleMatch?.alpha ?? 1.0}</code></span>
                  </div>
                </div>

                {/* Real-Time Hook Evaluation Audit Log */}
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                      Hooks.on("updateActor") Real-Time Audit Feed
                    </span>
                    <span>Last 10 updates</span>
                  </div>

                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 text-[11px]">
                    {simulatedLog.map((log) => (
                      <div key={log.id} className="p-2 rounded bg-slate-900/80 border border-slate-800 flex items-center justify-between font-mono">
                        <div className="flex items-center space-x-2">
                          <span className="text-slate-500">{log.time}</span>
                          <span className="text-red-400 font-semibold">{log.matchedRule}</span>
                          <span className="text-slate-400">➔ {log.image}</span>
                        </div>
                        <div className="flex items-center space-x-2 text-slate-400">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">{log.healthState}</span>
                          <span className="px-1.5 py-0.5 rounded bg-red-950 text-red-300">{log.hungerState}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

        {/* TAB 2: RULE MATRIX & CONDITION BUILDER */}
        {activeTab === "rules" && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <h2 className="font-serif text-lg font-bold text-slate-100 flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-amber-400" />
                    Condition Priority Rules Matrix
                  </h2>
                  <p className="text-xs text-slate-400">
                    Rules are evaluated from top to bottom. The first rule matching the WoD5e actor's stats triggers the tile update.
                  </p>
                </div>

                <button
                  onClick={() => {
                    const newRule = {
                      id: `rule_${Date.now()}`,
                      name: `Custom Rule ${rules.length + 1}`,
                      enabled: true,
                      conditionType: "hunger_gte",
                      value: 4,
                      image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80",
                      imageLabel: "Custom Hunger Stain",
                      tint: "#dc2626",
                      alpha: 1.0,
                      scale: 1.0,
                      description: "New custom condition rule"
                    };
                    setRules([...rules, newRule]);
                  }}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-red-800 hover:bg-red-700 text-xs font-medium text-white transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add New Rule</span>
                </button>
              </div>

              {/* Rule Cards List */}
              <div className="space-y-3">
                {rules.map((rule, idx) => (
                  <div key={rule.id} className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center space-x-3">
                        <span className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-mono font-bold text-amber-400">
                          #{idx + 1}
                        </span>
                        <input
                          type="text"
                          value={rule.name}
                          onChange={(e) => {
                            const updated = [...rules];
                            updated[idx].name = e.target.value;
                            setRules(updated);
                          }}
                          className="bg-slate-900 border border-slate-800 rounded px-3 py-1 text-xs text-slate-100 font-semibold focus:border-red-500 focus:outline-none"
                        />
                      </div>

                      <div className="flex items-center space-x-3">
                        <label className="flex items-center space-x-1.5 text-xs text-slate-300">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={(e) => {
                              const updated = [...rules];
                              updated[idx].enabled = e.target.checked;
                              setRules(updated);
                            }}
                            className="rounded accent-red-600"
                          />
                          <span>Enabled</span>
                        </label>

                        <button
                          onClick={() => {
                            setRules(rules.filter(r => r.id !== rule.id));
                          }}
                          className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-slate-900"
                          title="Delete Rule"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Rule Fields Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs pt-1">
                      <div>
                        <label className="block text-slate-400 mb-1">Condition Trigger</label>
                        <select
                          value={rule.conditionType}
                          onChange={(e) => {
                            const updated = [...rules];
                            updated[idx].conditionType = e.target.value;
                            setRules(updated);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-slate-200"
                        >
                          <option value="health_torpor">Health: Torpor / Incapacitated</option>
                          <option value="health_aggravated">Health: Aggravated Damage ≥</option>
                          <option value="health_superficial">Health: Superficial Damage ≥</option>
                          <option value="health_impaired">Health: Impaired State</option>
                          <option value="hunger_equals">Hunger: Equals</option>
                          <option value="hunger_gte">Hunger: Greater Than / Equal ≥</option>
                          <option value="willpower_impaired">Willpower: Impaired</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-400 mb-1">Trigger Value</label>
                        <input
                          type="number"
                          value={rule.value}
                          onChange={(e) => {
                            const updated = [...rules];
                            updated[idx].value = Number(e.target.value);
                            setRules(updated);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-slate-200 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 mb-1">Texture Image Path / URL</label>
                        <input
                          type="text"
                          value={rule.image}
                          onChange={(e) => {
                            const updated = [...rules];
                            updated[idx].image = e.target.value;
                            setRules(updated);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-slate-200 font-mono text-[11px]"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 mb-1">Tint Color (Hex)</label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="color"
                            value={rule.tint || "#000000"}
                            onChange={(e) => {
                              const updated = [...rules];
                              updated[idx].tint = e.target.value;
                              setRules(updated);
                            }}
                            className="w-8 h-7 bg-slate-900 border border-slate-800 rounded cursor-pointer"
                          />
                          <input
                            type="text"
                            value={rule.tint || ""}
                            onChange={(e) => {
                              const updated = [...rules];
                              updated[idx].tint = e.target.value;
                              setRules(updated);
                            }}
                            placeholder="#8b0000"
                            className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-slate-200 font-mono text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: MODULE FILES & CODE INSPECTOR */}
        {activeTab === "package" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column: File Tree Selector (4 cols) */}
            <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <FileCode className="w-5 h-5 text-emerald-400" />
                  <h2 className="font-serif text-base font-bold text-slate-100">
                    Module Package Files
                  </h2>
                </div>
                <span className="text-xs text-slate-400">{filesList.length} Files</span>
              </div>

              <div className="space-y-1">
                {filesList.map((file, idx) => {
                  const Icon = file.icon;
                  return (
                    <button
                      key={file.path}
                      onClick={() => setSelectedFileIndex(idx)}
                      className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-mono transition ${
                        selectedFileIndex === idx
                          ? "bg-wod-accent/40 text-red-200 border border-red-700/60 font-semibold"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                      }`}
                    >
                      <Icon className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      <span className="truncate">{file.path}</span>
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-slate-800">
                <button
                  onClick={handleDownloadZip}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2 rounded bg-gradient-to-r from-red-700 to-wod-blood hover:from-red-600 hover:to-red-800 text-xs font-semibold text-white shadow"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Installable ZIP Package</span>
                </button>
              </div>
            </div>

            {/* Right Column: Code Viewer (8 cols) */}
            <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 flex flex-col h-[550px]">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-mono font-bold text-amber-400">
                    {filesList[selectedFileIndex].path}
                  </span>
                </div>

                <button
                  onClick={() => {
                    navigator.clipboard.writeText(filesList[selectedFileIndex].content);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy File Code</span>
                </button>
              </div>

              <div className="flex-1 overflow-auto bg-slate-950 p-4 rounded-lg border border-slate-800 font-mono text-xs text-slate-200 leading-relaxed">
                <pre>{filesList[selectedFileIndex].content}</pre>
              </div>
            </div>

          </div>
        )}

        {/* TAB 4: DOCUMENTATION & INTEGRATION GUIDE */}
        {activeTab === "docs" && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
            <div className="border-b border-slate-800 pb-4">
              <h2 className="font-serif text-xl font-bold text-slate-100 flex items-center gap-2">
                <BookOpen className="w-6 h-6 text-blue-400" />
                World of Darkness 5e (v5.3.28) & Foundry VTT v14 Module Architecture
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Full technical specification for the real-time dynamic tile update engine.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-300 leading-relaxed">
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg space-y-3">
                <h3 className="font-bold text-sm text-red-300 flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-400" />
                  1. WoD5e System 5.3.28 Data Structure
                </h3>
                <p>
                  The module hooks into <code className="text-amber-300">Hooks.on("updateActor")</code> and inspects the following paths on the actor document:
                </p>
                <ul className="list-disc pl-4 space-y-1 font-mono text-[11px] text-slate-400">
                  <li><code className="text-red-300">actor.system.health</code>: max, aggravated, superficial</li>
                  <li><code className="text-purple-300">actor.system.willpower</code>: max, aggravated, superficial</li>
                  <li><code className="text-amber-300">actor.system.hunger</code>: value (0 to 5)</li>
                  <li><code className="text-amber-300">actor.system.rage</code>: value (Werewolf splat)</li>
                  <li><code className="text-amber-300">actor.system.desperation</code>: value (Hunter splat)</li>
                </ul>
              </div>

              <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg space-y-3">
                <h3 className="font-bold text-sm text-red-300 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-blue-400" />
                  2. Foundry VTT v14 Tile Update Payload
                </h3>
                <p>
                  When a rule match occurs, the module calls <code className="text-amber-300">tileDoc.update(...)</code> with:
                </p>
                <pre className="p-3 bg-slate-900 rounded font-mono text-[11px] text-emerald-300">
{`tileDoc.update({
  texture: {
    src: "path/to/texture.webp",
    tint: "#8b0000"
  },
  alpha: 0.95,
  scaleX: 1.0,
  scaleY: 1.0
});`}
                </pre>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Simulated Tile Configuration Sheet Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-800/80 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl wod-glow-red">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-serif text-base font-bold text-red-100 flex items-center gap-2">
                <Settings className="w-4 h-4 text-red-500" />
                Foundry VTT v14 Tile Configuration [WoD5e Tracker Tab]
              </h3>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="flex items-center space-x-2 font-semibold text-slate-200">
                <input type="checkbox" defaultChecked className="rounded accent-red-600" />
                <span>Enable WoD5e Real-Time Dynamic Updates</span>
              </label>

              <div>
                <label className="block text-slate-400 mb-1">Target Actor Binding</label>
                <select className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 font-mono">
                  <option>{actorName} ({actorType})</option>
                  <option>Evelyn - Malkavian Primogen</option>
                  <option>Viktor - Brujah Anarch</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Default Base Image (Fallback)</label>
                <input
                  type="text"
                  defaultValue={DEFAULT_BASE_IMAGE}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 font-mono"
                />
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-end space-x-2">
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-1.5 rounded bg-red-800 hover:bg-red-700 text-white font-medium"
                >
                  Save & Update Tile
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-slate-900/80 border-t border-slate-800 py-3 px-4 text-center text-xs text-slate-500 flex items-center justify-between">
        <span>WoD5e Dynamic Tile Tracker Module &copy; 2026</span>
        <span>Built for Foundry VTT v14 & World of Darkness 5e (5.3.28)</span>
      </footer>
    </div>
  );
}

// Mount React Root
const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
