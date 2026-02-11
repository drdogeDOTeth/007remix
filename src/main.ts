// Patch Three.js Object3D to make position/rotation/quaternion/scale writable.
// Fixes conflict with browser extensions (e.g. React DevTools) that use
// Object.assign on Three.js objects — Object.assign fails on non-writable props.
const _origDefineProperties = Object.defineProperties;
Object.defineProperties = function<T>(obj: T, props: PropertyDescriptorMap & ThisType<any>): T {
  if (props.position && props.rotation && props.quaternion && props.scale) {
    for (const key of Object.keys(props)) {
      const desc = props[key];
      if ('value' in desc && !('writable' in desc)) {
        desc.writable = true;
      }
    }
  }
  return _origDefineProperties.call(Object, obj, props) as T;
};

import { PhysicsWorld } from './core/physics-world';
import { Game } from './game';
import { loadLevel } from './levels/level-loader';
import { LevelGenerator } from './levels/level-generator';
import { CCTVBackground } from './ui/cctv-background';
import { ScreenGlitch } from './ui/screen-glitch';
import { NetworkManager } from './network/network-manager';
import { LobbyScreen } from './ui/lobby-screen';

async function init(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('Canvas not found');

  const physics = await PhysicsWorld.create();

  // Create CCTV background for main menu
  const cctvPhysics = await PhysicsWorld.create();
  const cctvBackground = new CCTVBackground(cctvPhysics);
  cctvBackground.start();

  // Create screen glitch effect for CCTV feed
  const screenGlitch = new ScreenGlitch();
  screenGlitch.start();

  // Helper to hide CCTV background
  const hideCCTVBackground = () => {
    const cctvCanvas = document.getElementById('cctv-render-canvas');
    if (cctvCanvas) {
      cctvCanvas.style.display = 'none';
    }
    cctvBackground.stop();
    screenGlitch.stop();
  };

  // Helper to show CCTV background
  const showCCTVBackground = () => {
    const cctvCanvas = document.getElementById('cctv-render-canvas');
    if (cctvCanvas) {
      cctvCanvas.style.display = 'block';
    }
    cctvBackground.start();
    screenGlitch.start();
  };

  // Helper to create a random level game
  const createRandomLevelGame = async () => {
    const generator = new LevelGenerator(Date.now());
    const level = generator.generate({
      minRooms: 6,
      maxRooms: 12,
      minEnemies: 5,
      maxEnemies: 15,
      difficulty: 'medium'
    });
    
    const game = new Game(canvas, physics, { levelMode: true });
    game.showBriefing(level);
    game.onMissionComplete = () => {
      document.getElementById('mission-complete')!.style.display = 'flex';
    };
    return game;
  };

  // Quick Play: single room, click to start
  document.getElementById('btn-quick-play')!.addEventListener('click', () => {
    const game = new Game(canvas, physics, {});
    document.getElementById('start-screen')!.style.display = 'none';
    hideCCTVBackground();
    game.start();
    canvas.addEventListener('click', () => game.start());
  });

  // Mission: load facility, briefing, then play
  const missionBtn = document.getElementById('btn-mission');
  if (missionBtn) {
    missionBtn.addEventListener('click', async () => {
      const btn = missionBtn as HTMLButtonElement;
      const origText = btn.textContent;
      btn.textContent = 'LOADING...';
      btn.disabled = true;
      try {
        const level = await loadLevel('/levels/facility.json');
        const game = new Game(canvas, physics, { levelMode: true });
        game.showBriefing(level);
        game.onMissionComplete = () => {
          document.getElementById('mission-complete')!.style.display = 'flex';
        };
        canvas.addEventListener('click', () => {
          document.getElementById('start-screen')!.style.display = 'none';
          hideCCTVBackground();
          game.start();
        });
      } catch (err) {
        console.error('Mission load failed:', err);
        btn.textContent = origText ?? 'MISSION — FACILITY';
        btn.disabled = false;
        alert('Could not load mission. Make sure you run with "npm run dev" so /levels/facility.json is served.');
      }
    });
  }

  // Random Level: generate and play a new procedural level
  const randomLevelBtn = document.getElementById('btn-random-level');
  if (randomLevelBtn) {
    randomLevelBtn.addEventListener('click', async () => {
      const btn = randomLevelBtn as HTMLButtonElement;
      const origText = btn.textContent;
      btn.textContent = 'GENERATING...';
      btn.disabled = true;
      try {
        const game = await createRandomLevelGame();
        canvas.addEventListener('click', () => {
          document.getElementById('start-screen')!.style.display = 'none';
          hideCCTVBackground();
          game.start();
        });
      } catch (err) {
        if (err instanceof Error) {
          console.error('Random level generation failed:', err.message);
          console.error(err.stack);
        } else {
          console.error('Random level generation failed:', err);
        }
        btn.textContent = origText ?? 'RANDOM LEVEL';
        btn.disabled = false;
        alert('Could not generate random level. Please try again.');
      }
    });
  }

  // Multiplayer: show lobby first, then connect
  const lobbyScreen = new LobbyScreen();
  const multiplayerBtn = document.getElementById('btn-multiplayer');
  if (multiplayerBtn) {
    multiplayerBtn.addEventListener('click', () => {
      document.getElementById('start-screen')!.style.display = 'none';
      lobbyScreen.show({
        onJoin: async (username) => {
          try {
            const networkManager = new NetworkManager(username);
            await networkManager.connect();

            console.log('[Main] Connected to server as:', networkManager.playerId);

            lobbyScreen.hide();
            hideCCTVBackground();

            const game = new Game(canvas, physics, {
              networkMode: 'client',
              networkManager,
            });
            game.start();
            canvas.addEventListener('click', () => game.start());
          } catch (err) {
            console.error('[Main] Multiplayer connection failed:', err);
            lobbyScreen.setStatus('Connection failed. Is the server running? (npm run server)');
            lobbyScreen.setJoinEnabled(true);
          }
        },
        onBack: () => {
          lobbyScreen.hide();
          document.getElementById('start-screen')!.style.display = 'flex';
        },
      });
    });
  }

  // Mission Complete screen handlers
  const nextLevelBtn = document.getElementById('btn-next-level');
  if (nextLevelBtn) {
    nextLevelBtn.addEventListener('click', async () => {
      document.getElementById('mission-complete')!.style.display = 'none';
      const btn = nextLevelBtn as HTMLButtonElement;
      const origText = btn.textContent;
      btn.textContent = 'GENERATING...';
      btn.disabled = true;
      try {
        const game = await createRandomLevelGame();
        game.start();
        btn.textContent = origText;
        btn.disabled = false;
      } catch (err) {
        if (err instanceof Error) {
          console.error('Next level generation failed:', err.message);
          console.error(err.stack);
        } else {
          console.error('Next level generation failed:', err);
        }
        btn.textContent = origText;
        btn.disabled = false;
        alert('Could not generate next level. Please try again.');
      }
    });
  }

  const returnMenuBtn = document.getElementById('btn-return-menu');
  if (returnMenuBtn) {
    returnMenuBtn.addEventListener('click', () => {
      document.getElementById('mission-complete')!.style.display = 'none';
      document.getElementById('start-screen')!.style.display = 'flex';
      showCCTVBackground();
    });
  }
}

init().catch((err) => {
  console.error('Init failed:', err);
  const startScreen = document.getElementById('start-screen');
  if (startScreen) {
    const errDiv = document.createElement('div');
    errDiv.style.cssText = 'color:#ff4444;font-size:14px;margin-top:20px;max-width:600px;word-break:break-word;';
    errDiv.textContent = `Error: ${err?.message ?? err}`;
    startScreen.appendChild(errDiv);
  }
});
