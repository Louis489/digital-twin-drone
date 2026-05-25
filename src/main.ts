import { DroneScene, GlobeScene } from './Presentation';
import { Drone, WeatherLayerType } from './Domain';
import { ReplayTelemetryUseCase, ToggleBathymetryUseCase, StartMissionUseCase, ToggleARVisionUseCase, StartImmersiveARUseCase, ManageShipTrafficUseCase } from './Application';
import { TelemetryService, CesiumOceanoService, AISStreamWebSocketService, CesiumWeatherService } from './Infrastructure';
import type { Ship } from './Domain';
import { LodLevel } from './Domain';
import { ThreeShipService } from './Infrastructure/Services/ThreeShipService';

const cesiumContainer = document.getElementById('cesium-container');
const backButton = document.getElementById('back-button');

if (!cesiumContainer) {
    console.error("❌ CRITIQUE: div 'cesium-container' introuvable !");
    throw new Error('Cesium container not found');
}

let currentScene: GlobeScene | DroneScene | null = null;
let oceanoService: CesiumOceanoService | null = null;
let toggleBathyUseCase: ToggleBathymetryUseCase | null = null;
let threeShipService: ThreeShipService | null = null;

function startTelemetryReplay(): void {
  if (!threeShipService) {
    console.error("❌ [CÂBLAGE] ThreeShipService non initialisé !");
    return;
  }

  const telemetryService = new TelemetryService();
  const dummyDrone = new Drone({
    id: 'irov-001',
    position: { latitude: 48.8566, longitude: 2.3522, altitude: 0 },
    orientation: { pitch: 0, roll: 0, yaw: 0 },
    batteryLevel: 100,
    localPosition: { x: -20, y: 1.5, z: 3 },
    rotationY: 0,
  });

  telemetryService.loadTelemetryData()
    .then((telemetryData) => {
      const replay = new ReplayTelemetryUseCase(dummyDrone, telemetryData);
      replay.setSpeedMultiplier(5);
      
      // Connexion du ThreeShipService à la télémétrie + UI
      const depthElement = document.getElementById('data-depth');
      const tempElement = document.getElementById('data-temp');
      
      replay.setOnTelemetryUpdate((point) => {
        // MISE À JOUR DE L'UI
        if (depthElement) depthElement.innerText = Number(point.depth).toFixed(2);
        if (tempElement) tempElement.innerText = Number(point.temp).toFixed(2);
      });
      
      replay.start();
    })
    .catch((error) => {
      console.error("❌ Erreur de chargement CSV :", error);
    });
}

function setupBackButton(): void {
  if (!backButton) return;

  backButton.addEventListener('click', () => {
    backButton.style.display = 'none';
    // Désactiver la simulation (déverrouillage curseur)
    if (threeShipService) {
      threeShipService.deactivateSimulation();
    }
    loadGlobeScene();
  });
}

function setupBathymetryUI(): void {
  const bathyCheckbox = document.getElementById('toggle-bathy') as HTMLInputElement;
  const bathyLegend = document.getElementById('bathy-legend');
  if (bathyCheckbox && toggleBathyUseCase) {
    bathyCheckbox.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      toggleBathyUseCase!.execute(target.checked);
      // Afficher ou masquer la légende
      if (bathyLegend) {
        bathyLegend.style.display = target.checked ? 'block' : 'none';
      }
    });
  }
}

function setupWeatherLayersUI(weatherService: CesiumWeatherService): void {
  const weatherLayerInputs = document.querySelectorAll<HTMLInputElement>('input[name="weather-layer"]');
  const apiKeyInput = document.getElementById('weather-api-key') as HTMLInputElement | null;
  
  const weatherLayerByInputValue: Record<string, WeatherLayerType> = {
    wind: WeatherLayerType.Wind,
    temperature: WeatherLayerType.Temperature,
    'cloud-cover': WeatherLayerType.CloudCover,
    rain: WeatherLayerType.Rain,
    pressure: WeatherLayerType.Pressure,
  };

  weatherLayerInputs.forEach((input) => {
    input.checked = false;
    input.addEventListener('change', () => {
      const apiKey = apiKeyInput?.value.trim() || '';
      const selectedLayer = input.checked ? weatherLayerByInputValue[input.value] ?? WeatherLayerType.None : WeatherLayerType.None;
      
      if (selectedLayer !== WeatherLayerType.None && !apiKey) {
          console.warn('⚠️ Veuillez entrer une clé API OpenWeatherMap pour afficher la météo.');
          input.checked = false; // Désélectionne si pas de clé
          weatherService.setActiveLayer(WeatherLayerType.None, '');
          return;
      }
      
      weatherService.setActiveLayer(selectedLayer, apiKey);
      console.info(`[Weather] Couche ${selectedLayer} activée.`);
    });
  });
}

