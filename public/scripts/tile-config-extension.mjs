/**
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
      tabNavBtn.innerHTML = `<i class="fas fa-droplet" style="color: #e53e3e; margin-right: 5px;"></i> WoD5e Tracker`;
      navEl.appendChild(tabNavBtn);

      // 5. Create Tab Content Panel
      const tabContent = document.createElement('div');
      tabContent.className = 'tab wod5e-tracker-tab-content';
      tabContent.setAttribute('data-tab', 'wod5e-tracker');
      tabContent.setAttribute('data-group', 'primary');
      tabContent.style.padding = '10px 4px';

      // Options for Actors dropdown
      const actorOptions = (game.actors || [])
        .map(a => `<option value="${a.id}" ${a.id === config.actorId ? "selected" : ""}>${a.name} (${a.type || "Actor"})</option>`)
        .join('');

      // Build Tab Content HTML
      tabContent.innerHTML = `
        <div class="wod5e-tracker-config-wrapper" style="display: flex; flex-direction: column; gap: 12px;">
          <div class="form-group">
            <label style="font-weight: bold;"><i class="fas fa-power-off"></i> Enable WoD5e Real-Time Dynamic Updates</label>
            <div class="form-fields">
              <input type="checkbox" name="flags.wod5e-dynamic-tile-tracker.config.enabled" ${config.enabled ? "checked" : ""}/>
            </div>
          </div>

          <div class="form-group">
            <label style="font-weight: bold;"><i class="fas fa-user-shield"></i> Bound WoD5e Actor</label>
            <div class="form-fields">
              <select name="flags.wod5e-dynamic-tile-tracker.config.actorId" style="width: 100%;">
                <option value="">-- Select Scene or World Actor --</option>
                ${actorOptions}
              </select>
            </div>
            <p class="notes">Select a Vampire, Werewolf, or Hunter character whose Health, Willpower, and Hunger/Rage trackers will update this tile in real time.</p>
          </div>

          <div class="form-group">
            <label style="font-weight: bold;"><i class="fas fa-image"></i> Default / Fallback Tile Texture</label>
            <div class="form-fields">
              <input type="text" name="flags.wod5e-dynamic-tile-tracker.config.defaultImage" value="${config.defaultImage || tileDoc.texture?.src || ""}" placeholder="tiles/normal.png" style="flex: 1;"/>
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
          <input type="hidden" id="wod5e-rules-json-input" name="flags.wod5e-dynamic-tile-tracker.config.rulesJson" value="${this._escapeHtml(JSON.stringify(config.rules || []))}"/>
        </div>
      `;

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
          const targetInput = rootEl.querySelector(`input[name="${targetName}"]`);
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
        rulesContainer.innerHTML = `
          <div style="padding: 12px; text-align: center; color: #888; background: rgba(0,0,0,0.15); border-radius: 4px; font-style: italic;">
            No rules configured. Click "Add Rule" to define dynamic tile textures based on Health, Willpower, or Hunger.
          </div>
        `;
        updateJSON();
        return;
      }

      rulesContainer.innerHTML = rules.map((rule, index) => `
        <div class="wod5e-rule-card" data-index="${index}" style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; padding: 8px; display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed rgba(255,255,255,0.1); padding-bottom: 4px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" class="rule-enable-check" data-index="${index}" ${rule.enabled !== false ? "checked" : ""} title="Enable/Disable Rule"/>
              <strong style="color: #ff6b6b;">Rule #${index + 1}</strong>
            </div>
            <div style="display: flex; gap: 4px;">
              ${index > 0 ? `<button type="button" class="rule-move-up" data-index="${index}" title="Move Up" style="padding: 1px 5px;"><i class="fas fa-arrow-up"></i></button>` : ''}
              ${index < rules.length - 1 ? `<button type="button" class="rule-move-down" data-index="${index}" title="Move Down" style="padding: 1px 5px;"><i class="fas fa-arrow-down"></i></button>` : ''}
              <button type="button" class="rule-delete-btn" data-index="${index}" title="Delete Rule" style="padding: 1px 5px; color: #e53e3e;"><i class="fas fa-trash"></i></button>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div>
              <label style="font-size: 0.8em; display: block; margin-bottom: 2px;">Condition Type</label>
              <select class="rule-cond-type" data-index="${index}" style="width: 100%; font-size: 0.85em;">
                <option value="health_torpor" ${rule.conditionType === "health_torpor" ? "selected" : ""}>Health: In Torpor</option>
                <option value="health_impaired" ${rule.conditionType === "health_impaired" ? "selected" : ""}>Health: Impaired (Full Damage)</option>
                <option value="health_aggravated" ${rule.conditionType === "health_aggravated" ? "selected" : ""}>Health: Aggravated Damage >=</option>
                <option value="health_superficial" ${rule.conditionType === "health_superficial" ? "selected" : ""}>Health: Superficial Damage >=</option>
                <option value="health_percent_below" ${rule.conditionType === "health_percent_below" ? "selected" : ""}>Health: % Below or Equal <=</option>
                <option value="willpower_impaired" ${rule.conditionType === "willpower_impaired" ? "selected" : ""}>Willpower: Impaired</option>
                <option value="willpower_aggravated" ${rule.conditionType === "willpower_aggravated" ? "selected" : ""}>Willpower: Aggravated Damage >=</option>
                <option value="hunger_gte" ${rule.conditionType === "hunger_gte" ? "selected" : ""}>Hunger / Rage / Desperation >=</option>
                <option value="hunger_equals" ${rule.conditionType === "hunger_equals" ? "selected" : ""}>Hunger / Rage / Desperation ==</option>
              </select>
            </div>

            <div>
              <label style="font-size: 0.8em; display: block; margin-bottom: 2px;">Condition Value</label>
              <input type="number" class="rule-cond-val" data-index="${index}" value="${rule.value ?? 1}" min="0" max="100" style="width: 100%; font-size: 0.85em;"/>
            </div>
          </div>

          <div>
            <label style="font-size: 0.8em; display: block; margin-bottom: 2px;">Image / Texture Path</label>
            <div style="display: flex; gap: 4px;">
              <input type="text" class="rule-image-path" data-index="${index}" value="${rule.image || ""}" placeholder="tiles/injured.png" style="flex: 1; font-size: 0.85em;"/>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;">
            <div>
              <label style="font-size: 0.8em; display: block; margin-bottom: 2px;">Tint Hex</label>
              <input type="color" class="rule-tint-color" data-index="${index}" value="${rule.tint || "#ffffff"}" style="width: 100%; height: 24px; padding: 0; cursor: pointer;"/>
            </div>
            <div>
              <label style="font-size: 0.8em; display: block; margin-bottom: 2px;">Opacity (Alpha)</label>
              <input type="number" class="rule-alpha-val" data-index="${index}" value="${rule.alpha ?? 1.0}" min="0" max="1" step="0.1" style="width: 100%; font-size: 0.85em;"/>
            </div>
            <div>
              <label style="font-size: 0.8em; display: block; margin-bottom: 2px;">Scale Multiplier</label>
              <input type="number" class="rule-scale-val" data-index="${index}" value="${rule.scale ?? 1.0}" min="0.1" max="5" step="0.1" style="width: 100%; font-size: 0.85em;"/>
            </div>
          </div>
        </div>
      `).join('');

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
          id: `rule-${Date.now()}`,
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
