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

  if (healthChanged || willpowerChanged || hungerChanged) {
    WoD5eTileTrackerEngine.onActorTrackerUpdated(actor);
  }
});

// Pre-update hook to parse dynamic rule JSON before saving
Hooks.on("preUpdateTile", (tileDoc, changes, options, userId) => {
  const config = changes.flags?.["wod5e-dynamic-tile-tracker"]?.config;
  if (config && typeof config.rulesJson === "string") {
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
    try {
      // 1. Resolve root HTMLElement (handles native DOM in Foundry v13/v14 and jQuery $html)
      const rootEl = html instanceof HTMLElement 
        ? html 
        : (html && html[0] instanceof HTMLElement ? html[0] : (app.element ? (app.element instanceof HTMLElement ? app.element : app.element[0]) : null));

      if (!rootEl) return;

      const tileDoc = app.document || app.object;
      if (!tileDoc) return;

      // Prevent duplicate tab injection
      if (rootEl.querySelector('.wod5e-tracker-tab-btn')) return;

      // Load existing config flags
      const config = tileDoc.getFlag("wod5e-dynamic-tile-tracker", "config") || {
        enabled: false,
        actorId: "",
        defaultImage: "",
        rules: []
      };

      // 2. Locate navigation container using multiple fallback selectors
      const navEl = rootEl.querySelector('nav.sheet-tabs') ||
                    rootEl.querySelector('nav.tabs') ||
                    rootEl.querySelector('nav[data-group="primary"]') ||
                    rootEl.querySelector('nav[data-group]') ||
                    rootEl.querySelector('nav');

      if (!navEl) {
        console.warn("WoD5e Tile Tracker | Could not find navigation bar in TileConfig sheet.");
        return;
      }

      // 3. Locate tab content body container
      const bodyEl = rootEl.querySelector('section.sheet-body') ||
                     rootEl.querySelector('.sheet-body') ||
                     rootEl.querySelector('section.content') ||
                     rootEl.querySelector('form') ||
                     rootEl;

      // 4. Create Tab Header Link
      const tabNavBtn = document.createElement('a');
      tabNavBtn.className = 'item wod5e-tracker-tab-btn';
      tabNavBtn.setAttribute('data-tab', 'wod5e-tracker');
      tabNavBtn.setAttribute('data-group', 'primary');
      tabNavBtn.innerHTML = \`<i class="fas fa-droplet" style="color: #e53e3e; margin-right: 5px;"></i> WoD5e Tracker\`;
      navEl.appendChild(tabNavBtn);

      // 5. Create Tab Content Panel
      const tabContent = document.createElement('div');
      tabContent.className = 'tab wod5e-tracker-tab-content';
      tabContent.setAttribute('data-tab', 'wod5e-tracker');
      tabContent.setAttribute('data-group', 'primary');
      tabContent.style.padding = '10px 4px';

      // Options for Actors dropdown
      const actorOptions = (game.actors || [])
        .map(a => \`<option value="\${a.id}" \${a.id === config.actorId ? "selected" : ""}>\${a.name} (\${a.type || "Actor"})\${a.id === config.actorId ? "selected" : ""}</option>\`)
        .join('');

      // Build Tab Content HTML
      tabContent.innerHTML = \`
        <div class="wod5e-tracker-config-wrapper" style="display: flex; flex-direction: column; gap: 12px;">
          <div class="form-group">
            <label style="font-weight: bold;"><i class="fas fa-power-off"></i> Enable WoD5e Real-Time Dynamic Updates</label>
            <div class="form-fields">
              <input type="checkbox" name="flags.wod5e-dynamic-tile-tracker.config.enabled" \${config.enabled ? "checked" : ""}/>
            </div>
          </div>

          <div class="form-group">
            <label style="font-weight: bold;"><i class="fas fa-user-shield"></i> Bound WoD5e Actor</label>
            <div class="form-fields">
              <select name="flags.wod5e-dynamic-tile-tracker.config.actorId" style="width: 100%;">
                <option value="">-- Select Scene or World Actor --</option>
                \${actorOptions}
              </select>
            </div>
            <p class="notes">Select a Vampire, Werewolf, or Hunter character whose Health, Willpower, and Hunger/Rage trackers will update this tile in real time.</p>
          </div>

          <div class="form-group">
            <label style="font-weight: bold;"><i class="fas fa-image"></i> Default / Fallback Tile Texture</label>
            <div class="form-fields">
              <input type="text" name="flags.wod5e-dynamic-tile-tracker.config.defaultImage" value="\${config.defaultImage || tileDoc.texture?.src || ""}" placeholder="tiles/normal.png" style="flex: 1;"/>
              <button type="button" class="file-picker" data-type="image" data-target="flags.wod5e-dynamic-tile-tracker.config.defaultImage" title="Browse Files">
                <i class="fas fa-file-picker"></i>
              </button>
            </div>
          </div>

          <hr style="margin: 8px 0; border: none; border-top: 1px solid rgba(255,255,255,0.1);"/>

          <div>
            <h3 style="margin-bottom: 8px; border-bottom: 1px solid #7a7971; padding-bottom: 4px; font-size: 1.1em; display: flex; justify-content: space-between; align-items: center;">
              <span><i class="fas fa-list-check"></i> Tracker Dynamic Priority Rules</span>
              <button type="button" id="wod5e-add-rule-btn" class="button" style="padding: 2px 8px; font-size: 0.85em; width: auto;">
                <i class="fas fa-plus"></i> Add Rule
              </button>
            </h3>
            <p class="notes" style="margin-bottom: 10px;">Rules are evaluated top-to-bottom. The first matching rule applies its texture, tint, and scale to the tile.</p>
            
            <div id="wod5e-rules-container" style="display: flex; flex-direction: column; gap: 8px;">
              <!-- Rules injected dynamically -->
            </div>
          </div>

          <!-- Hidden input holding rules JSON data -->
          <input type="hidden" id="wod5e-rules-json-input" name="flags.wod5e-dynamic-tile-tracker.config.rulesJson" value="\${this._escapeHtml(JSON.stringify(config.rules || []))}"/>
        </div>
      \`;

      bodyEl.appendChild(tabContent);

      // 6. Bind Tab Switching Behavior
      const allTabBtns = navEl.querySelectorAll('.item');
      const allTabPanels = rootEl.querySelectorAll('.tab');

      const activateWodTab = () => {
        allTabBtns.forEach(btn => btn.classList.remove('active'));
        allTabPanels.forEach(panel => {
          panel.classList.remove('active');
          if (panel !== tabContent) panel.style.display = 'none';
        });
        tabNavBtn.classList.add('active');
        tabContent.classList.add('active');
        tabContent.style.display = 'block';
      };

      tabNavBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        activateWodTab();
      });

      // When clicking other tab buttons, hide WoD5e tracker tab panel
      allTabBtns.forEach(btn => {
        if (btn !== tabNavBtn) {
          btn.addEventListener('click', () => {
            tabNavBtn.classList.remove('active');
            tabContent.classList.remove('active');
            tabContent.style.display = 'none';
          });
        }
      });

      // 7. Initialize Rules Table & Handlers
      this._initRuleEditor(tabContent, config.rules || []);

      // FilePicker click handler binding
      tabContent.querySelectorAll('.file-picker').forEach(fpBtn => {
        fpBtn.addEventListener('click', (ev) => {
          ev.preventDefault();
          const targetName = fpBtn.getAttribute('data-target');
          const targetInput = rootEl.querySelector(\`input[name="\${targetName}"]\`);
          if (targetInput && typeof FilePicker !== "undefined") {
            new FilePicker({
              type: "image",
              current: targetInput.value,
              callback: path => { targetInput.value = path; }
            }).render(true);
          }
        });
      });

    } catch (err) {
      console.error("WoD5e Dynamic Tile Tracker | Error rendering tile config tab:", err);
    }
  }

  static _initRuleEditor(tabContent, initialRules) {
    let rules = [...initialRules];
    const rulesContainer = tabContent.querySelector('#wod5e-rules-container');
    const hiddenInput = tabContent.querySelector('#wod5e-rules-json-input');
    const addBtn = tabContent.querySelector('#wod5e-add-rule-btn');

    const updateJSON = () => {
      if (hiddenInput) {
        hiddenInput.value = JSON.stringify(rules);
      }
    };

    const renderRules = () => {
      if (!rulesContainer) return;
      if (rules.length === 0) {
        rulesContainer.innerHTML = \`
          <div style="padding: 12px; text-align: center; color: #888; background: rgba(0,0,0,0.15); border-radius: 4px; font-style: italic;">
            No rules configured. Click "Add Rule" to define dynamic tile textures based on Health, Willpower, or Hunger.
          </div>
        \`;
        updateJSON();
        return;
      }

      rulesContainer.innerHTML = rules.map((rule, index) => \`
        <div class="wod5e-rule-card" data-index="\${index}" style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; padding: 8px; display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed rgba(255,255,255,0.1); padding-bottom: 4px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" class="rule-enable-check" data-index="\${index}" \${rule.enabled !== false ? "checked" : ""} title="Enable/Disable Rule"/>
              <strong style="color: #ff6b6b;">Rule #\${index + 1}</strong>
            </div>
            <div style="display: flex; gap: 4px;">
              \${index > 0 ? \`<button type="button" class="rule-move-up" data-index="\${index}" title="Move Up" style="padding: 1px 5px;"><i class="fas fa-arrow-up"></i></button>\` : ''}
              \${index < rules.length - 1 ? \`<button type="button" class="rule-move-down" data-index="\${index}" title="Move Down" style="padding: 1px 5px;"><i class="fas fa-arrow-down"></i></button>\` : ''}
              <button type="button" class="rule-delete-btn" data-index="\${index}" title="Delete Rule" style="padding: 1px 5px; color: #e53e3e;"><i class="fas fa-trash"></i></button>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div>
              <label style="font-size: 0.8em; display: block; margin-bottom: 2px;">Condition Type</label>
              <select class="rule-cond-type" data-index="\${index}" style="width: 100%; font-size: 0.85em;">
                <option value="health_torpor" \${rule.conditionType === "health_torpor" ? "selected" : ""}>Health: In Torpor</option>
                <option value="health_impaired" \${rule.conditionType === "health_impaired" ? "selected" : ""}>Health: Impaired (Full Damage)</option>
                <option value="health_aggravated" \${rule.conditionType === "health_aggravated" ? "selected" : ""}>Health: Aggravated Damage >=</option>
                <option value="health_superficial" \${rule.conditionType === "health_superficial" ? "selected" : ""}>Health: Superficial Damage >=</option>
                <option value="health_percent_below" \${rule.conditionType === "health_percent_below" ? "selected" : ""}>Health: % Below or Equal <=</option>
                <option value="willpower_impaired" \${rule.conditionType === "willpower_impaired" ? "selected" : ""}>Willpower: Impaired</option>
                <option value="willpower_aggravated" \${rule.conditionType === "willpower_aggravated" ? "selected" : ""}>Willpower: Aggravated Damage >=</option>
                <option value="hunger_gte" \${rule.conditionType === "hunger_gte" ? "selected" : ""}>Hunger / Rage / Desperation >=</option>
                <option value="hunger_equals" \${rule.conditionType === "hunger_equals" ? "selected" : ""}>Hunger / Rage / Desperation ==</option>
              </select>
            </div>

            <div>
              <label style="font-size: 0.8em; display: block; margin-bottom: 2px;">Condition Value</label>
              <input type="number" class="rule-cond-val" data-index="\${index}" value="\${rule.value ?? 1}" min="0" max="100" style="width: 100%; font-size: 0.85em;"/>
            </div>
          </div>

          <div>
            <label style="font-size: 0.8em; display: block; margin-bottom: 2px;">Image / Texture Path</label>
            <div style="display: flex; gap: 4px;">
              <input type="text" class="rule-image-path" data-index="\${index}" value="\${rule.image || ""}" placeholder="tiles/injured.png" style="flex: 1; font-size: 0.85em;"/>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;">
            <div>
              <label style="font-size: 0.8em; display: block; margin-bottom: 2px;">Tint Hex</label>
              <input type="color" class="rule-tint-color" data-index="\${index}" value="\${rule.tint || "#ffffff"}" style="width: 100%; height: 24px; padding: 0; cursor: pointer;"/>
            </div>
            <div>
              <label style="font-size: 0.8em; display: block; margin-bottom: 2px;">Opacity (Alpha)</label>
              <input type="number" class="rule-alpha-val" data-index="\${index}" value="\${rule.alpha ?? 1.0}" min="0" max="1" step="0.1" style="width: 100%; font-size: 0.85em;"/>
            </div>
            <div>
              <label style="font-size: 0.8em; display: block; margin-bottom: 2px;">Scale Multiplier</label>
              <input type="number" class="rule-scale-val" data-index="\${index}" value="\${rule.scale ?? 1.0}" min="0.1" max="5" step="0.1" style="width: 100%; font-size: 0.85em;"/>
            </div>
          </div>
        </div>
      \`).join('');

      // Attach rule editing event listeners
      rulesContainer.querySelectorAll('.rule-enable-check').forEach(chk => {
        chk.addEventListener('change', (e) => {
          rules[Number(e.target.dataset.index)].enabled = e.target.checked;
          updateJSON();
        });
      });

      rulesContainer.querySelectorAll('.rule-cond-type').forEach(sel => {
        sel.addEventListener('change', (e) => {
          rules[Number(e.target.dataset.index)].conditionType = e.target.value;
          updateJSON();
        });
      });

      rulesContainer.querySelectorAll('.rule-cond-val').forEach(inp => {
        inp.addEventListener('input', (e) => {
          rules[Number(e.target.dataset.index)].value = Number(e.target.value);
          updateJSON();
        });
      });

      rulesContainer.querySelectorAll('.rule-image-path').forEach(inp => {
        inp.addEventListener('input', (e) => {
          rules[Number(e.target.dataset.index)].image = e.target.value;
          updateJSON();
        });
      });

      rulesContainer.querySelectorAll('.rule-tint-color').forEach(inp => {
        inp.addEventListener('input', (e) => {
          rules[Number(e.target.dataset.index)].tint = e.target.value;
          updateJSON();
        });
      });

      rulesContainer.querySelectorAll('.rule-alpha-val').forEach(inp => {
        inp.addEventListener('input', (e) => {
          rules[Number(e.target.dataset.index)].alpha = Number(e.target.value);
          updateJSON();
        });
      });

      rulesContainer.querySelectorAll('.rule-scale-val').forEach(inp => {
        inp.addEventListener('input', (e) => {
          rules[Number(e.target.dataset.index)].scale = Number(e.target.value);
          updateJSON();
        });
      });

      rulesContainer.querySelectorAll('.rule-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = Number(btn.dataset.index);
          rules.splice(idx, 1);
          renderRules();
        });
      });

      rulesContainer.querySelectorAll('.rule-move-up').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = Number(btn.dataset.index);
          if (idx > 0) {
            const temp = rules[idx];
            rules[idx] = rules[idx - 1];
            rules[idx - 1] = temp;
            renderRules();
          }
        });
      });

      rulesContainer.querySelectorAll('.rule-move-down').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = Number(btn.dataset.index);
          if (idx < rules.length - 1) {
            const temp = rules[idx];
            rules[idx] = rules[idx + 1];
            rules[idx + 1] = temp;
            renderRules();
          }
        });
      });

      updateJSON();
    };

    if (addBtn) {
      addBtn.addEventListener('click', (e) => {
        e.preventDefault();
        rules.push({
          id: \`rule-\${Date.now()}\`,
          conditionType: "hunger_gte",
          value: 4,
          image: "",
          tint: "#ff0000",
          alpha: 1.0,
          scale: 1.0,
          enabled: true
        });
        renderRules();
      });
    }

    renderRules();
  }

  static _escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
`;

const TILE_HUD_EXTENSION_MJS_CONTENT = `/**
 * Adds quick visual status HUD control button to Canvas Tile HUD
 */

export class WoD5eTileHUDExtension {
  static attachButton(app, html, data) {
    try {
      const rootEl = html instanceof HTMLElement 
        ? html 
        : (html && html[0] instanceof HTMLElement ? html[0] : (app.element ? (app.element instanceof HTMLElement ? app.element : app.element[0]) : null));

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
      button.innerHTML = \`<i class="fas fa-droplet" style="color: #e53e3e;"></i>\`;

      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        const actor = game.actors.get(config.actorId);
        if (actor) {
          actor.sheet.render(true);
        } else {
          ui.notifications.warn("No bound WoD5e Actor found for this Tile.");
        }
      });

      leftCol.appendChild(button);
    } catch (err) {
      console.error("WoD5e Dynamic Tile Tracker | Error attaching HUD button:", err);
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

1. Download \`wod5e-dynamic-tile-tracker-v14.zip\` from the download button above.
2. Extract the zip into your Foundry VTT user data directory:
   \`Data/modules/wod5e-dynamic-tile-tracker\`
   *(Ensure the folder path is \`Data/modules/wod5e-dynamic-tile-tracker/\` containing \`module.json\`)*
3. Launch Foundry VTT v14, launch your WoD5e world, navigate to **Manage Modules**, and enable **World of Darkness 5e - Dynamic Tile Tracker**.

## 📖 Usage & Accessing the WoD5e Tracker Tab

1. Double-click any Tile on your Canvas or create a new Tile.
2. In the Tile Configuration window, look for the **WoD5e Tracker** tab next to Basic / Animation / Overhead.
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
    imageLabel: "Crimson Bestial Frenzy",
    tint: "#dc2626",
    alpha: 1.0,
    scale: 1.02,
    description: "Triggers when Hunger reaches max level 5 (Frenzy danger)"
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

  function CpuIcon(props) {
    return <Zap {...props} />;
  }

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

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Splat / Actor Type
                  </label>
                  <select
                    value={actorType}
                    onChange={(e) => setActorType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-red-500"
                  >
                    <option value="vampire">Vampire (Hunger Tracker)</option>
                    <option value="werewolf">Werewolf (Rage Tracker)</option>
                    <option value="hunter">Hunter (Desperation Tracker)</option>
                  </select>
                </div>
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
                    ) : isHealthImpaired ? (
                      <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-700 font-bold">
                        IMPAIRED
                      </span>
                    ) : (
                      <span className="text-slate-400">{healthPercent}% Health</span>
                    )}
                  </div>
                </div>

                {/* Health Track Visual Squares */}
                <div className="flex items-center gap-1.5 pt-1">
                  {Array.from({ length: healthMax }).map((_, idx) => {
                    let boxState = "empty"; // empty | superficial | aggravated
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
                        title={boxState === "aggravated" ? "Aggravated Damage [X]" : boxState === "superficial" ? "Superficial Damage [/]" : "Empty Box"}
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

              {/* WILLPOWER TRACKER */}
              <div className="bg-slate-950 p-4 rounded-lg border border-purple-950/60 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-purple-400 font-semibold text-sm">
                    <Brain className="w-4 h-4 text-purple-400" />
                    <span>Willpower Tracker</span>
                  </div>
                  {isWpImpaired && (
                    <span className="text-xs px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-700 font-bold">
                      WILLPOWER IMPAIRED
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 pt-1">
                  {Array.from({ length: wpMax }).map((_, idx) => {
                    let boxState = "empty";
                    if (idx < wpAgg) boxState = "aggravated";
                    else if (idx < wpAgg + wpSup) boxState = "superficial";

                    return (
                      <div
                        key={idx}
                        className={`flex-1 h-8 rounded border flex items-center justify-center font-bold text-xs transition-all ${
                          boxState === "aggravated"
                            ? "bg-purple-900 border-purple-500 text-purple-100"
                            : boxState === "superficial"
                            ? "bg-indigo-900/80 border-indigo-500 text-indigo-200"
                            : "bg-slate-900 border-slate-700 text-slate-600"
                        }`}
                      >
                        {boxState === "aggravated" ? "X" : boxState === "superficial" ? "/" : ""}
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-3 pt-2 text-xs">
                  <div>
                    <div className="flex justify-between text-slate-300 mb-1">
                      <span>Aggravated Willpower [X]</span>
                      <span className="font-bold text-purple-400">{wpAgg} / {wpMax}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={wpMax}
                      value={wpAgg}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setWpAgg(val);
                        if (val + wpSup > wpMax) setWpSup(wpMax - val);
                      }}
                      className="w-full accent-purple-600 bg-slate-800 rounded h-1.5 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* HUNGER / RAGE TRACKER */}
              <div className="bg-slate-950 p-4 rounded-lg border border-red-950/60 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-red-500 font-semibold text-sm">
                    <Flame className="w-4 h-4 text-red-500" />
                    <span className="capitalize">{actorType === "werewolf" ? "Rage" : actorType === "hunter" ? "Desperation" : "Hunger"} Level</span>
                  </div>
                  <span className="text-xs font-bold text-red-400">{hungerVal} / 5</span>
                </div>

                <div className="flex items-center gap-2">
                  {[0, 1, 2, 3, 4, 5].map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setHungerVal(lvl)}
                      className={`flex-1 py-2 rounded font-bold text-xs border transition ${
                        hungerVal === lvl
                          ? "bg-red-600 text-white border-red-400 shadow-md shadow-red-900/50"
                          : "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Interactive Canvas Tile Rendering & Event Console */}
            <div className="lg:col-span-7 space-y-6">

              {/* Canvas Preview Box */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <h2 className="font-serif font-bold text-lg text-slate-100 flex items-center gap-2">
                      <ImageIcon className="w-5 h-5 text-red-400" />
                      Foundry VTT Active Canvas Tile
                    </h2>
                    <p className="text-xs text-slate-400">
                      Real-time scene tile texture updated automatically by WoD5e hook <code className="text-red-400">updateActor</code>
                    </p>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Hook Live
                  </span>
                </div>

                {/* Tile Frame */}
                <div className="relative w-full h-80 rounded-lg overflow-hidden border-2 border-slate-800 bg-slate-950 flex items-center justify-center group shadow-2xl">
                  {/* Grid Background */}
                  <div 
                    className="absolute inset-0 opacity-20 pointer-events-none"
                    style={{
                      backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)`,
                      backgroundSize: '24px 24px'
                    }}
                  />

                  {/* Rendered Tile Image */}
                  <img
                    src={activeRuleMatch ? activeRuleMatch.image : DEFAULT_BASE_IMAGE}
                    alt="Tile Texture"
                    className="w-64 h-64 object-cover rounded-lg shadow-2xl transition-all duration-500 ease-out transform"
                    style={{
                      filter: activeRuleMatch?.tint && activeRuleMatch.tint !== "None" ? `drop-shadow(0 0 15px ${activeRuleMatch.tint})` : 'none',
                      borderColor: activeRuleMatch?.tint || 'transparent',
                      opacity: activeRuleMatch?.alpha ?? 1.0,
                      transform: `scale(${activeRuleMatch?.scale ?? 1.0})`
                    }}
                  />

                  {/* Overlay Status Badge on Tile */}
                  <div className="absolute top-3 left-3 bg-slate-950/90 border border-slate-700 backdrop-blur px-3 py-1.5 rounded-md text-xs font-medium space-y-0.5">
                    <div className="text-slate-400 text-[10px] uppercase tracking-wider">Applied Rule</div>
                    <div className="text-red-400 font-bold">{activeRuleMatch ? activeRuleMatch.name : "Default Base Texture"}</div>
                  </div>

                  {/* Canvas Tile HUD Button Overlay Mock */}
                  <div className="absolute bottom-3 right-3 bg-red-950/80 border border-red-600 backdrop-blur p-2 rounded-md shadow-lg flex items-center space-x-2 text-xs text-red-200">
                    <Flame className="w-4 h-4 text-red-500" />
                    <span>WoD5e Tile HUD Active</span>
                  </div>
                </div>

                {/* Applied Properties Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                  <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px] uppercase">Texture Src</span>
                    <span className="font-mono text-slate-300 truncate block">
                      {activeRuleMatch ? activeRuleMatch.imageLabel : "tiles/haven_normal.webp"}
                    </span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px] uppercase">Tint Hex</span>
                    <span className="font-mono text-red-400 font-bold block">
                      {activeRuleMatch?.tint || "#ffffff"}
                    </span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px] uppercase">Opacity Alpha</span>
                    <span className="font-mono text-amber-400 font-bold block">
                      {activeRuleMatch?.alpha ?? 1.0}
                    </span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px] uppercase">Scale Multiplier</span>
                    <span className="font-mono text-purple-400 font-bold block">
                      {activeRuleMatch?.scale ?? 1.0}x
                    </span>
                  </div>
                </div>
              </div>

              {/* Reactive Event Execution Log */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-3 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h3 className="font-serif font-bold text-sm text-slate-200 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    Foundry Event Log (<code className="text-xs text-slate-400">updateActor</code>)
                  </h3>
                  <button
                    onClick={() => setSimulatedLog([])}
                    className="text-xs text-slate-500 hover:text-slate-300 transition"
                  >
                    Clear Log
                  </button>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto font-mono text-xs">
                  {simulatedLog.map((log) => (
                    <div
                      key={log.id}
                      className="bg-slate-950/80 p-2 rounded border border-slate-800/80 flex items-center justify-between text-slate-300"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-500 text-[10px]">{log.time}</span>
                        <span className="text-red-400 font-bold">[{log.actor}]</span>
                        <span>➔ Rule matched: <strong className="text-slate-100">{log.matchedRule}</strong></span>
                      </div>
                      <div className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                        {log.healthState} | {log.hungerState}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* 2. CONDITION RULES MATRIX */}
        {activeTab === "rules" && (
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-6 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h2 className="font-serif font-bold text-xl text-slate-100">
                  Condition Priority Rules Matrix
                </h2>
                <p className="text-xs text-slate-400">
                  Rules are evaluated top-to-bottom on the Tile. The first matching condition updates the canvas tile image.
                </p>
              </div>

              <button
                onClick={() => {
                  const newRule = {
                    id: `rule_${Date.now()}`,
                    name: `New Custom Rule #${rules.length + 1}`,
                    enabled: true,
                    conditionType: "hunger_gte",
                    value: 4,
                    image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80",
                    imageLabel: "Custom Rule Image",
                    tint: "#dc2626",
                    alpha: 1.0,
                    scale: 1.0,
                    description: "Triggers when Hunger is 4 or higher"
                  };
                  setRules([...rules, newRule]);
                }}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white rounded text-xs font-semibold shadow transition"
              >
                <Plus className="w-4 h-4" />
                <span>Add New Rule</span>
              </button>
            </div>

            {/* Rules Cards List */}
            <div className="space-y-4">
              {rules.map((rule, index) => (
                <div
                  key={rule.id}
                  className={`p-4 rounded-lg border transition ${
                    rule.enabled
                      ? "bg-slate-950 border-slate-800 hover:border-red-900/60"
                      : "bg-slate-950/40 border-slate-800/40 opacity-60"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(e) => {
                          const updated = [...rules];
                          updated[index].enabled = e.target.checked;
                          setRules(updated);
                        }}
                        className="w-4 h-4 accent-red-600 cursor-pointer"
                      />
                      <span className="font-mono text-xs text-red-500 font-bold">Priority #{index + 1}</span>
                      <input
                        type="text"
                        value={rule.name}
                        onChange={(e) => {
                          const updated = [...rules];
                          updated[index].name = e.target.value;
                          setRules(updated);
                        }}
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-bold text-slate-200 focus:outline-none focus:border-red-500"
                      />
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          if (index === 0) return;
                          const updated = [...rules];
                          const temp = updated[index];
                          updated[index] = updated[index - 1];
                          updated[index - 1] = temp;
                          setRules(updated);
                        }}
                        disabled={index === 0}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded text-xs text-slate-300"
                      >
                        ▲ Up
                      </button>
                      <button
                        onClick={() => {
                          if (index === rules.length - 1) return;
                          const updated = [...rules];
                          const temp = updated[index];
                          updated[index] = updated[index + 1];
                          updated[index + 1] = temp;
                          setRules(updated);
                        }}
                        disabled={index === rules.length - 1}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded text-xs text-slate-300"
                      >
                        ▼ Down
                      </button>
                      <button
                        onClick={() => {
                          setRules(rules.filter((_, i) => i !== index));
                        }}
                        className="p-1.5 text-slate-500 hover:text-red-400 transition"
                        title="Delete Rule"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div>
                      <label className="block text-slate-400 mb-1">Condition Trigger</label>
                      <select
                        value={rule.conditionType}
                        onChange={(e) => {
                          const updated = [...rules];
                          updated[index].conditionType = e.target.value;
                          setRules(updated);
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
                      >
                        <option value="health_torpor">Health: Torpor / Incapacitated</option>
                        <option value="health_aggravated">Health: Aggravated Damage ≥</option>
                        <option value="health_superficial">Health: Superficial Damage ≥</option>
                        <option value="health_impaired">Health: Impaired Status</option>
                        <option value="hunger_equals">Hunger / Rage Level ==</option>
                        <option value="hunger_gte">Hunger / Rage Level ≥</option>
                        <option value="willpower_impaired">Willpower: Impaired</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Condition Value</label>
                      <input
                        type="number"
                        value={rule.value}
                        onChange={(e) => {
                          const updated = [...rules];
                          updated[index].value = Number(e.target.value);
                          setRules(updated);
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Tint Color (Hex)</label>
                      <input
                        type="text"
                        value={rule.tint}
                        onChange={(e) => {
                          const updated = [...rules];
                          updated[index].tint = e.target.value;
                          setRules(updated);
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. MODULE SOURCE INSPECTOR */}
        {activeTab === "package" && (
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-6 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h2 className="font-serif font-bold text-xl text-slate-100">
                  Module Manifest & Source Code Inspector
                </h2>
                <p className="text-xs text-slate-400">
                  Inspect the physical ES Module code generated for Foundry VTT v14 and WoD5e 5.3.28
                </p>
              </div>

              <button
                onClick={handleDownloadZip}
                disabled={isDownloading}
                className="flex items-center space-x-2 px-3.5 py-1.5 bg-red-700 hover:bg-red-600 text-white rounded text-xs font-semibold shadow transition"
              >
                <Download className="w-4 h-4" />
                <span>{isDownloading ? "Zipping..." : "Download Zip"}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* File List */}
              <div className="lg:col-span-4 bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                <div className="text-xs font-semibold text-slate-400 px-2 py-1 uppercase tracking-wider">
                  Module File Tree
                </div>
                {filesList.map((file, idx) => {
                  const Icon = file.icon;
                  return (
                    <button
                      key={file.path}
                      onClick={() => setSelectedFileIndex(idx)}
                      className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs transition ${
                        selectedFileIndex === idx
                          ? "bg-red-950/80 text-red-300 border border-red-800 font-bold"
                          : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                      }`}
                    >
                      <Icon className="w-4 h-4 text-red-400" />
                      <span className="font-mono truncate">{file.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Code Viewer */}
              <div className="lg:col-span-8 bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-mono text-xs text-red-400 font-bold">
                    {filesList[selectedFileIndex].path}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(filesList[selectedFileIndex].content);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="flex items-center space-x-1 text-xs text-slate-400 hover:text-slate-200 transition"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Code</span>
                  </button>
                </div>

                <pre className="font-mono text-xs text-slate-300 max-h-96 overflow-y-auto p-3 bg-slate-900 rounded border border-slate-800 leading-relaxed">
                  {filesList[selectedFileIndex].content}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* 4. FOUNDRY VTT SETUP GUIDE */}
        {activeTab === "docs" && (
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-6 shadow-xl text-slate-200 leading-relaxed">
            <div className="border-b border-slate-800 pb-4">
              <h2 className="font-serif font-bold text-2xl text-red-100">
                Foundry VTT v14 Installation & Access Guide
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                How to install and configure the WoD5e Dynamic Tile Tracker in your world.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-slate-950 p-5 rounded-lg border border-slate-800 space-y-2">
                <div className="w-8 h-8 rounded bg-red-950 border border-red-800 flex items-center justify-center text-red-400 font-bold text-sm">
                  1
                </div>
                <h3 className="font-serif font-bold text-slate-100">Step 1: Download & Extract</h3>
                <p className="text-xs text-slate-400">
                  Download <code className="text-red-400">wod5e-dynamic-tile-tracker-v14.zip</code> and extract it to your Foundry User Data path:
                </p>
                <div className="bg-slate-900 p-2 rounded text-[11px] font-mono text-amber-300 border border-slate-800">
                  Data/modules/wod5e-dynamic-tile-tracker/
                </div>
              </div>

              <div className="bg-slate-950 p-5 rounded-lg border border-slate-800 space-y-2">
                <div className="w-8 h-8 rounded bg-red-950 border border-red-800 flex items-center justify-center text-red-400 font-bold text-sm">
                  2
                </div>
                <h3 className="font-serif font-bold text-slate-100">Step 2: Enable Module in World</h3>
                <p className="text-xs text-slate-400">
                  Launch Foundry VTT v14, open your World of Darkness 5e world, open <strong>Manage Modules</strong>, and check <strong>World of Darkness 5e - Dynamic Tile Tracker</strong>.
                </p>
              </div>

              <div className="bg-slate-950 p-5 rounded-lg border border-slate-800 space-y-2">
                <div className="w-8 h-8 rounded bg-red-950 border border-red-800 flex items-center justify-center text-red-400 font-bold text-sm">
                  3
                </div>
                <h3 className="font-serif font-bold text-slate-100">Step 3: Access WoD5e Tracker Tab</h3>
                <p className="text-xs text-slate-400">
                  Double-click any Tile on the canvas. In the Tile Sheet, click the new <strong>WoD5e Tracker</strong> tab on the right side of the navigation header.
                </p>
              </div>
            </div>

            <div className="bg-slate-950 p-5 rounded-lg border border-red-900/60 space-y-3">
              <h3 className="font-serif font-bold text-lg text-red-300 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                Where to find the "WoD5e Tracker" tab in Foundry VTT
              </h3>
              <p className="text-xs text-slate-300">
                When you double-click or edit a Tile on the canvas, Foundry VTT opens the <strong>Tile Configuration Sheet</strong>. Across the top navigation bar (where <em>Basic</em>, <em>Animation</em>, and <em>Overhead</em> are located), our module automatically injects the <strong className="text-red-400">WoD5e Tracker</strong> tab tab with a crimson droplet icon.
              </p>
              <p className="text-xs text-slate-400">
                If you do not see the tab, verify that:
              </p>
              <ul className="list-disc list-inside text-xs text-slate-400 space-y-1">
                <li>The module is enabled under <strong>Game Settings ➔ Manage Modules</strong>.</li>
                <li>The module directory is named exactly <code className="text-red-400">wod5e-dynamic-tile-tracker</code> under <code className="text-slate-300">Data/modules/</code>.</li>
                <li>Your world system is set to World of Darkness 5e (v5.3.28 or compatible v5.3+).</li>
              </ul>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

// React 18 Root Render
const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
