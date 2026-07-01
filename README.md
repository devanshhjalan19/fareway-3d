# 🛺 Rickshaw Racing

A 3D arcade driving game built with **Three.js + TypeScript + Vite**. You're an
auto-rickshaw driver in Mumbai: pick up waiting passengers, drop them at their
destination, and complete as many rides as you can before the timer runs out.

Play **solo** (score attack) or in a **4-player room** where everyone competes
for the same passengers — first to reach a passenger gets the fare, and the
driver with the most drop-offs after 3 minutes wins. Everything renders from
primitives and synthesized audio, so it runs with **zero external assets**.

## Run it

```bash
npm install
npm run dev      # single-player, opens http://localhost:5173
```

For **local multiplayer**, also run the room server in a second terminal:

```bash
npm run party:dev   # PartyKit room server on 127.0.0.1:1999
npm run dev         # the game (in another terminal)
```

On Windows you can just double-click **`Play Rickshaw Racing.bat`** (solo) or
**`Play Multiplayer (local).bat`** (starts both servers).

Build for production:

```bash
npm run build && npm run preview
```

## Controls

| Key | Action |
| --- | --- |
| `W` / `↑` | Drive forward |
| `S` / `↓` | Brake / reverse |
| `A` `D` / `←` `→` | Steer |
| `Space` | Handbrake — hold while steering at speed to **drift** around corners |
| `H` | Honk |
| `P` / `Esc` | Pause (resume, restart, sound & weather toggles) |

On touch devices, on-screen steering and throttle/brake pads appear automatically.

## How to play

1. Press **Start Driving**.
2. A beacon marks a waiting passenger — the floating arrow and screen-edge arrow
   point the way. Drive up to them and **stop** to board. The beacon shifts
   **green → orange → red** as their patience drains; if it runs out they leave.
3. A red destination beam appears. Drive there and stop to drop off.
4. Each ride pays a fare + a time-based tip and adds bonus seconds, and is rated
   **★–★★★**: drive fast and clean for three stars. Bumping traffic or walls with
   a fare aboard shrinks the tip and the rating — your passenger lets you know.
5. **Chain drop-offs** within the streak window to build a **tip combo** (up to
   x5 🔥). On a hot streak (x3+) drop-offs trigger a brief **slow-mo** and a
   **coin burst**, the screen edges glow, and the cash chime climbs in pitch.
6. **Near-misses:** squeeze past traffic at speed (without touching) for a small
   cash bonus.
7. Watch out: **traffic** and **wandering cows** stop you cold, and **puddles**
   (slippery) and **gravel** (draggy) change how the rickshaw handles.
   Complete as many rides as you can before the clock hits zero — beat your best!

## Multiplayer (2–4 players)

From the title screen:

- **🚦 Create Room** — generates a shareable 4-letter code and drops you into a
  lobby. Share the code with friends.
- **🔗 Join Room** — enter a friend's code to join their lobby (up to 4 drivers).

When everyone's in, the **host** presses **Start Race**. All players share the
**same city and the same pool of passengers** — two drivers can race for the same
fare, and whoever reaches it first (and stops) gets it; the other gets a "Pipped
to it!" nudge. There are more passengers on the map with more players, so there's
always someone to chase. After the 3-minute clock, a **scoreboard** ranks everyone
by drop-offs. The host can hit **Rematch**.

Notes: multiplayer is scored purely on drop-offs (no money/tips), and pausing is
disabled online since the shared clock keeps running. Your garage engine/livery
still apply to your own rickshaw.

## Garage & progression
Money you earn each run is **banked to a persistent wallet**. Between runs, open
the **Garage** (from the title or game-over screen) to spend it:

- **Engine** — higher top speed & acceleration.
- **Timer** — more starting time.
- **Tips** — bigger passenger tips.
- **Liveries** — cosmetic paint jobs for the rickshaw.

Upgrades and your selected livery persist across sessions (localStorage).

## Weather
Pick the mood from the pause menu — it stays fixed (no darkening cycle):

- **☀️ Golden** (default) — warm, bright golden hour.
- **🌆 Evening** — cooler dusk tones.
- **🌧️ Monsoon** — overcast Mumbai rain, with slicker, lower-grip roads.

## Architecture

