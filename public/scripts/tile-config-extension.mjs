/**
 * Injects WoD5e Dynamic Tile Tracker Settings Tab into Foundry VTT v14 Tile Config Sheet
 * Allows setting specific images per level of a stat (Hunger 0..5, Frenzy, Health Damage, Willpower)
 * with FilePicker 'Browse File' buttons and support for hiding tiles completely (__NONE__).
 */

export class WoD5eTileConfigExtension {
  static attachTab(app, html, data) {
    try {
      // Resolve root HTMLElement
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
        defaultHide: false,
        statMap: {
          enabled: true,
          statType: "hunger",
          levels: { "0": "", "1": "", "2": "", "3": "", "4": "", "5": "" }
        },
        rules: []
      };

      if (!config.statMap) {
        config.statMap = {
          enabled: true,
          statType: "hunger",
          levels: { "0": "", "1": "", "2": "", "3": "", "4": "", "5": "" }
        };
      }

      // Locate navigation bar
      const navEl = rootEl.querySelector('nav.sheet-tabs') ||
                    rootEl.querySelector('nav.tabs') ||
                    rootEl.querySelector('nav[data-group="primary"]') ||
                    rootEl.querySelector('nav[data-group]') ||
                    rootEl.querySelector('nav');

      if (!navEl) {
        console.warn("WoD5e Tile Tracker | Could not find navigation bar in TileConfig sheet.");
        return;
      }

      // Locate content body
      const bodyEl = rootEl.querySelector('section.sheet-body') ||
                     rootEl.querySelector('.sheet-body') ||
                     rootEl.querySelector('section.content') ||
                     rootEl.querySelector('form') ||
                     rootEl;

      // Create Tab Navigation Button
      const tabNavBtn = document.createElement('a');
      tabNavBtn.className = 'item wod5e-tracker-tab-btn';
      tabNavBtn.setAttribute('data-tab', 'wod5e-tracker');
      tabNavBtn.setAttribute('data-group', 'primary');
      tabNavBtn.innerHTML = `<i class="fas fa-droplet" style="color: #e53e3e; margin-right: 5px;"></i> WoD5e Tracker`;
      navEl.appendChild(tabNavBtn);

      // Create Tab Content Panel
      const tabContent = document.createElement('div');
      tabContent.className = 'tab wod5e-tracker-tab-content';
      tabContent.setAttribute('data-tab', 'wod5e-tracker');
      tabContent.setAttribute('data-group', 'primary');
      tabContent.style.padding = '10px 4px';

      // Options for Actors dropdown
      const actorOptions = (game.actors || [])
        .map(a => `<option value="${a.id}" ${a.id === config.actorId ? "selected" : ""}>${a.name} (${a.type || "Actor"})</option>`)
        .join('');

      const defaultImgVal = config.defaultImage || tileDoc.texture?.src || "";

      tabContent.innerHTML = `
        <div class="wod5e-tracker-config-wrapper" style="display: flex; flex-direction: column; gap: 14px;">
          
          <!-- Toggle & Actor Selection -->
          <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 10px;">
            <div class="form-group" style="margin-bottom: 8px;">
              <label style="font-weight: bold; color: #ff6b6b;"><i class="fas fa-power-off"></i> Enable Dynamic Updates</label>
              <div class="form-fields">
                <input type="checkbox" name="flags.wod5e-dynamic-tile-tracker.config.enabled" ${config.enabled ? "checked" : ""}/>
              </div>
            </div>

            <div class="form-group" style="margin-bottom: 8px;">
              <label style="font-weight: bold;"><i class="fas fa-user-shield"></i> Bound WoD5e Actor</label>
              <div class="form-fields">
                <select name="flags.wod5e-dynamic-tile-tracker.config.actorId" style="width: 100%;">
                  <option value="">-- Select Scene or World Actor --</option>
                  ${actorOptions}
                </select>
              </div>
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <label style="font-weight: bold;"><i class="fas fa-image"></i> Default / Fallback Texture</label>
              <div class="form-fields" style="display: flex; gap: 6px; align-items: center;">
                <input type="text" id="wod5e-default-img-input" name="flags.wod5e-dynamic-tile-tracker.config.defaultImage" value="${this._escapeHtml(defaultImgVal)}" placeholder="tiles/normal.png or __NONE__ to hide" style="flex: 1;"/>
                <button type="button" id="wod5e-default-img-browse" class="button wod5e-browse-btn" style="white-space: nowrap; padding: 2px 8px; height: 28px; display: flex; align-items: center; gap: 4px;" title="Browse Image File">
                  <i class="fas fa-folder-open"></i> Browse
                </button>
                <label style="font-size: 0.8em; white-space: nowrap; display: flex; align-items: center; gap: 4px; color: #ff8080;" title="Hide tile completely if no rule or map matches">
                  <input type="checkbox" name="flags.wod5e-dynamic-tile-tracker.config.defaultHide" ${config.defaultHide ? "checked" : ""}/> Hide Tile
                </label>
              </div>
            </div>
          </div>

          <!-- SECTION 1: STAT LEVEL MAPPING GRID -->
          <div style="background: rgba(0,0,0,0.3); border: 1px solid #7a7971; border-radius: 6px; padding: 12px;">
            <h3 style="margin-top: 0; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 4px; font-size: 1.1em; color: #4ecdc4; display: flex; align-items: center; justify-content: space-between;">
              <span><i class="fas fa-layer-group"></i> Specific Images per Stat Level (Level Map)</span>
              <label style="font-size: 0.85em; cursor: pointer; color: #fff;">
                <input type="checkbox" id="wod5e-statmap-enable" ${config.statMap?.enabled ? "checked" : ""}/> Enable Level Mapping
              </label>
            </h3>
            <p class="notes" style="margin-bottom: 10px; font-size: 0.85em; opacity: 0.85;">
              Assign a distinct image file for each level (or <code>__NONE__</code> / Hide Tile to display no visual tile at all).
            </p>

            <div class="form-group" style="margin-bottom: 10px;">
              <label style="font-weight: bold;">Tracked Stat Type</label>
              <div class="form-fields">
                <select id="wod5e-statmap-type" style="width: 100%;">
                  <option value="hunger" ${config.statMap?.statType === "hunger" ? "selected" : ""}>Hunger / Rage / Desperation (0 to 5)</option>
                  <option value="frenzy" ${config.statMap?.statType === "frenzy" ? "selected" : ""}>Frenzy State (0 = Calm, 1 = Frenzied)</option>
                  <option value="health_agg" ${config.statMap?.statType === "health_agg" ? "selected" : ""}>Aggravated Health Damage (0 to 10)</option>
                  <option value="health_sup" ${config.statMap?.statType === "health_sup" ? "selected" : ""}>Superficial Health Damage (0 to 10)</option>
                  <option value="health_total" ${config.statMap?.statType === "health_total" ? "selected" : ""}>Total Health Damage (0 to 10)</option>
                  <option value="health_remaining" ${config.statMap?.statType === "health_remaining" ? "selected" : ""}>Remaining Health Points (0 to 10)</option>
                  <option value="willpower_agg" ${config.statMap?.statType === "willpower_agg" ? "selected" : ""}>Aggravated Willpower Damage (0 to 10)</option>
                  <option value="willpower_total" ${config.statMap?.statType === "willpower_total" ? "selected" : ""}>Total Willpower Damage (0 to 10)</option>
                </select>
              </div>
            </div>

            <!-- Auto-fill pattern helper -->
            <div style="display: flex; gap: 6px; margin-bottom: 10px; align-items: center; background: rgba(0,0,0,0.2); padding: 6px; border-radius: 4px;">
              <input type="text" id="wod5e-autofill-pattern" placeholder="e.g. tiles/hunger_{level}.webp" style="flex: 1; font-size: 0.85em;" title="Use {level} placeholder to auto fill image paths for levels 0 to N"/>
              <button type="button" id="wod5e-autofill-btn" class="button" style="padding: 2px 10px; font-size: 0.85em; white-space: nowrap;">
                <i class="fas fa-wand-magic-sparkles"></i> Auto-fill Levels
              </button>
            </div>

            <!-- Level inputs container -->
            <div id="wod5e-statmap-levels-grid" style="display: flex; flex-direction: column; gap: 6px; max-height: 280px; overflow-y: auto; padding-right: 4px;">
              <!-- Dynamic rows rendered by JS -->
            </div>
          </div>

          <!-- SECTION 2: PRIORITY CONDITIONAL RULES -->
          <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 12px;">
            <h3 style="margin-top: 0; margin-bottom: 8px; border-bottom: 1px solid #7a7971; padding-bottom: 4px; font-size: 1.1em; display: flex; justify-content: space-between; align-items: center;">
              <span><i class="fas fa-list-check"></i> Conditional Priority Rules (Fallback / Overrides)</span>
              <button type="button" id="wod5e-add-rule-btn" class="button" style="padding: 2px 8px; font-size: 0.85em; width: auto;">
                <i class="fas fa-plus"></i> Add Rule
              </button>
            </h3>
            <p class="notes" style="margin-bottom: 10px; font-size: 0.85em;">Evaluated if no Level Map image matches. First matching rule wins. Toggle <strong>Hide Tile</strong> to render no visual tile when matched.</p>
            
            <div id="wod5e-rules-container" style="display: flex; flex-direction: column; gap: 8px;">
              <!-- Rules injected dynamically -->
            </div>
          </div>

          <!-- Hidden JSON storage inputs for submission -->
          <input type="hidden" id="wod5e-statmap-json-input" name="flags.wod5e-dynamic-tile-tracker.config.statMapJson" value="${this._escapeHtml(JSON.stringify(config.statMap || {}))}"/>
          <input type="hidden" id="wod5e-rules-json-input" name="flags.wod5e-dynamic-tile-tracker.config.rulesJson" value="${this._escapeHtml(JSON.stringify(config.rules || []))}"/>
        </div>
      `;

      bodyEl.appendChild(tabContent);

      // Bind Default Image Browse File button
      const defaultImgInput = tabContent.querySelector('#wod5e-default-img-input');
      const defaultImgBrowseBtn = tabContent.querySelector('#wod5e-default-img-browse');
      this.bindFilePicker(defaultImgBrowseBtn, defaultImgInput);

      // Bind Tab Switching Behavior
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

      allTabBtns.forEach(btn => {
        if (btn !== tabNavBtn) {
          btn.addEventListener('click', () => {
            tabNavBtn.classList.remove('active');
            tabContent.classList.remove('active');
            tabContent.style.display = 'none';
          });
        }
      });

      // Render Level Map Rows & Rule Logic
      this._setupStatMapGrid(tabContent, config.statMap || {});
      this._setupRulesEngine(tabContent, config.rules || []);

    } catch (err) {
      console.error("WoD5e Dynamic Tile Tracker | Exception attaching configuration tab:", err);
    }
  }

  static bindFilePicker(buttonEl, inputEl) {
    if (!buttonEl || !inputEl) return;
    buttonEl.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      const currentPath = inputEl.value || "";

      if (typeof FilePicker !== "undefined") {
        const fp = new FilePicker({
          type: "image",
          current: currentPath,
          callback: (path) => {
            inputEl.value = path;
            inputEl.dispatchEvent(new Event("change", { bubbles: true }));
          }
        });
        fp.browse(currentPath);
      } else {
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "image/*";
        fileInput.onchange = (e) => {
          const file = e.target.files[0];
          if (file) {
            const fakePath = file.name ? `tiles/${file.name}` : URL.createObjectURL(file);
            inputEl.value = fakePath;
            inputEl.dispatchEvent(new Event("change", { bubbles: true }));
          }
        };
        fileInput.click();
      }
    });
  }

  static _setupStatMapGrid(tabContent, initialStatMap) {
    const typeSelect = tabContent.querySelector('#wod5e-statmap-type');
    const enableCheckbox = tabContent.querySelector('#wod5e-statmap-enable');
    const gridContainer = tabContent.querySelector('#wod5e-statmap-levels-grid');
    const autoFillBtn = tabContent.querySelector('#wod5e-autofill-btn');
    const autoFillInput = tabContent.querySelector('#wod5e-autofill-pattern');
    const jsonInput = tabContent.querySelector('#wod5e-statmap-json-input');

    let currentStatMap = {
      enabled: initialStatMap.enabled ?? true,
      statType: initialStatMap.statType || "hunger",
      levels: { ...(initialStatMap.levels || {}) }
    };

    const updateJson = () => {
      currentStatMap.enabled = enableCheckbox.checked;
      currentStatMap.statType = typeSelect.value;
      jsonInput.value = JSON.stringify(currentStatMap);
    };

    const getMaxLevelsForType = (type) => {
      if (type === "frenzy") return 1;
      if (type === "hunger") return 5;
      return 10;
    };

    const renderLevelRows = () => {
      const type = typeSelect.value;
      const maxLvl = getMaxLevelsForType(type);
      gridContainer.innerHTML = "";

      for (let i = 0; i <= maxLvl; i++) {
        const valStr = String(i);
        const existingImg = currentStatMap.levels[valStr] || "";

        let labelText = `Level ${i}`;
        if (type === "frenzy") {
          if (i === 0) labelText = `Frenzy Level 0 (Calm / Inactive)`;
          else labelText = `Frenzy Level 1 (Frenzied / Active)`;
        } else if (type === "hunger") {
          if (i === 0) labelText = `Hunger 0 (Satisfied)`;
          else if (i === 5) labelText = `Hunger 5 (Bestial / Starving)`;
          else labelText = `Hunger ${i}`;
        } else if (type === "health_agg") {
          if (i === 0) labelText = `0 Aggravated Damage`;
          else labelText = `${i} Aggravated Damage`;
        } else if (type === "health_sup") {
          if (i === 0) labelText = `0 Superficial Damage`;
          else labelText = `${i} Superficial Damage`;
        } else if (type === "health_remaining") {
          if (i === 0) labelText = `0 HP Left (Torpor / Incap)`;
          else labelText = `${i} HP Remaining`;
        } else if (type === "health_total") {
          labelText = `${i} Total Damage`;
        } else if (type.startsWith("willpower")) {
          labelText = `Willpower ${i} Damage`;
        }

        const row = document.createElement('div');
        row.style.cssText = "display: flex; gap: 6px; align-items: center; background: rgba(255,255,255,0.03); padding: 4px 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);";
        row.innerHTML = `
          <span style="width: 150px; font-size: 0.82em; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${labelText}">
            ${labelText}
          </span>
          <input type="text" data-level="${i}" class="wod5e-level-img-input" value="${this._escapeHtml(existingImg)}" placeholder="Path or __NONE__ to hide tile..." style="flex: 1; font-size: 0.85em;"/>
          <button type="button" class="button wod5e-level-browse-btn" style="white-space: nowrap; padding: 2px 8px; font-size: 0.82em; height: 26px; display: flex; align-items: center; gap: 4px;" title="Browse File">
            <i class="fas fa-folder-open"></i> Browse
          </button>
          <button type="button" class="button wod5e-level-hide-btn" style="white-space: nowrap; padding: 2px 6px; font-size: 0.8em; height: 26px; color: #ff8080;" title="Set to hide tile">
            <i class="fas fa-eye-slash"></i> Hide
          </button>
        `;

        const input = row.querySelector('.wod5e-level-img-input');
        const browseBtn = row.querySelector('.wod5e-level-browse-btn');
        const hideBtn = row.querySelector('.wod5e-level-hide-btn');

        input.addEventListener('change', (e) => {
          currentStatMap.levels[valStr] = e.target.value.trim();
          updateJson();
        });

        hideBtn.addEventListener('click', () => {
          input.value = "__NONE__";
          currentStatMap.levels[valStr] = "__NONE__";
          updateJson();
        });

        this.bindFilePicker(browseBtn, input);

        gridContainer.appendChild(row);
      }
    };

    typeSelect.addEventListener('change', () => {
      currentStatMap.statType = typeSelect.value;
      renderLevelRows();
      updateJson();
    });

    enableCheckbox.addEventListener('change', () => {
      updateJson();
    });

    autoFillBtn.addEventListener('click', () => {
      const pattern = autoFillInput.value.trim();
      if (!pattern) return;

      const type = typeSelect.value;
      const maxLvl = getMaxLevelsForType(type);

      for (let i = 0; i <= maxLvl; i++) {
        const path = pattern.replace(/\{level\}/g, i).replace(/\{lvl\}/g, i);
        currentStatMap.levels[String(i)] = path;
      }

      renderLevelRows();
      updateJson();
    });

    renderLevelRows();
    updateJson();
  }

  static _setupRulesEngine(tabContent, initialRules) {
    const container = tabContent.querySelector('#wod5e-rules-container');
    const addBtn = tabContent.querySelector('#wod5e-add-rule-btn');
    const jsonInput = tabContent.querySelector('#wod5e-rules-json-input');

    let rules = [...initialRules];

    const updateJson = () => {
      jsonInput.value = JSON.stringify(rules);
    };

    const renderRules = () => {
      container.innerHTML = "";
      if (rules.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: #888; font-style: italic; padding: 10px; font-size: 0.85em;">No conditional rules added. Click "Add Rule" above.</div>`;
        return;
      }

      rules.forEach((rule, idx) => {
        const card = document.createElement('div');
        card.className = 'wod5e-rule-card';
        card.style.cssText = "background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; padding: 8px; font-size: 0.85em;";

        const isHide = rule.hideTile || rule.image === "__NONE__" || rule.image === "none";

        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-weight: bold; color: #ff6b6b;"><i class="fas fa-hashtag"></i> Rule #${idx + 1}</span>
            <div>
              <label style="font-size: 0.85em; margin-right: 8px; color: #ff9999; cursor: pointer;" title="Hide Tile completely when this condition matches">
                <input type="checkbox" class="rule-hide-chk" ${isHide ? "checked" : ""}/> Hide Tile
              </label>
              <input type="checkbox" class="rule-enable-chk" ${rule.enabled ? "checked" : ""} title="Enable/Disable Rule"/>
              <button type="button" class="rule-delete-btn button" style="padding: 1px 6px; margin-left: 6px;" title="Delete Rule">
                <i class="fas fa-trash" style="color: #e53e3e;"></i>
              </button>
            </div>
          </div>

          <div style="display: flex; gap: 6px; margin-bottom: 6px;">
            <select class="rule-cond-type" style="flex: 2;">
              <option value="frenzy_active" ${rule.conditionType === "frenzy_active" ? "selected" : ""}>Frenzy Active (In Frenzy)</option>
              <option value="frenzy_inactive" ${rule.conditionType === "frenzy_inactive" ? "selected" : ""}>Frenzy Inactive (Calm)</option>
              <option value="hunger_and_frenzy" ${rule.conditionType === "hunger_and_frenzy" ? "selected" : ""}>Hunger >= X AND in Frenzy</option>
              <option value="hunger_equals" ${rule.conditionType === "hunger_equals" ? "selected" : ""}>Hunger Exact Match (=)</option>
              <option value="hunger_gte" ${rule.conditionType === "hunger_gte" ? "selected" : ""}>Hunger Greater Than or Equal (>=)</option>
              <option value="health_torpor" ${rule.conditionType === "health_torpor" ? "selected" : ""}>Incapacitated / Torpor State</option>
              <option value="health_agg_equals" ${rule.conditionType === "health_agg_equals" ? "selected" : ""}>Aggravated Health Exact Match (=)</option>
              <option value="health_aggravated" ${rule.conditionType === "health_aggravated" ? "selected" : ""}>Aggravated Health Damage (>=)</option>
              <option value="health_sup_equals" ${rule.conditionType === "health_sup_equals" ? "selected" : ""}>Superficial Health Exact Match (=)</option>
              <option value="health_superficial" ${rule.conditionType === "health_superficial" ? "selected" : ""}>Superficial Health Damage (>=)</option>
              <option value="health_percent_below" ${rule.conditionType === "health_percent_below" ? "selected" : ""}>Health Percent Below (<= %)</option>
              <option value="willpower_aggravated" ${rule.conditionType === "willpower_aggravated" ? "selected" : ""}>Aggravated Willpower Damage (>=)</option>
            </select>

            <input type="number" class="rule-cond-val" value="${rule.value ?? 1}" min="0" max="100" style="width: 60px;" placeholder="Value"/>
          </div>

          <div class="rule-img-row" style="display: ${isHide ? "none" : "flex"}; gap: 6px; align-items: center;">
            <input type="text" class="rule-img-src" value="${this._escapeHtml(rule.image || "")}" placeholder="Image path (e.g. tiles/frenzy.png)" style="flex: 1;"/>
            <button type="button" class="button rule-browse-btn" style="white-space: nowrap; padding: 2px 8px; font-size: 0.82em; height: 26px; display: flex; align-items: center; gap: 4px;" title="Browse Image File">
              <i class="fas fa-folder-open"></i> Browse
            </button>
            <input type="color" class="rule-tint" value="${rule.tint || "#ffffff"}" title="Optional Tint Color"/>
          </div>
        `;

        const imgInput = card.querySelector('.rule-img-src');
        const browseBtn = card.querySelector('.rule-browse-btn');
        const hideChk = card.querySelector('.rule-hide-chk');
        const imgRow = card.querySelector('.rule-img-row');

        hideChk.addEventListener('change', (e) => {
          const checked = e.target.checked;
          rules[idx].hideTile = checked;
          if (checked) {
            rules[idx].image = "__NONE__";
            imgRow.style.display = "none";
          } else {
            if (rules[idx].image === "__NONE__") rules[idx].image = "";
            imgRow.style.display = "flex";
          }
          updateJson();
        });

        card.querySelector('.rule-enable-chk').addEventListener('change', (e) => {
          rules[idx].enabled = e.target.checked;
          updateJson();
        });

        card.querySelector('.rule-delete-btn').addEventListener('click', () => {
          rules.splice(idx, 1);
          renderRules();
          updateJson();
        });

        card.querySelector('.rule-cond-type').addEventListener('change', (e) => {
          rules[idx].conditionType = e.target.value;
          updateJson();
        });

        card.querySelector('.rule-cond-val').addEventListener('change', (e) => {
          rules[idx].value = Number(e.target.value);
          updateJson();
        });

        if (imgInput) {
          imgInput.addEventListener('change', (e) => {
            rules[idx].image = e.target.value.trim();
            updateJson();
          });
          this.bindFilePicker(browseBtn, imgInput);
        }

        card.querySelector('.rule-tint')?.addEventListener('change', (e) => {
          rules[idx].tint = e.target.value;
          updateJson();
        });

        container.appendChild(card);
      });
    };

    addBtn.addEventListener('click', () => {
      rules.push({
        enabled: true,
        hideTile: false,
        conditionType: "frenzy_active",
        value: 1,
        image: "",
        tint: "#ffffff",
        alpha: 1.0,
        scale: 1.0
      });
      renderRules();
      updateJson();
    });

    renderRules();
    updateJson();
  }

  static _escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
