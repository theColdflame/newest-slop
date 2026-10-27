/**
 * Core Tile Tracker Engine for WoD5e 5.3.28 in Foundry VTT v14
 * Real-time reactive calculation engine for Health (Aggravated, Superficial, Remaining, Impaired, Torpor),
 * Willpower, Hunger / Rage / Desperation (0-5), and Frenzy State.
 */

export class WoD5eTileTrackerEngine {
  static MODULE_ID = "wod5e-dynamic-tile-tracker";

  static init() {
    this._debouncedUpdates = new Map();
  }

  /**
   * Main listener when actor tracker values (Health, Willpower, Hunger, Frenzy) change
   */
  static onActorTrackerUpdated(actor) {
    if (!actor) return;

    const scene = canvas.scene;
    if (!scene) return;

    const actorId = actor.id;
    const actorUuid = actor.uuid;
    const protoActorId = actor.prototypeToken?.actor?.id || actor.token?.actor?.id;

    // Find all tiles in active scene bound to this actor (by ID or UUID)
    const boundTiles = scene.tiles.filter(t => {
      const config = t.getFlag(this.MODULE_ID, "config");
      if (!config || !config.enabled) return false;
      const targetId = config.actorId;
      if (!targetId) return false;

      return (
        targetId === actorId ||
        targetId === actorUuid ||
        (protoActorId && targetId === protoActorId)
      );
    });

    for (const tileDoc of boundTiles) {
      this.debouncedEvaluateTile(tileDoc, actor);
    }
  }

  /**
   * Debounces updates per tile to avoid infinite update loops or rapid frame lag
   */
  static debouncedEvaluateTile(tileDoc, actorOverride = null) {
    if (!tileDoc || !tileDoc.id) return;
    const tileId = tileDoc.id;

    if (this._debouncedUpdates.has(tileId)) {
      clearTimeout(this._debouncedUpdates.get(tileId));
    }

    let delay = 150;
    try {
      if (typeof game !== "undefined" && game.settings) {
        delay = game.settings.get(this.MODULE_ID, "updateDebounce") ?? 150;
      }
    } catch (e) {
      delay = 150;
    }

    const timer = setTimeout(() => {
      this._debouncedUpdates.delete(tileId);
      this.evaluateTile(tileDoc, actorOverride);
    }, delay);

    this._debouncedUpdates.set(tileId, timer);
  }

