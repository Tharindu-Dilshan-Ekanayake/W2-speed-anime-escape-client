# +1 Speed Anime Escape (W2)

A browser remake of the Roblox game *+1 Speed Anime Escape*, built with React Three Fiber and Rapier physics, running on Bloxity. Progress is saved in `localStorage` under the signed-in Bloxity user (or the guest). Multiplayer lobbies of up to 8 run on the Colyseus server in `../W2-speed-anime-escape-server`. The game plays solo if the server can't be reached.

## Run it

```bash
npm install
cp .env.example .env   # set VITE_GAME_SLUG
npm run dev            # http://localhost:5173
npm run build          # production build in dist/
```

For multiplayer locally, also run `npm run dev` in `../W2-speed-anime-escape-server`.

## Hosting on Bloxity

`.github/workflows/deploy.yml` builds the client with the Legion URLs baked in and uploads it to Legion static hosting:

- Push to `dev`: https://w2-speed-anime-escape.dev.play.bloxity.io.
- Push to `main`: https://w2-speed-anime-escape.play.bloxity.io.

Add the secret `LEGION_DEPLOY_TOKEN` to this repo too. It is the same token as the server's, because tokens are per game.

## How the game plays

- **Every step gives Speed.** It starts at +1 per step at level 1 and rises to +8 per step at level 20. Boots add a flat bonus per step, and potions, treadmills and rebirths multiply it.
- **Speed fills the level bar.** Each level raises your max walk speed by 8%. Level 20 is the cap; after that you have to Rebirth, which resets your level and Speed for a permanent ×Speed and ×Wins bonus.
- **There are 20 stages, and stage N needs level N.** A locked gate blocks the way until you reach that level.
- **Walk speed** is 20 at level 1 and 56 at level 20.
- **Tornadoes.** Some stages have small twisters sweeping across the platform; touch one and it throws you off the edge into the water.
- **Teleport** (T) costs Wins: 1.5x what the stage's win pad pays. Going back to the lobby is free.
- **Speed trials.** Each stage has at least one chase: a collapsing bridge, lava flood, tsunami, avalanche, sandstorm, thunderstorm, laser wall, shadow swarm or acid flood. The chaser moves just under the stage level's top speed, so a player at that level outruns it and one a level lower gets caught.
- **Stage ends.** Each stage finishes in a wide plaza. The big gate to the next stage is set in the far wall, with two win pads on the left of the path and two training pads on the right:
  - Yellow win pad: free Wins.
  - Green 2× win pad: only works once you own 350K Wins.
  - x1 training pad: free.
  - Premium training pad: unlocked with Wins.
- **Everything is bought with Wins** (there are no Bux purchases): 18 anime characters, boots, potions and lobby treadmills. Animes are cosmetic only. Each one has its own aura, running effect and glowing footprints, and every character runs at the same speed.
- **Dying sends you back to the lobby.** A **daily gift** of Wins can be claimed once per day.
- **Your own Bloxity avatar** is the starting character. The game loads as whoever is signed in to Bloxity (otherwise as a guest); there is no log in or log out inside the game.

### Controls

| Key | Action |
| --- | --- |
| W / S | Run forward / back |
| A / D | Turn the camera (on-screen 🔄 buttons work too) |
| Space | Jump. Press again in the air for a double-jump flip |
| E | Buy / wear / unlock what you stand on |
| B / I / R / T / C / G | Shop / Backpack / Rebirth / Teleport / Controls / Daily gift (the key is shown on each button) |
| 1 / 2 / 3 | Buy a 2x / 3x / 5x Speed potion |
| Right-drag, wheel | Orbit and zoom the camera |

## Code map

| Path | What it does |
| --- | --- |
| `src/game/config.js` | Every tunable number: levels, speeds, economy, the 18 animes, boots, potions, treadmills, the 20 stages |
| `src/game/layout.js` | Turns stage configs into world-space geometry (no React), scaled to each stage's walk speed |
| `src/game/themes.js` | Sky, fog, floors, fluid and scenery per area |
| `src/game/store.js` | Zustand store with all game rules, plus save/load |
| `src/game/Player.jsx` | Physics capsule: movement, double jump, steps → Speed, footprints |
| `src/game/world/` | Lobby, stages, obstacle segments, speed trials, pads, gates, scenery, sky |
| `src/game/fx/` | Auras, running particles, footprints, popups, level-up burst |
| `src/ui/` | HUD, menus (shop, backpack, rebirth, teleport, controls), loading screen |
| `src/bloxity/` | Bloxity SDK bootstrap and avatar loading |