async function loadGlobeScene(): Promise<void> {
  if (!cesiumContainer) return;

  if (currentScene) {
    currentScene.dispose();
    currentScene = null;
  }

  cesiumContainer.innerHTML = '';

  if (backButton) {
    backButton.style.display = 'none';
  }

  try {
    // Initialisation de la Présentation (Le Globe)
    const scene = new GlobeScene(cesiumContainer);
    currentScene = scene;
    await scene.init();

    // Initialisation de l'Infrastructure (Services connectés à Cesium)
    const viewer = scene.getViewer();
    oceanoService = new CesiumOceanoService(viewer);
    const currentOceanoService = oceanoService;
    const weatherService = new CesiumWeatherService(viewer);

    // Initialisation de l'Application (Cas d'Usage)
    toggleBathyUseCase = new ToggleBathymetryUseCase(oceanoService);
    const startMissionUseCase = new StartMissionUseCase();

    // ─── AIS temps réel (ManageShipTrafficUseCase) ───
    const aisRepository = new AISStreamWebSocketService();
    const manageShipTraffic = new ManageShipTrafficUseCase(aisRepository);

    const shipCountEl = document.getElementById('ship-count');
    const lodLevelEl = document.getElementById('lod-level');
    const aisStatusDot = document.getElementById('ais-status-dot');
    const aisStatusText = document.getElementById('ais-status-text');
    const aisApiKeyInput = document.getElementById('ais-api-key') as HTMLInputElement | null;
    const aisTrafficCheckbox = document.getElementById('toggle-ais-traffic') as HTMLInputElement | null;
    const shipColorLegend = document.getElementById('ship-color-legend');

    // Écoute de la hauteur caméra → LOD
    oceanoService.onCameraHeightChange((height: number) => {
      manageShipTraffic.updateCameraHeight(height);
      if (lodLevelEl) {
        lodLevelEl.innerText = manageShipTraffic.getCurrentLodLevel();
      }
    });

    // Toggle de connexion AIS
    if (aisTrafficCheckbox && aisApiKeyInput) {
      aisTrafficCheckbox.addEventListener('change', () => {
        if (!aisTrafficCheckbox.checked) {
          manageShipTraffic.stop();
          currentOceanoService.clearShipTraffic();
          if (aisStatusDot) aisStatusDot.style.background = '#ff4444';
          if (aisStatusText) aisStatusText.innerText = 'Déconnecté';
          if (shipCountEl) shipCountEl.innerText = '0';
          if (shipColorLegend) shipColorLegend.style.display = 'none';
          return;
        }

        const apiKey = aisApiKeyInput.value.trim();
        if (!apiKey) {
          console.warn('⚠️ Veuillez entrer une clé API AISStream.');
          aisTrafficCheckbox.checked = false;
          return;
        }

        manageShipTraffic.start(
          apiKey,
          (ships: Map<string, Ship>, lodLevel: LodLevel) => {
            currentOceanoService.renderShipTraffic(ships, lodLevel);
          },
          (count: number) => {
            if (shipCountEl) shipCountEl.innerText = count.toString();
          },
        ).then(() => {
          if (aisStatusDot) aisStatusDot.style.background = '#44ff44';
          if (aisStatusText) aisStatusText.innerText = 'Connecté';
          if (shipColorLegend) shipColorLegend.style.display = 'grid';
        }).catch((err: unknown) => {
          console.error('❌ Connexion AISStream échouée :', err);
          if (aisStatusDot) aisStatusDot.style.background = '#ff4444';
          if (aisStatusText) aisStatusText.innerText = 'Erreur';
          aisTrafficCheckbox.checked = false;
          if (shipColorLegend) shipColorLegend.style.display = 'none';
        });
      });
    }

    // Connexion du clic Cesium vers le UseCase de transition
    scene.onMarkerClick(async () => {
      await startMissionUseCase.execute();
      // Activer la simulation (verrouillage curseur)
      if (threeShipService) {
        threeShipService.activateSimulation();
      }
      // Après transition UI, lancer le chargement CSV et replay
      startTelemetryReplay();
    });

    // Configuration UI
    setupBathymetryUI();
    setupWeatherLayersUI(weatherService);
  } catch (err) {
    console.error('Failed to initialize globe:', err);
  }
}

async function init(): Promise<void> {
  setupBackButton();
  
  // Initialisation de la scène Three.js (masquée au départ)
  threeShipService = new ThreeShipService('three-container');
  
  // Câblage du bouton AR (Vision X-Ray)
  const toggleARUseCase = new ToggleARVisionUseCase(threeShipService);
  const startImmersiveARUseCase = new StartImmersiveARUseCase(threeShipService);
  let isAROn = false;
  const arBtn = document.getElementById('btn-ar-toggle');
  const enterARBtn = document.getElementById('btn-enter-ar') as HTMLButtonElement | null;
  
  // Fonction pour toggle AR
  const toggleAR = () => {
      isAROn = !isAROn;
      toggleARUseCase.execute(isAROn);
      
      if (arBtn) {
          if (isAROn) {
              arBtn.style.background = 'rgba(0, 255, 255, 0.5)';
              arBtn.innerText = '[ DÉSACTIVER VISION AR ]';
          } else {
              arBtn.style.background = 'rgba(0, 255, 255, 0.1)';
              arBtn.innerText = '[ ACTIVER VISION AR ]';
          }
      }
  };
  
  if (arBtn) {
      arBtn.addEventListener('click', (e) => {
          // Évite que le clic verrouille la caméra quand on clique sur le bouton
          e.stopPropagation(); 
          toggleAR();
      });
  }

  if (enterARBtn && navigator.xr) {
      navigator.xr.isSessionSupported('immersive-ar')
          .then((isSupported) => {
              enterARBtn.style.display = isSupported ? 'block' : 'none';
          })
          .catch(() => {
              enterARBtn.style.display = 'none';
          });

      enterARBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
              await startImmersiveARUseCase.execute();
          } catch (error) {
              console.error("❌ Impossible de démarrer la session WebXR immersive-ar :", error);
          }
      });
  }
  
  // Touche L pour toggle AR
  document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyL') {
          toggleAR();
      }
  });
  
  await loadGlobeScene();

  window.addEventListener('beforeunload', () => {
    if (currentScene) {
      currentScene.dispose();
    }
  });
}

init();