  /**
   * Evaluates level mappings and priority rules against actor state and updates tile appearance
   */
  static async evaluateTile(tileDoc, actorOverride = null) {
    const config = tileDoc.getFlag(this.MODULE_ID, "config");
    if (!config || !config.enabled) return;

    // Resolve bound actor by ID or UUID
    let actor = actorOverride;
    if (!actor && config.actorId) {
      if (typeof fromUuidSync === "function") {
        try {
          actor = fromUuidSync(config.actorId);
        } catch (e) {
          actor = null;
        }
      }
      if (!actor && game.actors) {
        actor = game.actors.get(config.actorId);
      }
      if (!actor && canvas.tokens) {
        const token = canvas.tokens.placeables.find(t => t.actor?.id === config.actorId || t.actor?.uuid === config.actorId);
        if (token) actor = token.actor;
      }
    }

    if (!actor) return;

    // Compute WoD5e Actor Tracker Stats (5.3.28 Data Structure & WoD 5e Rules)
    const stats = this.extractWoD5eStats(actor);

    let targetSrc = null;
    let targetTint = null;
    let targetAlpha = null;
    let targetScale = null;
    let targetHidden = null;
    let matchedRule = null;

    // Helper to test if string represents hidden/no visual tile
    const isNoTileVal = (val) => {
      if (val === undefined || val === null) return false;
      const s = String(val).trim().toLowerCase();
      return s === "__none__" || s === "none" || s === "hidden" || s === "invisible";
    };

    const TRANSPARENT_SVG = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E";

    // 1. Check Specific Stat Level Mapping
    if (config.statMap?.enabled && config.statMap?.statType) {
      const levelImage = this.getStatLevelImage(config.statMap, stats);
      if (levelImage !== null && levelImage !== "") {
        if (isNoTileVal(levelImage)) {
          targetSrc = TRANSPARENT_SVG;
          targetAlpha = 0;
          targetHidden = true;
        } else {
          targetSrc = levelImage;
        }
      }
    }

    // 2. Priority Conditional Rules (if no level map match or level map disabled)
    if (targetSrc === null && targetHidden !== true && config.rules && config.rules.length > 0) {
      for (const rule of config.rules) {
        if (this.checkRuleMatch(rule, stats)) {
          matchedRule = rule;
          if (rule.hideTile || isNoTileVal(rule.image)) {
            targetSrc = TRANSPARENT_SVG;
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

    // 3. Fallback to default / base tile image
    if (targetSrc === null && targetHidden !== true) {
      if (config.defaultHide || isNoTileVal(config.defaultImage)) {
        targetSrc = TRANSPARENT_SVG;
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

    // Prepare update payload for Foundry VTT v14 Tile Document
    const updates = {
      texture: {
        src: targetSrc,
        tint: targetTint
      },
      alpha: targetAlpha,
      scaleX: targetScale,
      scaleY: targetScale,
      hidden: targetHidden
    };

    // Apply tile update if parameters changed
    const currentSrc = tileDoc.texture.src;
    const currentTint = tileDoc.texture.tint;

    if (
      currentSrc !== targetSrc ||
      currentTint !== targetTint ||
      tileDoc.alpha !== targetAlpha ||
      tileDoc.hidden !== targetHidden ||
      tileDoc.scaleX !== targetScale
    ) {
      try {
        if (game.settings && game.settings.get(this.MODULE_ID, "enableDebug")) {
          console.log(`WoD5e Tile Tracker | Updating Tile ${tileDoc.id} for Actor ${actor.name}:`, updates, { matchedRule, stats });
        }
      } catch (e) {}

      await tileDoc.update(updates);
    }
  }

  /**
   * Retrieves specific image assigned to the actor's current level for the mapped stat
   */
  static getStatLevelImage(statMap, stats) {
    if (!statMap) return null;

    const statType = statMap.statType;
    let currentVal = 0;

    switch (statType) {
      case "hunger":
        currentVal = stats.hungerVal;
        break;
      case "frenzy":
        currentVal = stats.isFrenzied ? 1 : 0;
        break;
      case "health_agg":
        currentVal = stats.effectiveHealthAgg;
        break;
      case "health_sup":
        currentVal = stats.effectiveHealthSup;
        break;
      case "health_total":
        currentVal = stats.totalHealthDamage;
        break;
      case "health_remaining":
        currentVal = stats.healthRemaining;
        break;
      case "willpower_agg":
        currentVal = stats.effectiveWpAgg;
        break;
      case "willpower_sup":
        currentVal = stats.effectiveWpSup;
        break;
      case "willpower_total":
        currentVal = stats.totalWpDamage;
        break;
      case "willpower_remaining":
        currentVal = stats.wpRemaining;
        break;
      default:
        currentVal = 0;
    }

    const levelDict = statMap.statMaps?.[statType] || statMap.levels;
    if (!levelDict) return null;

    const img = levelDict[currentVal] ?? levelDict[String(currentVal)];
    if (img === undefined || img === null) return null;
    return String(img).trim();
  }

  /**
   * Extract Health, Willpower, Hunger, Frenzy trackers according to WoD5e 5.3.28 system schema
   * Correctly accounting for combined Superficial and Aggravated damage boxes & overflow.
   */
  static extractWoD5eStats(actor) {
    const sys = actor.system || {};

    // 1. Health Tracker (WoD5e System 5.3.28: system.health or system.attributes.health)
    const health = sys.health || sys.attributes?.health || { max: 6, aggravated: 0, superficial: 0 };
    const rawHealthMax = Number(health.max ?? health.value ?? 6);
    const healthMax = Math.max(1, isNaN(rawHealthMax) ? 6 : rawHealthMax);

    const rawAgg = Number(health.aggravated ?? health.agg ?? 0);
    const rawSup = Number(health.superficial ?? health.sup ?? 0);

    const healthAgg = Math.max(0, isNaN(rawAgg) ? 0 : rawAgg);
    const healthSup = Math.max(0, isNaN(rawSup) ? 0 : rawSup);

    // Total health damage capped to maximum health tracker size
    const totalHealthDamage = Math.min(healthMax, healthAgg + healthSup);
    
    // Aggravated damage takes precedence on the tracker boxes.
    // Effective Aggravated cannot exceed health max.
    const effectiveHealthAgg = Math.min(healthMax, healthAgg);

    // Effective Superficial occupies remaining damaged boxes (if both agg & sup are set).
    const effectiveHealthSup = Math.min(healthSup, Math.max(0, healthMax - effectiveHealthAgg));

    const healthRemaining = Math.max(0, healthMax - totalHealthDamage);
    const healthPercent = Math.max(0, Math.min(100, Math.round((healthRemaining / healthMax) * 100)));

    const isTorpor = effectiveHealthAgg >= healthMax;
    const isHealthImpaired = totalHealthDamage >= healthMax;

    // 2. Willpower Tracker
    const willpower = sys.willpower || sys.attributes?.willpower || { max: 6, aggravated: 0, superficial: 0 };
    const rawWpMax = Number(willpower.max ?? willpower.value ?? 6);
    const wpMax = Math.max(1, isNaN(rawWpMax) ? 6 : rawWpMax);

    const rawWpAgg = Number(willpower.aggravated ?? willpower.agg ?? 0);
    const rawWpSup = Number(willpower.superficial ?? willpower.sup ?? 0);

    const wpAgg = Math.max(0, isNaN(rawWpAgg) ? 0 : rawWpAgg);
    const wpSup = Math.max(0, isNaN(rawWpSup) ? 0 : rawWpSup);

    const totalWpDamage = Math.min(wpMax, wpAgg + wpSup);
    const effectiveWpAgg = Math.min(wpMax, wpAgg);
    const effectiveWpSup = Math.min(wpSup, Math.max(0, wpMax - effectiveWpAgg));
    const wpRemaining = Math.max(0, wpMax - totalWpDamage);
    const isWpImpaired = totalWpDamage >= wpMax;

    // 3. Hunger / Rage / Desperation (0..5)
    const rawHunger = Number(
      sys.hunger?.value ??
      sys.hunger ??
      sys.rage?.value ??
      sys.rage ??
      sys.desperation?.value ??
      sys.desperation ??
      0
    );
    const hungerVal = Math.max(0, Math.min(5, isNaN(rawHunger) ? 0 : rawHunger));

    // 4. Frenzy State (WoD5e 5.3.28 system schema & active effect statuses)
    const isFrenzied = Boolean(
      sys.frenzy?.active ||
      sys.frenzy?.value ||
      sys.frenzy === true ||
      sys.isFrenzied ||
      (actor.statuses && (actor.statuses.has("frenzy") || actor.statuses.has("frenzied"))) ||
      (actor.effects && actor.effects.some(e => !e.disabled && (
        (e.name && e.name.toLowerCase().includes("frenzy")) ||
        (e.label && e.label.toLowerCase().includes("frenzy")) ||
        (e.statuses && (e.statuses.has("frenzy") || e.statuses.has("frenzied")))
      )))
    );
    const frenzyVal = isFrenzied ? 1 : 0;

    return {
      healthMax,
      healthAgg,
      healthSup,
      effectiveHealthAgg,
      effectiveHealthSup,
      totalHealthDamage,
      healthRemaining,
      healthPercent,
      isHealthImpaired,
      isTorpor,
      wpMax,
      wpAgg,
      wpSup,
      effectiveWpAgg,
      effectiveWpSup,
      totalWpDamage,
      wpRemaining,
      isWpImpaired,
      hungerVal,
      isFrenzied,
      frenzyVal
    };
  }

  /**
   * Rule Condition Evaluator
   */
  static checkRuleMatch(rule, stats) {
    if (!rule || !rule.enabled) return false;

    const val = Number(rule.value ?? 0);

    // Health Aggravated Exact or Threshold
    if (rule.conditionType === "health_agg_equals" || rule.conditionType === "health_aggravated_exact") {
      if (stats.effectiveHealthAgg !== val) return false;
    }
    if (rule.conditionType === "health_aggravated" && stats.effectiveHealthAgg < val) return false;

    // Health Superficial Exact or Threshold
    if (rule.conditionType === "health_sup_equals" || rule.conditionType === "health_superficial_exact") {
      if (stats.effectiveHealthSup !== val) return false;
    }
    if (rule.conditionType === "health_superficial" && stats.effectiveHealthSup < val) return false;

    // Health Total Damage
    if (rule.conditionType === "health_total_equals" || rule.conditionType === "health_total_exact") {
      if (stats.totalHealthDamage !== val) return false;
    }
    if (rule.conditionType === "health_total_gte" && stats.totalHealthDamage < val) return false;

    // Health Remaining
    if (rule.conditionType === "health_remaining_equals" && stats.healthRemaining !== val) return false;
    if (rule.conditionType === "health_remaining_lte" && stats.healthRemaining > val) return false;

    // Health Percent Below & States
    if (rule.conditionType === "health_percent_below" && stats.healthPercent > val) return false;
    if (rule.conditionType === "health_torpor" && !stats.isTorpor) return false;
    if (rule.conditionType === "health_impaired" && !stats.isHealthImpaired) return false;

    // Willpower Exact Value or Threshold
    if (rule.conditionType === "willpower_agg_equals" || rule.conditionType === "willpower_aggravated_exact") {
      if (stats.effectiveWpAgg !== val) return false;
    }
    if (rule.conditionType === "willpower_aggravated" && stats.effectiveWpAgg < val) return false;

    if (rule.conditionType === "willpower_sup_equals" || rule.conditionType === "willpower_superficial_exact") {
      if (stats.effectiveWpSup !== val) return false;
    }
    if (rule.conditionType === "willpower_superficial" && stats.effectiveWpSup < val) return false;

    if (rule.conditionType === "willpower_total_equals" || rule.conditionType === "willpower_total_exact") {
      if (stats.totalWpDamage !== val) return false;
    }
    if (rule.conditionType === "willpower_total_gte" && stats.totalWpDamage < val) return false;
    if (rule.conditionType === "willpower_impaired" && !stats.isWpImpaired) return false;

    // Hunger / Rage Value Exact or Threshold
    if (rule.conditionType === "hunger_equals" || rule.conditionType === "hunger_exact") {
      if (stats.hungerVal !== val) return false;
    }
    if (rule.conditionType === "hunger_gte" && stats.hungerVal < val) return false;

    // Frenzy State Condition Rules
    if (rule.conditionType === "frenzy_active" && !stats.isFrenzied) return false;
    if (rule.conditionType === "frenzy_inactive" && stats.isFrenzied) return false;
    if (rule.conditionType === "frenzy_equals" && (stats.isFrenzied ? 1 : 0) !== val) return false;
    if (rule.conditionType === "hunger_and_frenzy" && (!stats.isFrenzied || stats.hungerVal < val)) return false;

    // Combined Rule Checks
    if (rule.requireHungerGte && stats.hungerVal < Number(rule.requireHungerGte)) return false;
    if (rule.requireHealthAggGte && stats.effectiveHealthAgg < Number(rule.requireHealthAggGte)) return false;
    if (rule.requireFrenzy && !stats.isFrenzied) return false;

    return true;
  }
}
