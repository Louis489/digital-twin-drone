import { DroneScene } from './Presentation';
import { Drone } from './Domain/Entities/Drone';
import { ReplayTelemetryUseCase } from './Application/UseCases/ReplayTelemetryUseCase';
import { TelemetryService } from './Infrastructure/Services/TelemetryService';

const container = document.getElementById('canvas-container');

if (!container) {
  throw new Error('Canvas container not found');
}

async function init(): Promise<void> {
  if (!container) {
    throw new Error('Canvas container not found');
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

  const telemetryService = new TelemetryService();

  try {
    const telemetryData = await telemetryService.loadTelemetryData();
    console.log(`Loaded ${telemetryData.length} telemetry points`);

    const replay = new ReplayTelemetryUseCase(drone, telemetryData);
    replay.setSpeedMultiplier(5);
    replay.start();
  } catch (error) {
    console.error('Failed to load telemetry:', error);
  }

  window.addEventListener('beforeunload', () => {
    scene.dispose();
  });
}

init();
