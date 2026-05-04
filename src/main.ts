import { DroneScene, GlobeScene } from './Presentation';
import { Drone } from './Domain/Entities/Drone';
import { ReplayTelemetryUseCase } from './Application/UseCases/ReplayTelemetryUseCase';
import { TelemetryService } from './Infrastructure/Services/TelemetryService';

const container = document.getElementById('canvas-container');
const backButton = document.getElementById('back-button');

if (!container) {
  throw new Error('Canvas container not found');
}

let currentScene: GlobeScene | DroneScene | null = null;

function loadDroneScene(): void {
  if (!container) return;

  if (currentScene) {
    currentScene.dispose();
    currentScene = null;
  }

  container.innerHTML = '';

  if (backButton) {
    backButton.style.display = 'block';
  }

  const drone = new Drone({
    id: 'irov-001',
    position: { latitude: 48.8566, longitude: 2.3522, altitude: 0 },
    orientation: { pitch: 0, roll: 0, yaw: 0 },
    batteryLevel: 100,
    localPosition: { x: -20, y: 1.5, z: 3 },
    rotationY: 0,
  });

  const scene = new DroneScene(container, drone);
  currentScene = scene;

  const telemetryService = new TelemetryService();

  telemetryService.loadTelemetryData()
    .then((telemetryData) => {
      console.log(`Loaded ${telemetryData.length} telemetry points`);

      const replay = new ReplayTelemetryUseCase(drone, telemetryData);
      replay.setSpeedMultiplier(5);
      replay.start();
    })
    .catch((error) => {
      console.error('Failed to load telemetry:', error);
    });
}

function setupBackButton(): void {
  if (!backButton) return;

  backButton.addEventListener('click', () => {
    backButton.style.display = 'none';
    loadGlobeScene();
  });
}

function loadGlobeScene(): void {
  if (!container) return;

  if (currentScene) {
    currentScene.dispose();
    currentScene = null;
  }

  container.innerHTML = '';

  if (backButton) {
    backButton.style.display = 'none';
  }

  const scene = new GlobeScene(container, () => {
    loadDroneScene();
  });
  currentScene = scene;
}

function init(): void {
  setupBackButton();
  loadGlobeScene();

  window.addEventListener('beforeunload', () => {
    if (currentScene) {
      currentScene.dispose();
    }
  });
}

init();
