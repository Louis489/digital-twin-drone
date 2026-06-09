import { DroneScene, GlobeScene } from './Presentation';
import { Drone, WeatherLayerType } from './Domain';
import { ReplayTelemetryUseCase, ToggleBathymetryUseCase, StartMissionUseCase, ToggleARVisionUseCase, StartImmersiveARUseCase, ManageShipTrafficUseCase } from './Application';
import { TelemetryService, CesiumOceanoService, AISStreamWebSocketService, CesiumWeatherService, POIHubService, WeatherDashboardService } from './Infrastructure';
import type { Ship } from './Domain';
import { LodLevel } from './Domain';
import { ThreeShipService } from './Infrastructure/Services/ThreeShipService';
import shipModelUrl from './assets/ship.glb?url';

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
let poiHubService: POIHubService | null = null;
let weatherDashboardService: WeatherDashboardService | null = null;

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
      
      // VALEURS FIXES - Stabilisation de la télémétrie
      const FIXED_DEPTH = 50.00;
      const FIXED_TEMP = 10.75;
      
      // Mise à jour unique au démarrage
      if (depthElement) depthElement.innerText = FIXED_DEPTH.toFixed(2);
      if (tempElement) tempElement.innerText = FIXED_TEMP.toFixed(2);
      
      // Désactiver les mises à jour dynamiques pour stabiliser l'affichage
      // replay.setOnTelemetryUpdate((point) => {
      //   if (depthElement) depthElement.innerText = Number(point.depth).toFixed(2);
      //   if (tempElement) tempElement.innerText = Number(point.temp).toFixed(2);
      // });
      
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

function showWeatherDashboard(): void {
  // Masquer tous les éléments du Hub
  const mainControlPanel = document.getElementById('main-control-panel');
  const hubOverlay = document.getElementById('hub-overlay');
  const poiPanel = document.getElementById('poi-side-panel');
  const togglePanelBtn = document.getElementById('toggle-panel-btn');
  
  if (mainControlPanel) mainControlPanel.style.display = 'none';
  if (hubOverlay) hubOverlay.style.display = 'none';
  if (poiPanel) poiPanel.style.display = 'none';
  // Le bouton de repli n'a de sens que sur le globe
  if (togglePanelBtn) togglePanelBtn.style.display = 'none';
  if (cesiumContainer) cesiumContainer.style.display = 'none';
  
  // Fermer le panneau POI
  if (poiHubService) {
    poiHubService.hide();
  }
  
  // Initialiser et afficher le dashboard météo
  if (!weatherDashboardService) {
    weatherDashboardService = new WeatherDashboardService();
  }
  
  weatherDashboardService.show();
  weatherDashboardService.initMap();
  
  console.log('[Main] Weather Dashboard displayed');
}

function setupReturnHubButton(): void {
  const returnHubBtn = document.getElementById('btn-return-hub');
  if (!returnHubBtn) return;
  
  returnHubBtn.addEventListener('click', () => {
    // Masquer et détruire le dashboard météo
    if (weatherDashboardService) {
      weatherDashboardService.hide();
      weatherDashboardService.destroyMap();
    }
    
    // Retour au Hub
    loadGlobeScene();
  });
}

function setupReturnToGlobeButton(): void {
  const returnGlobeBtn = document.getElementById('btn-return-globe');
  if (!returnGlobeBtn) return;
  
  returnGlobeBtn.addEventListener('click', () => {
    console.log('[Main] Retour au Globe depuis la scène 3D');
    
    // 1. Mettre la simulation 3D en pause pour économiser les ressources
    if (threeShipService) {
      threeShipService.deactivateSimulation();
    }
    
    // 2. Masquer la scène 3D et son UI
    const threeDiv = document.getElementById('three-container');
    const fpsUI = document.getElementById('fps-ui');
    if (threeDiv) threeDiv.style.display = 'none';
    if (fpsUI) fpsUI.style.display = 'none';
    
    // 3. Réafficher Cesium
    if (cesiumContainer) cesiumContainer.style.display = 'block';
    
    // 4. Retour au Hub Globe
    loadGlobeScene();
  });
}

