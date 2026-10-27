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
  { id: "willpower_sup", label: "Superficial Willpower Damage (0 to 10)", maxLevel: 10 },
  { id: "willpower_total", label: "Total Willpower Damage (0 to 10)", maxLevel: 10 }
];

function App() {
  const [activeTab, setActiveTab] = useState("simulator");
  const [actorName, setActorName] = useState("Julian the Toreador");
  const [hungerVal, setHungerVal] = useState(2);
  const [isFrenzied, setIsFrenzied] = useState(false);
  const [healthMax, setHealthMax] = useState(6);
  const [healthAgg, setHealthAgg] = useState(1);
  const [healthSup, setHealthSup] = useState(3);
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

  const setStatLevelImages = (newMap) => {
    setAllStatMaps(prev => ({ ...prev, [statMapType]: newMap }));
  };

  // Priority Rules State
  const [rules, setRules] = useState([
    { id: "1", name: "Frenzy Active Override", conditionType: "frenzy_active", value: 1, hideTile: false, image: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=600&auto=format&fit=crop&q=80", tint: "#991b1b", alpha: 1.0, enabled: true },
    { id: "2", name: "Torpor Condition - Hide Tile", conditionType: "health_torpor", value: 6, hideTile: true, image: "__NONE__", tint: "#581c87", alpha: 0.0, enabled: true },
    { id: "3", name: "Hunger 5 & Frenzy Combined", conditionType: "hunger_and_frenzy", value: 5, hideTile: false, image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80", tint: "#7f1d1d", alpha: 1.0, enabled: true }
  ]);

  // Robust Health Calculations matching WoD5e System 5.3.28 rules
  const effectiveHealthAgg = Math.min(healthMax, Math.max(0, healthAgg));
  const effectiveHealthSup = Math.min(Math.max(0, healthSup), Math.max(0, healthMax - effectiveHealthAgg));
  const totalHealthDamage = Math.min(healthMax, effectiveHealthAgg + effectiveHealthSup);
  const healthRemaining = Math.max(0, healthMax - totalHealthDamage);
  const isTorpor = effectiveHealthAgg >= healthMax;
  const isHealthImpaired = totalHealthDamage >= healthMax;
  const healthPercent = Math.max(0, Math.min(100, Math.round((healthRemaining / healthMax) * 100)));

  // Willpower Calculations
  const effectiveWpAgg = Math.min(wpMax, Math.max(0, wpAgg));
  const effectiveWpSup = Math.min(Math.max(0, wpSup), Math.max(0, wpMax - effectiveWpAgg));
  const totalWpDamage = Math.min(wpMax, effectiveWpAgg + effectiveWpSup);

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
      case "health_agg": currentVal = effectiveHealthAgg; break;
      case "health_sup": currentVal = effectiveHealthSup; break;
      case "health_total": currentVal = totalHealthDamage; break;
      case "health_remaining": currentVal = healthRemaining; break;
      case "willpower_agg": currentVal = effectiveWpAgg; break;
      case "willpower_sup": currentVal = effectiveWpSup; break;
      case "willpower_total": currentVal = totalWpDamage; break;
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
      healthMax, healthAgg, healthSup, effectiveHealthAgg, effectiveHealthSup,
      totalHealthDamage, healthRemaining, healthPercent,
      isHealthImpaired, isTorpor, wpMax, wpAgg, wpSup, effectiveWpAgg, effectiveWpSup, totalWpDamage,
      hungerVal, isFrenzied
    };

    for (const rule of rules) {
      if (!rule.enabled) continue;
      
      const val = Number(rule.value ?? 0);
      const cond = rule.conditionType;
      let matched = false;

      switch (cond) {
        case "frenzy_active": matched = isFrenzied; break;
        case "frenzy_inactive": matched = !isFrenzied; break;
        case "frenzy_equals": matched = (isFrenzied ? 1 : 0) === val; break;
        case "hunger_and_frenzy": matched = isFrenzied && hungerVal >= val; break;
        case "hunger_equals": case "hunger_exact": matched = hungerVal === val; break;
        case "hunger_gte": case "hunger": matched = hungerVal >= val; break;
        case "health_torpor": matched = isTorpor; break;
        case "health_impaired": matched = isHealthImpaired; break;
        case "health_agg_equals": case "health_aggravated_exact": matched = effectiveHealthAgg === val || healthAgg === val; break;
        case "health_aggravated": case "health_agg_gte": case "health_aggravated_gte": case "health_agg": matched = effectiveHealthAgg >= val || healthAgg >= val; break;
        case "health_sup_equals": case "health_superficial_exact": matched = effectiveHealthSup === val || healthSup === val; break;
        case "health_superficial": case "health_sup_gte": case "health_superficial_gte": case "health_sup": matched = effectiveHealthSup >= val || healthSup >= val; break;
        case "health_total_equals": case "health_total_exact": matched = totalHealthDamage === val; break;
        case "health_total_gte": case "health_total": matched = totalHealthDamage >= val; break;
        case "health_remaining_equals": matched = healthRemaining === val; break;
        case "health_remaining_lte": case "health_remaining": matched = healthRemaining <= val; break;
        case "health_percent_below": matched = healthPercent <= val; break;
        case "willpower_aggravated": case "willpower_agg_gte": case "willpower_agg": matched = effectiveWpAgg >= val || wpAgg >= val; break;
        case "willpower_agg_equals": case "willpower_aggravated_exact": matched = effectiveWpAgg === val || wpAgg === val; break;
        case "willpower_superficial": case "willpower_sup_gte": case "willpower_superficial_gte": case "willpower_sup": matched = effectiveWpSup >= val || wpSup >= val; break;
        case "willpower_sup_equals": case "willpower_superficial_exact": matched = effectiveWpSup === val || wpSup === val; break;
        case "willpower_total_equals": matched = totalWpDamage === val; break;
        case "willpower_total_gte": matched = totalWpDamage >= val; break;
        case "willpower_remaining_equals": matched = wpRemaining === val; break;
        case "willpower_remaining_lte": matched = wpRemaining <= val; break;
        case "willpower_impaired": matched = isWpImpaired; break;
        default: matched = false; break;
      }

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
  }, [statMapType, statLevelImages, hungerVal, isFrenzied, healthMax, healthAgg, healthSup, effectiveHealthAgg, effectiveHealthSup, totalHealthDamage, healthRemaining, wpMax, wpAgg, wpSup, rules, defaultImage]);

  const handleDownloadZip = async () => {
    setIsDownloading(true);
    try {
      const zip = new JSZip();

      const [modJson, langEn, modCss, modMjs, trackerMjs, configMjs, hudMjs] = await Promise.all([
        fetch('/module.json').then(r => r.text()),
        fetch('/lang/en.json').then(r => r.text()),
        fetch('/styles/module.css').then(r => r.text()),
        fetch('/scripts/module.mjs').then(r => r.text()),
        fetch('/scripts/wod5e-tile-tracker.mjs').then(r => r.text()),
        fetch('/scripts/tile-config-extension.mjs').then(r => r.text()),
        fetch('/scripts/tile-hud-extension.mjs').then(r => r.text())
      ]);

      zip.file("module.json", modJson);
      zip.file("README.md", `# World of Darkness 5e - Dynamic Tile Tracker\n\nFoundry VTT v14 & WoD5e 5.3.28 module.\n\n## Installation\n\n1. Download \`wod5e-dynamic-tile-tracker-v14.zip\`.\n2. Extract into your Foundry VTT user data directory under \`Data/modules/wod5e-dynamic-tile-tracker\`.\n3. Launch Foundry VTT, open your World of Darkness 5e world, and enable the module in **Manage Modules**.\n\n## Features\n\n- **Real-Time Canvas Tile Image Swapping**: Swaps visual tile textures, tints, scale, or transparency when a bound Actor's Health, Willpower, Hunger, Rage, or Frenzy state updates.\n- **WoD5e 5.3.28 Health Calculation**: Fully accounts for Aggravated (X) and Superficial (/) damage boxes, overflow rules, Torpor, and Impaired states.\n- **Level Map Grid & Conditional Priority Rules**: Assign unique file paths per level or create rule matrix overrides (e.g., Frenzy, Torpor, Hunger >= 5).\n- **Foundry VTT v14 FilePicker Integration**: Standard FilePicker button triggers for selecting tile assets directly from User Data (\`Data/\`), S3, or ForgeVTT storage.`);
      zip.file("lang/en.json", langEn);
      zip.file("styles/module.css", modCss);
      zip.file("scripts/module.mjs", modMjs);
      zip.file("scripts/wod5e-tile-tracker.mjs", trackerMjs);
      zip.file("scripts/tile-config-extension.mjs", configMjs);
      zip.file("scripts/tile-hud-extension.mjs", hudMjs);

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
      alert("Pattern must include '{level}' placeholder, e.g. assets/wod5e/{type}_{level}.webp");
      return;
    }
    const max = STAT_TYPES.find(s => s.id === statMapType)?.maxLevel || 5;
    const newMap = {};
    for (let i = 0; i <= max; i++) {
      newMap[String(i)] = autoFillPattern.replace(/\{level\}/g, i).replace(/\{type\}/g, statMapType);
    }
    setStatLevelImages(newMap);
  };

  const currentMaxLevel = STAT_TYPES.find(s => s.id === statMapType)?.maxLevel || 5;

  return html`
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans">
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
            <p className="text-xs text-slate-400">WoD5e System 5.3.28 Compatible • Real-Time Health (Agg + Sup), Willpower, Hunger & Frenzy Sync</p>
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
          <i className="fas fa-play text-red-500"></i>
          <span>Live Interactive Sandbox</span>
        </button>

        <button
          onClick=${() => setActiveTab("config")}
          className=${`px-4 py-3 border-b-2 flex items-center space-x-2 transition whitespace-nowrap ${
            activeTab === "config"
              ? "border-red-500 text-red-400 font-bold bg-slate-800/50"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <i className="fas fa-sliders text-teal-400"></i>
          <span>Tile Config Tab Preview</span>
        </button>
      </nav>

      <!-- Main Content Area -->
      <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto space-y-6">
        ${activeTab === "simulator" && html`
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            <!-- Left Column: Bound Actor Tracker Sheet -->
            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                    <i className="fas fa-user-shield"></i>
                  </div>
                  <div>
                    <input
                      type="text"
                      value=${actorName}
                      onChange=${(e) => setActorName(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-sm font-bold text-slate-100 focus:outline-none focus:border-red-500"
                    />
                    <div className="text-[11px] text-slate-400">Vampire • Toreador (WoD5e 5.3.28 Schema)</div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick=${() => setIsFrenzied(!isFrenzied)}
                    className=${`px-3 py-1.5 rounded-lg text-xs font-bold border transition flex items-center space-x-1.5 ${
                      isFrenzied
                        ? "bg-red-900/80 border-red-500 text-white animate-pulse shadow-lg shadow-red-950/80"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <i className="fas fa-fire"></i>
                    <span>${isFrenzied ? "FRENZIED" : "Calm"}</span>
                  </button>
                </div>
              </div>

              <!-- Health Tracker (Aggravated X, Superficial /, Empty .) -->
              <div className="space-y-3 bg-slate-950/80 p-4 rounded-lg border border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-red-400 flex items-center space-x-2">
                    <i className="fas fa-heart-pulse"></i>
                    <span>Health Tracker (Aggravated & Superficial)</span>
                  </label>
                  <span className="text-xs font-mono text-slate-400">
                    ${healthRemaining} / ${healthMax} HP Left
                  </span>
                </div>

                <!-- Box Tracker Render -->
                <div className="flex items-center gap-1.5 py-2">
                  ${Array.from({ length: healthMax }).map((_, idx) => {
                    const isAgg = idx < effectiveHealthAgg;
                    const isSup = idx >= effectiveHealthAgg && idx < effectiveHealthAgg + effectiveHealthSup;
                    return html`
                      <div
                        key=${idx}
                        className=${`w-8 h-9 rounded border flex items-center justify-center font-bold text-sm shadow transition-all ${
                          isAgg
                            ? "bg-red-800 border-red-500 text-white shadow-red-950"
                            : isSup
                            ? "bg-amber-700 border-amber-500 text-white shadow-amber-950"
                            : "bg-slate-900 border-slate-700 text-slate-600"
                        }`}
                      >
                        ${isAgg ? "X" : isSup ? "/" : ""}
                      </div>
                    `;
                  })}
                </div>

                <!-- Health Sliders -->
                <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
                  <div>
                    <span className="text-red-400 font-semibold">Aggravated Damage: ${healthAgg}</span>
                    <input
                      type="range"
                      min="0"
                      max=${healthMax}
                      value=${healthAgg}
                      onChange=${(e) => setHealthAgg(Number(e.target.value))}
                      className="w-full accent-red-600 mt-1"
                    />
                  </div>

                  <div>
                    <span className="text-amber-400 font-semibold">Superficial Damage: ${healthSup}</span>
                    <input
                      type="range"
                      min="0"
                      max=${healthMax}
                      value=${healthSup}
                      onChange=${(e) => setHealthSup(Number(e.target.value))}
                      className="w-full accent-amber-500 mt-1"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-1 text-slate-400 border-t border-slate-900">
                  <span>State: ${isTorpor ? "TORPOR (Incapacitated)" : isHealthImpaired ? "IMPAIRED" : "Healthy"}</span>
                  <span>Effective Sup: ${effectiveHealthSup} | Agg: ${effectiveHealthAgg}</span>
                </div>
              </div>

              <!-- Willpower Tracker -->
              <div className="space-y-3 bg-slate-950/80 p-4 rounded-lg border border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-purple-400 flex items-center space-x-2">
                    <i className="fas fa-brain"></i>
                    <span>Willpower Tracker</span>
                  </label>
                  <span className="text-xs font-mono text-slate-400">${totalWpDamage} / ${wpMax} Damage</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-purple-400 font-semibold">Aggravated WP: ${wpAgg}</span>
                    <input
                      type="range"
                      min="0"
                      max=${wpMax}
                      value=${wpAgg}
                      onChange=${(e) => setWpAgg(Number(e.target.value))}
                      className="w-full accent-purple-600 mt-1"
                    />
                  </div>
                  <div>
                    <span className="text-indigo-400 font-semibold">Superficial WP: ${wpSup}</span>
                    <input
                      type="range"
                      min="0"
                      max=${wpMax}
                      value=${wpSup}
                      onChange=${(e) => setWpSup(Number(e.target.value))}
                      className="w-full accent-indigo-500 mt-1"
                    />
                  </div>
                </div>
              </div>

              <!-- Hunger Trackers (0 to 5) -->
              <div className="space-y-3 bg-slate-950/80 p-4 rounded-lg border border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-red-500 flex items-center space-x-2">
                    <i className="fas fa-wine-glass"></i>
                    <span>Hunger Tracker (0 to 5)</span>
                  </label>
                  <span className="text-xs font-mono font-bold text-red-400">Level ${hungerVal} / 5</span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  {[0, 1, 2, 3, 4, 5].map((level) => (
                    <button
                      key=${level}
                      onClick=${() => setHungerVal(level)}
                      className=${`flex-1 py-2 rounded font-bold text-xs transition border ${
                        hungerVal === level
                          ? "bg-red-700 border-red-500 text-white shadow-lg shadow-red-950"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      ${level}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <!-- Right Column: Simulated VTT Canvas & Real-time Tile View -->
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col justify-between space-y-6">
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                  <h2 className="font-serif font-bold text-sm text-slate-200 flex items-center space-x-2">
                    <i className="fas fa-vector-square text-red-500"></i>
                    <span>Simulated Foundry VTT Canvas Tile</span>
                  </h2>

                  <div className="text-xs text-slate-400 flex items-center space-x-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Real-Time Tile Engine Reactive</span>
                  </div>
                </div>

                <!-- Tile Display Box -->
                <div className="relative w-full h-80 rounded-xl border border-slate-800 bg-slate-950 overflow-hidden flex items-center justify-center shadow-inner group">
                  ${tileEvaluation.hiddenTile
                    ? html`
                        <div className="text-center p-6 space-y-3">
                          <div className="w-16 h-16 mx-auto rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600">
                            <i className="fas fa-eye-slash text-2xl"></i>
                          </div>
                          <div className="text-sm font-bold text-red-400">Tile Hidden (__NONE__)</div>
                          <p className="text-xs text-slate-500 max-w-xs">
                            This tile's visual texture is hidden because the matching rule or level map set <code>__NONE__</code>.
                          </p>
                        </div>
                      `
                    : html`
                        <img
                          src=${tileEvaluation.image}
                          alt="Dynamic Tile Texture"
                          className="w-full h-full object-cover transition-all duration-300"
                          style=${{
                            tint: tileEvaluation.tint,
                            opacity: tileEvaluation.alpha
                          }}
                        />
                      `}

                  <!-- Overlay Debug Info Badge -->
                  <div className="absolute bottom-3 left-3 right-3 bg-slate-950/90 backdrop-blur border border-slate-800 p-3 rounded-lg text-xs flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-500">Active Rule / Map Triggered</div>
                      <div className="font-semibold text-slate-200">${tileEvaluation.matchedName}</div>
                    </div>
                    <div className="text-right font-mono text-[11px] text-teal-400">
                      <div>Stat: ${statMapType}</div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Quick Control Switcher for Level Mapping -->
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg space-y-3 text-xs">
                <div className="font-bold text-slate-300 flex items-center space-x-2">
                  <i className="fas fa-sliders text-teal-400"></i>
                  <span>Tracked Stat Selection for Canvas Tile</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  ${STAT_TYPES.map(st => html`
                    <button
                      key=${st.id}
                      onClick=${() => setStatMapType(st.id)}
                      className=${`p-2 rounded border text-left transition ${
                        statMapType === st.id
                          ? "bg-teal-950 border-teal-500 text-teal-200 font-bold"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      ${st.label}
                    </button>
                  `)}
                </div>
              </div>
            </div>
          </div>
        `}

        ${activeTab === "config" && html`
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
            <h2 className="font-serif font-bold text-base text-slate-200 flex items-center space-x-2 border-b border-slate-800 pb-3">
              <i className="fas fa-droplet text-red-500"></i>
              <span>Tile Configuration Tab UI Preview</span>
            </h2>

            <!-- Auto Fill Helper -->
            <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg space-y-3">
              <div className="text-xs font-bold text-slate-300">User Data Directory Path Pattern Auto-Filler</div>
              <div className="flex gap-3">
                <input
                  type="text"
                  value=${autoFillPattern}
                  onChange=${(e) => setAutoFillPattern(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200"
                  placeholder="assets/wod5e/{type}_{level}.webp"
                />
                <button
                  onClick=${handleAutoFillPattern}
                  className="px-4 py-1.5 bg-teal-700 hover:bg-teal-600 text-white font-bold text-xs rounded transition flex items-center space-x-1"
                >
                  <i className="fas fa-wand-magic-sparkles"></i>
                  <span>Fill Levels</span>
                </button>
              </div>
            </div>

            <!-- Level Mapping Inputs -->
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-300">Level Map Rows for ${statMapType}</div>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                ${Array.from({ length: currentMaxLevel + 1 }).map((_, i) => {
                  const val = statLevelImages[String(i)] || "";
                  return html`
                    <div key=${i} className="flex items-center gap-2 bg-slate-950 p-2 rounded border border-slate-800 text-xs">
                      <span className="w-32 font-bold text-slate-400">Level ${i}</span>
                      <input
                        type="text"
                        value=${val}
                        onChange=${(e) => {
                          const newM = { ...statLevelImages, [String(i)]: e.target.value };
                          setStatLevelImages(newM);
                        }}
                        placeholder="assets/wod5e/${statMapType}_${i}.webp or __NONE__ to hide"
                        className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
                      />
                      <button
                        onClick=${() => {
                          const newM = { ...statLevelImages, [String(i)]: "__NONE__" };
                          setStatLevelImages(newM);
                        }}
                        className="px-2 py-1 bg-red-950 text-red-400 border border-red-800 rounded font-bold hover:bg-red-900 transition"
                      >
                        Hide
                      </button>
                    </div>
                  `;
                })}
              </div>
            </div>
          </div>
        `}
      </main>
    </div>
  `;
}

createRoot(document.getElementById("root")).render(html`<${App} />`);
