import { DroneScene, GlobeScene } from './Presentation';
import { Drone } from './Domain';
import { ReplayTelemetryUseCase, ToggleBathymetryUseCase, StartMissionUseCase, ToggleARVisionUseCase } from './Application';
import { TelemetryService, CesiumOceanoService } from './Infrastructure';
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

  console.log("✅ [CÂBLAGE] Démarrage chargement CSV...");
  
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
      console.log("✅ [CÂBLAGE] CSV Chargé, lancement du replay !");
      const replay = new ReplayTelemetryUseCase(dummyDrone, telemetryData);
      replay.setSpeedMultiplier(5);
      
      // Connexion du ThreeShipService à la télémétrie + UI
      const depthElement = document.getElementById('data-depth');
      const tempElement = document.getElementById('data-temp');
      
      replay.setOnTelemetryUpdate((point) => {
        threeShipService!.update();
        
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

    // Initialisation de l'Application (Cas d'Usage)
    toggleBathyUseCase = new ToggleBathymetryUseCase(oceanoService);
    const startMissionUseCase = new StartMissionUseCase();

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
  let isAROn = false;
  const arBtn = document.getElementById('btn-ar-toggle');
  
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