function setupTogglePanelButton(): void {
  const controlPanel = document.getElementById('main-control-panel');
  const toggleBtn = document.getElementById('toggle-panel-btn');
  if (!controlPanel || !toggleBtn) return;

  const iconSpan = toggleBtn.querySelector('span');

  toggleBtn.addEventListener('click', () => {
    const isCollapsed = controlPanel.classList.toggle('collapsed');
    // Le bouton suit l'état du panneau pour glisser au bord de l'écran
    toggleBtn.classList.toggle('collapsed', isCollapsed);

    // Met à jour la flèche visuellement
    if (iconSpan) iconSpan.textContent = isCollapsed ? '▶' : '◀';
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

  if (poiHubService) {
    poiHubService.destroy();
    poiHubService = null;
  }

  if (currentScene) {
    currentScene.dispose();
    currentScene = null;
  }

  cesiumContainer.innerHTML = '';

  if (backButton) {
    backButton.style.display = 'none';
  }

  // Restaurer la visibilité des éléments du Hub
  const mainControlPanel = document.getElementById('main-control-panel');
  const hubOverlay = document.getElementById('hub-overlay');
  const threeDiv = document.getElementById('three-container');
  const fpsUI = document.getElementById('fps-ui');
  const poiPanel = document.getElementById('poi-side-panel');
  const togglePanelBtn = document.getElementById('toggle-panel-btn');
  
  if (mainControlPanel) {
    mainControlPanel.style.display = 'block';
    // Réinitialiser l'état replié au retour sur le globe
    mainControlPanel.classList.remove('collapsed');
  }
  if (hubOverlay) hubOverlay.style.display = 'flex';
  if (threeDiv) threeDiv.style.display = 'none';
  if (fpsUI) fpsUI.style.display = 'none';
  if (poiPanel) poiPanel.style.display = 'block';
  // Le bouton de repli n'est visible que sur le globe
  if (togglePanelBtn) {
    togglePanelBtn.style.display = 'flex';
    togglePanelBtn.classList.remove('collapsed');
    const icon = togglePanelBtn.querySelector('span');
    if (icon) icon.textContent = '◀';
  }
  
  // Afficher le conteneur Cesium
  cesiumContainer.style.display = 'block';

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
    toggleBathyUseCase = new ToggleBathymetryUseCase(oceanoService);
    const startMissionUseCase = new StartMissionUseCase();

    // ─── HUB POI (Panneau latéral droit) ───
    poiHubService = new POIHubService();
    // Récupérer le CesiumMapService depuis GlobeScene pour configurer le clic POI
    const mapService = scene.getMapService();
    mapService.setGlobalPOIClickHandler((entityId, properties) => {
      poiHubService?.handlePOIClick(entityId, properties);
    });
    // Callback déclenché uniquement par le bouton "Essayer la simulation"
    poiHubService.onSimulationStart(async (targetId) => {
      console.log(`Redirection vers ${targetId}`);
      
      if (targetId === 'scene-3d') {
        // Afficher l'écran de chargement avec la barre de progression
        const loadingScreen = document.getElementById('loading-screen');
        const loadingContainer = document.getElementById('model-loading-container');
        if (loadingScreen) loadingScreen.style.display = 'flex';
        if (loadingContainer) loadingContainer.style.display = 'block';
        
        poiHubService?.destroy();
        poiHubService = null;
        
        // Masquer Cesium/Hub et afficher le loader (NE révèle PAS la scène 3D)
        await startMissionUseCase.execute();
        
        // VERROU ASYNCHRONE ABSOLU : on attend le chargement complet du bateau
        if (threeShipService) {
          const textEl = document.getElementById('model-loading-text');
          const barEl = document.getElementById('model-loading-bar');
          if (textEl) textEl.innerText = 'Chargement du navire...';
          if (barEl) barEl.style.width = '0%';
          
          console.log('[Main] Démarrage du chargement du bateau...');
          console.log('[Main] URL du modèle:', shipModelUrl);
          
          try {
            // 1. ATTENTE BLOQUANTE du téléchargement réel du fichier (86 Mo)
            await threeShipService.loadShipModel(shipModelUrl);
            console.log('[Main] Chargement du bateau terminé avec succès !');
            threeShipService.activateSimulation();
            
            // 2. RÉVÉLATION DE LA SCÈNE UNIQUEMENT EN CAS DE SUCCÈS
            startMissionUseCase.revealScene();
            if (loadingContainer) loadingContainer.style.display = 'none';
            
            // 3. Démarrer la télémétrie
            startTelemetryReplay();
          } catch (error) {
            // ÉCHEC : on NE cache PAS l'écran de chargement, on affiche l'erreur
            console.error('[Main] Échec critique du chargement 3D:', error);
            if (textEl) textEl.innerText = 'Erreur de chargement. Veuillez rafraîchir.';
            if (barEl) {
              barEl.style.width = '100%';
              barEl.style.backgroundColor = '#ff4444';
              barEl.style.animation = 'none';
            }
          }
        }
      } else if (targetId === 'meteo-dashboard') {
        // Transition vers le Dashboard Météo 2D
        showWeatherDashboard();
      }
    });

    // Initialisation de l'Application (Cas d'Usage)

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

    // Configuration UI
    setupBathymetryUI();
    setupWeatherLayersUI(weatherService);
  } catch (err) {
    console.error('Failed to initialize globe:', err);
  }
}

async function init(): Promise<void> {
  setupBackButton();
  setupReturnHubButton();
  setupReturnToGlobeButton();
  setupTogglePanelButton();
  
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
    if (poiHubService) {
      poiHubService.destroy();
      poiHubService = null;
    }
    if (currentScene) {
      currentScene.dispose();
    }
  });
}

init();
