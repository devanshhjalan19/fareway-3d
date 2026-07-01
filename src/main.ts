import { SceneManager } from "./core/SceneManager";
import { Loop } from "./core/Loop";
import { Game } from "./core/Game";
import { Profile, type WeatherMode } from "./core/Profile";
import { Input } from "./systems/Input";
import { Rickshaw } from "./entities/Rickshaw";
import { CameraRig } from "./systems/CameraRig";
import { City } from "./world/City";
import { Surfaces } from "./world/Surfaces";
import { Clouds } from "./world/Clouds";
import { SkyDome } from "./world/SkyDome";
import { Ride } from "./systems/Ride";
import { HUD } from "./ui/HUD";
import { MiniMap } from "./ui/MiniMap";
import { Arrow } from "./ui/Arrow";
import { Screens } from "./ui/Screens";
import { Garage } from "./ui/Garage";
import { PauseMenu } from "./ui/PauseMenu";
import { Toast } from "./ui/Toast";
import { TouchControls } from "./ui/TouchControls";
import { EdgeIndicator } from "./ui/EdgeIndicator";
import { AudioManager } from "./systems/AudioManager";
import { Dust } from "./entities/Dust";
import { CoinBurst } from "./entities/CoinBurst";
import { Traffic } from "./entities/Traffic";
import { Cows } from "./entities/Cows";
import { Weather } from "./systems/Weather";
import { NetClient } from "./net/NetClient";
import { MultiplayerSession } from "./systems/MultiplayerSession";
import { MultiplayerUI, makeRoomCode } from "./ui/MultiplayerUI";
import type { ServerMsg } from "./net/protocol";

// --- Bootstrap -------------------------------------------------------------
const container = document.getElementById("app")!;
const sceneManager = new SceneManager(container);
const { scene, camera } = sceneManager;
const profile = new Profile();

// --- World -----------------------------------------------------------------
const city = new City();
scene.add(city.group);

const surfaces = new Surfaces(city.roadLines, city.span);
scene.add(surfaces.group);

// Cows wander the streets and collide dynamically (see cows.update / cows.collide).
const cows = new Cows(city.roadLines, city.span);
scene.add(cows.group);

const traffic = new Traffic(city.roadLines, city.span, 16);
scene.add(traffic.group);

const clouds = new Clouds(city.span);
scene.add(clouds.group);

const skyDome = new SkyDome();
scene.add(skyDome.mesh);

const weather = new Weather(scene, sceneManager.sun, sceneManager.hemi, camera, skyDome, profile.weather);

// --- Player + systems ------------------------------------------------------
const input = new Input();
const rickshaw = new Rickshaw();
scene.add(rickshaw.object);

const cameraRig = new CameraRig(camera);

const dust = new Dust();
scene.add(dust.group);

const coinBurst = new CoinBurst();
scene.add(coinBurst.group);

// --- Game state + rides ----------------------------------------------------
const game = new Game();
const ride = new Ride(city.group, city.waitPoints, game);

// --- UI + audio ------------------------------------------------------------
const hud = new HUD();
const minimap = new MiniMap(city.span);
const arrow = new Arrow();
scene.add(arrow.object);
const edge = new EdgeIndicator();
const audio = new AudioManager();
const toast = new Toast();
const touch = new TouchControls(input);
const mpUI = new MultiplayerUI();

// Run-state flags managed below.
let paused = false;
let slowmoTimer = 0; // real seconds of slow-motion remaining
let ambientHonkTimer = 4;
let nearMissCooldown = 0; // throttle near-miss popups

// --- Multiplayer state -----------------------------------------------------
type Mode = "solo" | "mp";
let mode: Mode = "solo";
let session: MultiplayerSession | null = null;
let mpStarted = false; // has the current MP round's local run begun?
let roomCode = "";
const playerName =
  localStorage.getItem("rr-name") || "Driver" + Math.floor(10 + Math.random() * 90);

/** Push the persistent profile (upgrades, livery, prefs) into live systems. */
function applyProfile() {
  rickshaw.setMaxSpeed(profile.maxSpeed);
  rickshaw.setAccel(profile.accel);
  rickshaw.setLiveryColor(profile.liveryColor);
  game.startTime = profile.startTime;
  ride.tipMultiplier = profile.tipMultiplier;
  audio.setEnabled(profile.sound);
}
applyProfile();

function setWeatherMode(mode: WeatherMode) {
  weather.setMode(mode);
  profile.setWeather(mode);
  if (weather.isRaining && game.phase === "playing" && !paused) audio.rainStart();
  else audio.rainStop();
}

// --- Garage / pause / screens ---------------------------------------------
let garageReturn: () => void = () => screens.showTitle();

const garage = new Garage(
  profile,
  applyProfile, // repaint / re-tune live on each purchase
  () => {
    garage.close();
    garageReturn();
  },
);

function openGarage(from: () => void) {
  garageReturn = from;
  screens.hideAll();
  garage.open();
}

const pause = new PauseMenu(profile, {
  onResume: () => setPaused(false),
  onRestart: () => beginRun(),
  onSound: (on) => {
    profile.setSound(on);
    audio.setEnabled(on);
  },
  onWeather: setWeatherMode,
});

