/**
 * Adds quick visual status HUD control button to Canvas Tile HUD
 */

export class WoD5eTileHUDExtension {
  static attachButton(app, html, data) {
    const tileDoc = app.object.document;
    const config = tileDoc.getFlag("wod5e-dynamic-tile-tracker", "config");

    if (!config || !config.enabled) return;

    const button = $(`
      <div class="control-icon wod5e-tracker-hud-btn" title="WoD5e Dynamic Tile Tracker Active">
        <i class="fas fa-droplet text-red-500"></i>
      </div>
    `);

    button.click((ev) => {
      ev.preventDefault();
      const actor = game.actors.get(config.actorId);
      if (actor) {
        actor.sheet.render(true);
      } else {
        ui.notifications.warn("No bound WoD5e Actor found for this Tile.");
      }
    });

    html.find('.col.left').append(button);
  }
}
