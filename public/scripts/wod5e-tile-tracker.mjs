/**
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

    // Find all tiles in current active scene bound to this actor
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
   * Evaluates level mappings and rules against actor state and updates tile texture / appearance
   */
  static async evaluateTile(tileDoc, actorOverride = null) {
    const config = tileDoc.getFlag(this.MODULE_ID, "config");
    if (!config || !config.enabled) return;

    const actor = actorOverride || game.actors.get(config.actorId);
    if (!actor) return;

    // Compute WoD5e Actor Tracker Stats (5.3.28 Data Structure)
    const stats = this.extractWoD5eStats(actor);

    let targetSrc = null;
    let targetTint = null;
    let targetAlpha = null;
    let targetScale = null;
    let matchedRule = null;

    // 1. Check Specific Stat Level Mapping (e.g. Exact image set for each Hunger 0..5 or Health state)
    if (config.statMap?.enabled && config.statMap?.statType) {
      const levelImage = this.getStatLevelImage(config.statMap, stats);
      if (levelImage) {
        targetSrc = levelImage;
      }
    }

    // 2. Fall back to Priority Conditional Rules if no stat map image matched or stat map disabled
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

    // 3. Fallback to default / base tile image
    if (!targetSrc) {
      targetSrc = config.defaultImage || tileDoc.texture.src;
    }

    targetTint = targetTint || config.defaultTint || null;
    targetAlpha = targetAlpha ?? config.defaultAlpha ?? 1.0;
    targetScale = targetScale ?? config.defaultScale ?? 1.0;

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

    if (currentSrc !== targetSrc || currentTint !== targetTint || tileDoc.alpha !== targetAlpha || tileDoc.scaleX !== targetScale) {
      if (game.settings.get(this.MODULE_ID, "enableDebug")) {
        console.log(`WoD5e Tile Tracker | Updating Tile ${tileDoc.id} for Actor ${actor.name}:`, updates, { matchedRule, statMap: config.statMap });
      }
      await tileDoc.update(updates);
    }
  }

  /**
   * Retrieves specific image assigned to the actor's current level for the mapped stat
   */
  static getStatLevelImage(statMap, stats) {
    if (!statMap || !statMap.levels) return null;

    const statType = statMap.statType;
    let currentVal = 0;

    switch (statType) {
      case "hunger":
        currentVal = stats.hungerVal;
        break;
      case "health_agg":
        currentVal = stats.healthAgg;
        break;
      case "health_sup":
        currentVal = stats.healthSup;
        break;
      case "health_total":
        currentVal = stats.totalHealthDamage;
        break;
      case "health_remaining":
        currentVal = Math.max(0, stats.healthMax - stats.totalHealthDamage);
        break;
      case "willpower_agg":
        currentVal = stats.wpAgg;
        break;
      case "willpower_sup":
        currentVal = stats.wpSup;
        break;
      case "willpower_total":
        currentVal = stats.totalWpDamage;
        break;
      default:
        currentVal = 0;
    }

    // Return the image configured for this specific numeric level
    const img = statMap.levels[currentVal] || statMap.levels[String(currentVal)];
    return img && img.trim().length > 0 ? img.trim() : null;
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

    // Health Exact Value or Threshold
    if ((rule.conditionType === "health_agg_equals" || rule.conditionType === "health_aggravated_exact") && stats.healthAgg !== rule.value) return false;
    if (rule.conditionType === "health_aggravated" && stats.healthAgg < rule.value) return false;
    if ((rule.conditionType === "health_sup_equals" || rule.conditionType === "health_superficial_exact") && stats.healthSup !== rule.value) return false;
    if (rule.conditionType === "health_superficial" && stats.healthSup < rule.value) return false;
    if ((rule.conditionType === "health_total_equals" || rule.conditionType === "health_total_exact") && stats.totalHealthDamage !== rule.value) return false;
    if (rule.conditionType === "health_percent_below" && stats.healthPercent > rule.value) return false;
    if (rule.conditionType === "health_torpor" && !stats.isTorpor) return false;
    if (rule.conditionType === "health_impaired" && !stats.isHealthImpaired) return false;

    // Willpower Exact Value or Threshold
    if ((rule.conditionType === "willpower_agg_equals" || rule.conditionType === "willpower_aggravated_exact") && stats.wpAgg !== rule.value) return false;
    if (rule.conditionType === "willpower_aggravated" && stats.wpAgg < rule.value) return false;
    if ((rule.conditionType === "willpower_total_equals" || rule.conditionType === "willpower_total_exact") && stats.totalWpDamage !== rule.value) return false;
    if (rule.conditionType === "willpower_impaired" && !stats.isWpImpaired) return false;

    // Hunger / Rage Value Exact or Threshold
    if ((rule.conditionType === "hunger_equals" || rule.conditionType === "hunger_exact") && stats.hungerVal !== rule.value) return false;
    if (rule.conditionType === "hunger_gte" && stats.hungerVal < rule.value) return false;

    // Combined Rule Checks
    if (rule.requireHungerGte && stats.hungerVal < rule.requireHungerGte) return false;
    if (rule.requireHealthAggGte && stats.healthAgg < rule.requireHealthAggGte) return false;

    return true;
  }
}