```
src/
  core/        SceneManager (renderer/camera/lights + PostFX), Loop (fixed timestep),
               Game (state/score/timer), Profile (persistent wallet/upgrades/prefs),
               PostFX (bloom + colour grade + SMAA composer)
  world/       City (handcrafted, seeded grid + windowed buildings + landmarks),
               Collision (AABB push-out), Surfaces (puddle/gravel grip patches),
               Clouds (drifting sky backdrop), SkyDome (gradient sky)
  entities/    Rickshaw (arcade controller + grip model), RemoteRickshaw (other players),
               Customer, Marker, Dust, Traffic, Cows (wander + dynamic collision), CoinBurst
  systems/     Input (keyboard + touch), CameraRig (chase cam), Ride (solo pickup/dropoff + stars),
               MultiplayerSession (client-side MP driver), AudioManager (synth),
               Weather (golden/night/monsoon + rain)
  net/         protocol (shared wire types), NetClient (PartySocket wrapper)
  ui/          HUD, MiniMap, Arrow, EdgeIndicator, Screens (title/game-over),
               MultiplayerUI (join/lobby/scoreboard), Garage, PauseMenu, Toast, TouchControls
  main.ts      Wires everything together + the solo/multiplayer game-phase flow
party/
  server.ts    Authoritative PartyKit room server (rooms, shared passengers, timer, scores)
```

The city uses a fixed seed, so every client builds an identical map and an
identical ordered list of wait-points — which lets the server refer to a shared
passenger purely by its wait-point index and every client resolves the same spot.
The server owns the passenger pool, the clock and the scores; player movement is
client-reported and relayed (friendly game, no anti-cheat). The single-player
`Ride` system and the multiplayer `MultiplayerSession` are parallel — the world,
driving and rendering are shared.

Driving uses a lightweight arcade kinematic model (speed + heading, no physics
engine). Collision treats the rickshaw as a circle pushed out of building boxes.
A grip model lets the travel direction lag the facing direction so puddles and
the monsoon make the tail slide; loose gravel adds extra drag.

## Swapping in real 3D assets (optional)

The look is intentionally low-poly so free CC0 packs drop in cleanly:

- **City / buildings:** [Kenney City Kit](https://poly.pizza/bundle/City-Kit-0CkvGrBJ0u) (CC0, glTF)
- **Rickshaw / people:** [Poly Pizza](https://poly.pizza/), [Quaternius](https://quaternius.com/), [Kenney](https://kenney.nl)

Load a `.glb` with Three.js `GLTFLoader` and replace the primitive `buildModel()`
in `Rickshaw.ts` / the building meshes in `City.ts`. Keep any CC-BY credits in a
`CREDITS.md`.

## Deploy (Netlify + PartyKit)

The game is two pieces: the **static frontend** (Netlify) and the **realtime room
server** (PartyKit). Both have free tiers that comfortably cover a few friends.

**1. Deploy the room server to PartyKit** (one time + on server changes):

```bash
npx partykit deploy       # first run asks you to log in (GitHub)
```

This prints your server host, e.g. `rickshaw-racing.YOUR-USERNAME.partykit.dev`.
Copy it.

**2. Deploy the frontend to Netlify:**

- Push this repo to GitHub and "Import" it in Netlify (build settings are already
  in `netlify.toml`: build `npm run build`, publish `dist`).
- In Netlify → **Site settings → Environment variables**, add:
  - `VITE_PARTYKIT_HOST` = `rickshaw-racing.YOUR-USERNAME.partykit.dev`
- Trigger a deploy. Done — share the Netlify URL; friends open it, one clicks
  **Create Room**, shares the code, the rest **Join Room**.

If `VITE_PARTYKIT_HOST` is unset, single-player still works but multiplayer will
try to reach a local dev server and fail. See `.env.example`.

> Requires PartyKit ≥ 0.0.112 if your project folder path contains a space
> (older versions fail to bundle). This repo pins a working version.

## Roadmap

- Real glTF models (rickshaw, buildings, characters)
- Pedestrians, traffic lights, more world life
- Multiplayer polish: player-name entry, reconnect, spectate, player-vs-player
  collisions, and syncing traffic/weather across the room
- ✅ **Multiplayer** — authoritative PartyKit room server, shared passenger pool,
  "most drop-offs wins" 4-player rounds (done)
- ✅ **Visual upgrade** — bloom + colour-grade + SMAA post-processing, gradient sky (done)