const screens = new Screens(
  beginRun,
  () => openGarage(() => screens.showTitle()),
  createRoom,
  joinRoom,
);

function setHudVisible(v: boolean) {
  hud.setVisible(v);
  minimap.setVisible(v);
  arrow.object.visible = v;
  touch.setVisible(v);
}

function setPaused(p: boolean) {
  if (game.phase !== "playing") return;
  paused = p;
  if (p) {
    pause.show();
    audio.stopEngine();
    audio.rainStop();
  } else {
    pause.hide();
    audio.startEngine();
    if (weather.isRaining) audio.rainStart();
  }
}

// Spawn on the road intersection nearest the centre (clear of buildings) so the
// first frame isn't wedged inside a block.
const spawnLine = city.roadLines.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a));

function beginRun() {
  teardownSession(); // leaving any multiplayer room
  mode = "solo";
  applyProfile();
  setWeatherMode(profile.weather);
  rickshaw.object.position.set(spawnLine, 0, spawnLine);
  rickshaw.speed = 0;
  rickshaw.heading = 0;
  game.start();
  ride.reset();
  garage.close();
  screens.hideAll();
  mpUI.hideAll();
  pause.hide();
  paused = false;
  slowmoTimer = 0;
  setHudVisible(true);
  audio.resume();
  audio.startEngine();
  if (weather.isRaining) audio.rainStart();
}

// --- Multiplayer flow ------------------------------------------------------

function teardownSession() {
  if (session) {
    session.dispose();
    session = null;
  }
  mpStarted = false;
}

function createRoom() {
  connectRoom(makeRoomCode());
}

function joinRoom() {
  mpUI.showJoinPrompt((code) => connectRoom(code));
}

/** Open a socket to `code`'s room and wire the lobby / game state handlers. */
function connectRoom(code: string) {
  teardownSession();
  roomCode = code;
  mode = "mp";
  screens.hideAll();

  const net = new NetClient(code, playerName, city.waitPoints.length, {
    onWelcome: () => {
      mpUI.showLobby({
        code: roomCode,
        isHost: false, // corrected by the first state update
        onStart: () => net.start(),
        onLeave: leaveRoom,
      });
    },
    onState: (msg) => {
      session?.onState(msg);
      handleMpState(msg);
    },
    onFull: () => {
      teardownSession();
      mode = "solo";
      mpUI.showError("That room is full (4 drivers max).");
    },
    onClose: () => {
      if (mode === "mp") {
        toast.note("Disconnected from room");
        leaveRoom();
      }
    },
  });
  session = new MultiplayerSession(scene, city.waitPoints, net);
}

function handleMpState(msg: Extract<ServerMsg, { t: "state" }>) {
  if (!session) return;
  if (msg.phase === "lobby") {
    mpUI.updateLobby(msg.players, session.isHost);
  } else if (msg.phase === "playing") {
    if (!mpStarted) beginMpRun();
    game.timeLeft = session.timeLeft;
    game.rides = session.score;
  } else if (msg.phase === "ended") {
    if (mpStarted) endMpRun();
  }
}

function beginMpRun() {
  mpStarted = true;
  applyProfile();
  setWeatherMode(profile.weather);

  // Spread players out along the spawn intersection so they don't overlap.
  const idx = Math.max(0, session?.players.findIndex((p) => p.host) ?? 0);
  rickshaw.object.position.set(spawnLine + idx * 3, 0, spawnLine);
  rickshaw.speed = 0;
  rickshaw.heading = 0;

  game.phase = "playing";
  game.money = 0;
  game.rides = 0;
  game.combo = 1;
  game.timeLeft = session?.timeLeft ?? 180;

  mpUI.hideAll();
  screens.hideAll();
  pause.hide();
  paused = false;
  slowmoTimer = 0;
  setHudVisible(true);
  audio.resume();
  audio.startEngine();
  if (weather.isRaining) audio.rainStart();
}

function endMpRun() {
  game.phase = "gameover";
  mpStarted = false; // a host rematch will re-begin on the next "playing" state
  setHudVisible(false);
  edge.update(camera, null);
  audio.stopEngine();
  audio.rainStop();
  if (session) {
    mpUI.showScoreboard(session.ranking, session.you, {
      onRematch: () => session?.requestStart(),
      onExit: leaveRoom,
      canRematch: session.isHost,
    });
  }
}

function leaveRoom() {
  teardownSession();
  mode = "solo";
  game.phase = "title";
  setHudVisible(false);
  audio.stopEngine();
  audio.rainStop();
  mpUI.hideAll();
  screens.showTitle();
}

// Start on the title screen.
screens.showTitle();
setHudVisible(false);

// --- Global keys -----------------------------------------------------------
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyH") audio.honk();
  if ((e.code === "KeyP" || e.code === "Escape") && game.phase === "playing" && mode === "solo") {
    // Pausing is single-player only — the multiplayer clock keeps running.
    e.preventDefault();
    setPaused(!paused);
  }
});

