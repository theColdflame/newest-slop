# WoD5e Dynamic Tile Tracker - Foundry VTT v14 Module

An essential module for **Foundry VTT Version 14** and the **World of Darkness 5e (WoD5e)** system (version **5.3.28**).

Allows any canvas Tile (Portraits, Blood Stains, Character HUDs, Scene Overlays, Haven Maps) to dynamically change its image texture, tint color, and opacity in real time whenever an Actor's Health, Willpower, or Hunger trackers update.

## 🌟 Key Features

1. **Real-time Synchronization**: Responds instantly to changes on actor sheets, macros, or combat tracker updates (`Hooks.on("updateActor")`).
2. **WoD5e 5.3.28 Tracker Engine**:
   - **Health Tracker**: Superficial, Aggravated, Health % thresholds, Impaired status, Torpor / Incapacitated.
   - **Willpower Tracker**: Superficial & Aggravated damage, Impaired status.
   - **Hunger / Rage / Desperation**: Levels 0 to 5 for Vampires, Werewolves, and Hunters.
3. **Priority Rule Matrix**: Define ordered rules. The top matching rule updates the tile texture, scale, tint, and alpha!
4. **Tile HUD Quick Action**: Fast access icon on the canvas tile HUD to inspect or open the bound actor sheet.

## 🛠️ Installation Instructions

1. Download `module.zip` from this preview app or releases.
2. Extract into your Foundry VTT user data directory under:
   `Data/modules/wod5e-dynamic-tile-tracker`
3. Launch Foundry VTT v14, launch your WoD5e world, navigate to **Manage Modules**, and enable **World of Darkness 5e - Dynamic Tile Tracker**.

## 📖 Usage & Setup

1. Double click any Tile on your Canvas or create a new Tile.
2. In the Tile Configuration window, open the **WoD5e Tracker** tab.
3. Check **Enable WoD5e Real-Time Tile Updates** and select your target WoD5e Actor (e.g. *Julian - Ventrue Ancilla*).
4. Add rules (e.g., *Rule 1: If Aggravated Health >= 6 -> Use Torpor portrait image*).
5. Click **Update Tile**.
6. Whenever health, willpower, or hunger changes on the actor's sheet, the tile on scene updates automatically in real-time!
