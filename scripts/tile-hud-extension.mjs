/**
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
      button.innerHTML = `<i class="fas fa-droplet" style="color: #e53e3e;"></i>`;

      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        let actor = null;
        if (config.actorId) {
          if (typeof fromUuidSync === "function") {
            try {
              const res = fromUuidSync(config.actorId);
              if (res) actor = res.documentName === "Token" ? res.actor : (res.actor || res);
            } catch(e){}
          }
          if (!actor && typeof game !== "undefined" && game.actors) {
            actor = game.actors.get(config.actorId);
          }
        }
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