// --- Game loop -------------------------------------------------------------
const loop = new Loop(
  (dt) => {
    if (paused) return; // freeze the world while the pause menu is open

    slowmoTimer = Math.max(0, slowmoTimer - dt);
    const timeScale = slowmoTimer > 0 ? 0.4 : 1;
    const gdt = dt * timeScale;

    // Traffic / cows / sky / coins animate in all phases for a living backdrop.
    traffic.update(gdt);
    cows.update(gdt);
    clouds.update(gdt);
    weather.update(gdt);
    coinBurst.update(gdt);
    if (nearMissCooldown > 0) nearMissCooldown -= dt;

    if (game.phase === "playing") {
      // --- Shared driving + world collisions (both modes) ---
      const surf = surfaces.sample(rickshaw.position);
      rickshaw.grip = weather.grip * surf.grip;
      rickshaw.surfaceDrag = surf.drag;
      rickshaw.update(gdt, input, city.collision);

      if (traffic.collide(rickshaw.position, 1.1)) {
        rickshaw.speed *= 0.25;
        rickshaw.collidedThisFrame = true;
      } else if (mode === "solo" && Math.abs(rickshaw.speed) > 9 && nearMissCooldown <= 0) {
        // Near-miss cash bonus (single-player only; MP is scored on drop-offs).
        const nm = traffic.nearMiss(rickshaw.position, 1.1, 1.5);
        if (nm > 0) {
          const bonus = 8 * nm;
          game.addBonus(bonus);
          audio.whoosh();
          toast.note(`😮 Near miss! +₹${bonus}`);
          nearMissCooldown = 0.6;
        }
      }

      if (cows.collide(rickshaw.position, 1.1)) {
        rickshaw.speed *= 0.25;
        rickshaw.collidedThisFrame = true;
      }

      dust.update(gdt, rickshaw);
      audio.updateEngine(rickshaw.speed);

      // Occasional faint city honk (both modes).
      ambientHonkTimer -= gdt;
      if (ambientHonkTimer <= 0) {
        audio.ambientHonk();
        ambientHonkTimer = 3 + Math.random() * 5;
      }

      if (mode === "solo") {
        ride.update(gdt, rickshaw);
        arrow.update(gdt, rickshaw, ride.objectivePosition);

        if (ride.justPickedUp) audio.ding();
        if (ride.justCompleted && ride.lastReward) {
          const r = ride.lastReward;
          audio.cash(r.combo);
          audio.coin();
          toast.reward(r);
          coinBurst.burst(rickshaw.position, 14 + r.stars * 4);
          if (r.combo >= 3) slowmoTimer = 0.7; // juicy slow-mo on a hot streak
        }

        if (game.tick(gdt)) {
          // Timer ran out this tick: bank earnings and show the results.
          profile.bank(game.money);
          setHudVisible(false);
          edge.update(camera, null);
          audio.stopEngine();
          audio.rainStop();
          screens.showGameOver(game, profile.wallet);
        }
      } else if (session) {
        // Multiplayer: the server owns passengers, score and the clock.
        session.update(gdt, rickshaw);
        arrow.update(gdt, rickshaw, session.objectivePosition);
        game.timeLeft = session.timeLeft;
        game.rides = session.score;

        if (session.justPickedUp) audio.ding();
        if (session.justDropped) {
          audio.cash(1);
          audio.coin();
          coinBurst.burst(rickshaw.position, 18);
          toast.note("Dropped off! 🎉");
        }
        if (session.justBeaten) toast.note("Pipped to it! 🏁");
        // Round end is driven by the server ("ended" state → endMpRun()).
      }
    }
    // Camera keeps tracking the rickshaw in all phases for a live backdrop.
    cameraRig.update(gdt, rickshaw);

    // Sun + shadow frustum follow the rickshaw so shadows stay crisp citywide.
    const off = weather.sunOffset;
    const rp = rickshaw.position;
    sceneManager.sun.position.set(rp.x + off.x, off.y, rp.z + off.z);
    sceneManager.sunTarget.position.set(rp.x, 0, rp.z);
  },
  () => {
    if (game.phase === "playing" && !paused) {
      if (mode === "solo") {
        hud.update(game, ride.objectiveLabel, rickshaw.speed);
        minimap.update(rickshaw, ride);
        edge.update(camera, ride.objectivePosition);
      } else if (session) {
        hud.update(game, session.objectiveLabel, rickshaw.speed);
        minimap.update(rickshaw, session, session.otherPositions);
        edge.update(camera, session.objectivePosition);
      }
    }
    sceneManager.render();
  },
);

// Debug hook for automated verification (harmless in production).
(window as unknown as { __rr: unknown }).__rr = {
  game, ride, rickshaw, city, scene, beginRun, traffic, cows, weather,
  profile, surfaces, coinBurst, openGarage, setPaused, setWeatherMode,
  createRoom, joinRoom, connectRoom, leaveRoom,
  get mode() { return mode; },
  get session() { return session; },
};

// --- Hide loading & start --------------------------------------------------
const bar = document.getElementById("loading-bar");
if (bar) bar.style.width = "100%";
setTimeout(() => document.getElementById("loading")?.classList.add("hidden"), 300);

loop.start();
