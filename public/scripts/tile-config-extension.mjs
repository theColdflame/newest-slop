/**
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
      nav.append(`<a class="item" data-tab="wod5e-tracker"><i class="fas fa-tint text-red-600"></i> WoD5e Tracker</a>`);
    }

    // Tab content container HTML
    const tabHtml = `
      <div class="tab" data-tab="wod5e-tracker">
        <div class="form-group">
          <label>Enable WoD5e Real-Time Dynamic Updates</label>
          <input type="checkbox" name="flags.wod5e-dynamic-tile-tracker.config.enabled" ${flags.enabled ? "checked" : ""}/>
        </div>
        <div class="form-group">
          <label>Bound WoD5e Actor</label>
          <select name="flags.wod5e-dynamic-tile-tracker.config.actorId">
            <option value="">-- Select Scene or World Actor --</option>
            ${game.actors.map(a => `<option value="${a.id}" ${a.id === flags.actorId ? "selected" : ""}>${a.name} (${a.type})</option>`).join("")}
          </select>
        </div>
        <p class="notes">Select a WoD5e Vampire, Werewolf, or Hunter actor to trigger real-time tile texture changes based on Health, Willpower, and Hunger trackers.</p>
      </div>
    `;

    const body = html.find('.sheet-body');
    if (body.length) {
      body.append(tabHtml);
    }
  }
}
