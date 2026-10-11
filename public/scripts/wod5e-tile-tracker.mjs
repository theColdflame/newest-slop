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
        console.log(`WoD5e Tile Tracker | Updating Tile ${tileDoc.id} for Actor ${actor.name}:`, updates, matchedRule);
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
