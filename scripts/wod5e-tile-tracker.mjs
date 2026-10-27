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

    const scene = canvas?.scene;
    if (!scene) return;

    const actorId = actor.id;
    const actorUuid = actor.uuid;
    const tokenUuid = actor.token?.uuid;
    const parentTokenUuid = actor.parent?.documentName === "Token" ? actor.parent.uuid : null;
    const protoActorId = actor.prototypeToken?.actor?.id || actor.prototypeToken?.id;

    // Find all tiles in active scene bound to this actor (by ID or UUID)
    const boundTiles = scene.tiles.filter(t => {
      const config = t.getFlag(this.MODULE_ID, "config");
      if (!config || !config.enabled) return false;
      const targetId = (config.actorId || "").trim();
      if (!targetId) return false;

      return (
        targetId === actorId ||
        targetId === actorUuid ||
        (tokenUuid && targetId === tokenUuid) ||
        (parentTokenUuid && targetId === parentTokenUuid) ||
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
    let config = tileDoc.getFlag(this.MODULE_ID, "config");
    if (!config || !config.enabled) return;

    // Ensure statMap & rules are parsed if stored as JSON strings
    if (typeof config.statMapJson === "string" && !config.statMap) {
      try { config.statMap = JSON.parse(config.statMapJson); } catch (e) {}
    }
    if (typeof config.rulesJson === "string" && (!config.rules || !config.rules.length)) {
      try { config.rules = JSON.parse(config.rulesJson); } catch (e) {}
    }

    // Resolve bound actor by ID or UUID
    let actor = actorOverride;
    if (!actor && config.actorId) {
      const targetId = (config.actorId || "").trim();
      if (typeof fromUuidSync === "function") {
        try {
          const resolved = fromUuidSync(targetId);
          if (resolved) {
            actor = resolved.documentName === "Token" ? resolved.actor : (resolved.actor || resolved);
          }
        } catch (e) {
          actor = null;
        }
      }
      if (!actor && typeof game !== "undefined" && game.actors) {
        actor = game.actors.get(targetId);
      }
      if (!actor && typeof canvas !== "undefined" && canvas.tokens) {
        const token = canvas.tokens.placeables.find(t => 
          t.actor?.id === targetId || 
          t.actor?.uuid === targetId || 
          t.id === targetId ||
          t.document?.uuid === targetId
        );
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
      case "health_aggravated":
        currentVal = stats.effectiveHealthAgg !== undefined ? stats.effectiveHealthAgg : stats.healthAgg;
        break;
      case "health_sup":
      case "health_superficial":
        currentVal = stats.effectiveHealthSup !== undefined ? stats.effectiveHealthSup : stats.healthSup;
        break;
      case "health_total":
        currentVal = stats.totalHealthDamage;
        break;
      case "health_remaining":
        currentVal = stats.healthRemaining;
        break;
      case "willpower_agg":
      case "willpower_aggravated":
        currentVal = stats.effectiveWpAgg !== undefined ? stats.effectiveWpAgg : stats.wpAgg;
        break;
      case "willpower_sup":
      case "willpower_superficial":
        currentVal = stats.effectiveWpSup !== undefined ? stats.effectiveWpSup : stats.wpSup;
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
   * Correctly accounting for combined Superficial and Aggravated damage boxes & V5 overflow rules.
   */
  static extractWoD5eStats(actor) {
    if (!actor) return this._defaultStats();

    const sys = actor.system || actor._source?.system || {};

    // Helper to extract clean integer values from primitive or nested object definitions
    // MUST NOT fall back to max capacity when value is undefined
    const getVal = (v) => {
      if (v === null || v === undefined) return null;
      if (typeof v === "number") return isNaN(v) ? 0 : v;
      if (typeof v === "boolean") return v ? 1 : 0;
      if (typeof v === "string") {
        const parsed = parseInt(v, 10);
        return isNaN(parsed) ? 0 : parsed;
      }
      if (typeof v === "object") {
        if (v.value !== undefined && v.value !== null) {
          const res = getVal(v.value);
          if (res !== null) return res;
        }
        if (v.current !== undefined && v.current !== null) {
          const res = getVal(v.current);
          if (res !== null) return res;
        }
        if (v.damage !== undefined && v.damage !== null) {
          const res = getVal(v.damage);
          if (res !== null) return res;
        }
        if (v.amount !== undefined && v.amount !== null) {
          const res = getVal(v.amount);
          if (res !== null) return res;
        }
        if (v.superficial !== undefined && v.superficial !== null) {
          const res = getVal(v.superficial);
          if (res !== null) return res;
        }
        if (v.aggravated !== undefined && v.aggravated !== null) {
          const res = getVal(v.aggravated);
          if (res !== null) return res;
        }
      }
      return null;
    };

    const findFirstNumber = (...candidates) => {
      for (const c of candidates) {
        const res = getVal(c);
        if (res !== null && !isNaN(res)) return res;
      }
      return 0;
    };

    // 1. Health Tracker (WoD5e System 5.3.28: system.health or system.attributes.health or system.hp)
    const health = sys.health || sys.attributes?.health || sys.hp || sys.trackers?.health || {};

    const healthMax = Math.max(1, findFirstNumber(
      health.max,
      health.maxHealth,
      health.value,
      6
    ));

    const rawAgg = findFirstNumber(
      health.aggravated,
      health.agg,
      health.aggravatedDamage,
      health.aggravated_damage,
      health.damage?.aggravated,
      health.damage?.agg,
      sys.health_aggravated,
      sys.aggravated
    );

    const rawSup = findFirstNumber(
      health.superficial,
      health.sup,
      health.superficialDamage,
      health.superficial_damage,
      health.damage?.superficial,
      health.damage?.sup,
      sys.health_superficial,
      sys.superficial
    );

    let effectiveHealthAgg = Math.max(0, rawAgg);
    let effectiveHealthSup = Math.max(0, rawSup);

    // WoD5e V5 Overflow Rule: When superficial + aggravated > max health,
    // excess superficial converts to aggravated damage box-for-box
    if (effectiveHealthAgg + effectiveHealthSup > healthMax) {
      const overflow = (effectiveHealthAgg + effectiveHealthSup) - healthMax;
      effectiveHealthAgg = Math.min(healthMax, effectiveHealthAgg + overflow);
      effectiveHealthSup = Math.max(0, healthMax - effectiveHealthAgg);
    } else {
      effectiveHealthAgg = Math.min(healthMax, effectiveHealthAgg);
      effectiveHealthSup = Math.min(effectiveHealthSup, Math.max(0, healthMax - effectiveHealthAgg));
    }

    const totalHealthDamage = Math.min(healthMax, effectiveHealthAgg + effectiveHealthSup);
    const healthRemaining = Math.max(0, healthMax - totalHealthDamage);
    const healthPercent = Math.max(0, Math.min(100, Math.round((healthRemaining / healthMax) * 100)));

    const isTorpor = effectiveHealthAgg >= healthMax;
    const isHealthImpaired = totalHealthDamage >= healthMax;

    // 2. Willpower Tracker
    const willpower = sys.willpower || sys.attributes?.willpower || sys.wp || sys.trackers?.willpower || {};
    const wpMax = Math.max(1, findFirstNumber(
      willpower.max,
      willpower.maxWillpower,
      willpower.value,
      6
    ));

    const rawWpAgg = findFirstNumber(
      willpower.aggravated,
      willpower.agg,
      willpower.aggravatedDamage,
      willpower.aggravated_damage,
      willpower.damage?.aggravated,
      sys.willpower_aggravated
    );

    const rawWpSup = findFirstNumber(
      willpower.superficial,
      willpower.sup,
      willpower.superficialDamage,
      willpower.superficial_damage,
      willpower.damage?.superficial,
      sys.willpower_superficial
    );

    let effectiveWpAgg = Math.max(0, rawWpAgg);
    let effectiveWpSup = Math.max(0, rawWpSup);

    if (effectiveWpAgg + effectiveWpSup > wpMax) {
      const wpOverflow = (effectiveWpAgg + effectiveWpSup) - wpMax;
      effectiveWpAgg = Math.min(wpMax, effectiveWpAgg + wpOverflow);
      effectiveWpSup = Math.max(0, wpMax - effectiveWpAgg);
    } else {
      effectiveWpAgg = Math.min(wpMax, effectiveWpAgg);
      effectiveWpSup = Math.min(effectiveWpSup, Math.max(0, wpMax - effectiveWpAgg));
    }

    const totalWpDamage = Math.min(wpMax, effectiveWpAgg + effectiveWpSup);
    const wpRemaining = Math.max(0, wpMax - totalWpDamage);
    const isWpImpaired = totalWpDamage >= wpMax;

    // 3. Hunger / Rage / Desperation (0..5)
    const rawHunger = findFirstNumber(
      sys.hunger?.value,
      sys.hunger,
      sys.rage?.value,
      sys.rage,
      sys.desperation?.value,
      sys.desperation
    );
    const hungerVal = Math.max(0, Math.min(5, rawHunger));

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
      healthAgg: rawAgg,
      healthSup: rawSup,
      effectiveHealthAgg,
      effectiveHealthSup,
      totalHealthDamage,
      healthRemaining,
      healthPercent,
      isHealthImpaired,
      isTorpor,
      wpMax,
      wpAgg: rawWpAgg,
      wpSup: rawWpSup,
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

  static _defaultStats() {
    return {
      healthMax: 6,
      healthAgg: 0,
      healthSup: 0,
      effectiveHealthAgg: 0,
      effectiveHealthSup: 0,
      totalHealthDamage: 0,
      healthRemaining: 6,
      healthPercent: 100,
      isHealthImpaired: false,
      isTorpor: false,
      wpMax: 6,
      wpAgg: 0,
      wpSup: 0,
      effectiveWpAgg: 0,
      effectiveWpSup: 0,
      totalWpDamage: 0,
      wpRemaining: 6,
      isWpImpaired: false,
      hungerVal: 0,
      isFrenzied: false,
      frenzyVal: 0
    };
  }

  /**
   * Rule Condition Evaluator
   */
  static checkRuleMatch(rule, stats) {
    if (!rule || !rule.enabled) return false;

    const val = Number(rule.value ?? 0);
    const cond = rule.conditionType;

    // Health Aggravated Exact or Threshold
    if (cond === "health_agg_equals" || cond === "health_aggravated_exact") {
      if (stats.effectiveHealthAgg !== val && stats.healthAgg !== val) return false;
    }
    if (cond === "health_aggravated" || cond === "health_agg_gte" || cond === "health_aggravated_gte") {
      if (stats.effectiveHealthAgg < val && stats.healthAgg < val) return false;
    }

    // Health Superficial Exact or Threshold
    if (cond === "health_sup_equals" || cond === "health_superficial_exact") {
      if (stats.effectiveHealthSup !== val && stats.healthSup !== val) return false;
    }
    if (cond === "health_superficial" || cond === "health_sup_gte" || cond === "health_superficial_gte") {
      if (stats.effectiveHealthSup < val && stats.healthSup < val) return false;
    }

    // Health Total Damage
    if (cond === "health_total_equals" || cond === "health_total_exact") {
      if (stats.totalHealthDamage !== val) return false;
    }
    if (cond === "health_total_gte" || cond === "health_total") {
      if (stats.totalHealthDamage < val) return false;
    }

    // Health Remaining
    if (cond === "health_remaining_equals" && stats.healthRemaining !== val) return false;
    if ((cond === "health_remaining_lte" || cond === "health_remaining") && stats.healthRemaining > val) return false;

    // Health Percent Below & States
    if (cond === "health_percent_below" && stats.healthPercent > val) return false;
    if (cond === "health_torpor" && !stats.isTorpor) return false;
    if (cond === "health_impaired" && !stats.isHealthImpaired) return false;

    // Willpower Exact Value or Threshold
    if (cond === "willpower_agg_equals" || cond === "willpower_aggravated_exact") {
      if (stats.effectiveWpAgg !== val && stats.wpAgg !== val) return false;
    }
    if (cond === "willpower_aggravated" || cond === "willpower_agg_gte") {
      if (stats.effectiveWpAgg < val && stats.wpAgg < val) return false;
    }

    if (cond === "willpower_sup_equals" || cond === "willpower_superficial_exact") {
      if (stats.effectiveWpSup !== val && stats.wpSup !== val) return false;
    }
    if (cond === "willpower_superficial" || cond === "willpower_sup_gte") {
      if (stats.effectiveWpSup < val && stats.wpSup < val) return false;
    }

    if (cond === "willpower_total_equals" || cond === "willpower_total_exact") {
      if (stats.totalWpDamage !== val) return false;
    }
    if (cond === "willpower_total_gte" || cond === "willpower_total") {
      if (stats.totalWpDamage < val) return false;
    }
    if (cond === "willpower_impaired" && !stats.isWpImpaired) return false;

    // Hunger / Rage Value Exact or Threshold
    if (cond === "hunger_equals" || cond === "hunger_exact") {
      if (stats.hungerVal !== val) return false;
    }
    if (cond === "hunger_gte" || cond === "hunger") {
      if (stats.hungerVal < val) return false;
    }

    // Frenzy State Condition Rules
    if (cond === "frenzy_active" && !stats.isFrenzied) return false;
    if (cond === "frenzy_inactive" && stats.isFrenzied) return false;
    if (cond === "frenzy_equals" && (stats.isFrenzied ? 1 : 0) !== val) return false;
    if (cond === "hunger_and_frenzy" && (!stats.isFrenzied || stats.hungerVal < val)) return false;

    // Combined Rule Checks
    if (rule.requireHungerGte && stats.hungerVal < Number(rule.requireHungerGte)) return false;
    if (rule.requireHealthAggGte && stats.effectiveHealthAgg < Number(rule.requireHealthAggGte)) return false;
    if (rule.requireFrenzy && !stats.isFrenzied) return false;

    return true;
  }
}
