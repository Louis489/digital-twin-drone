import { Drone, Vector3D } from '../../Domain/Entities/Drone';
import { TelemetryPoint } from '../../Infrastructure/Services/TelemetryService';

export class ReplayTelemetryUseCase {
  private drone: Drone;
  private telemetryData: TelemetryPoint[];
  private currentIndex: number = 0;
  private animationId: number | null = null;
  private speedMultiplier: number = 1;
  private onTelemetryUpdate: ((point: TelemetryPoint) => void) | null = null;

  constructor(drone: Drone, telemetryData: TelemetryPoint[]) {
    this.drone = drone;
    this.telemetryData = telemetryData;
  }

  setOnTelemetryUpdate(callback: (point: TelemetryPoint) => void): void {
    this.onTelemetryUpdate = callback;
  }

  start(): void {
    if (this.telemetryData.length === 0) return;
    this.currentIndex = 0;
    this.update();
  }

  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  setSpeedMultiplier(speed: number): void {
    this.speedMultiplier = speed;
  }

  private update(): void {
    if (this.currentIndex >= this.telemetryData.length) {
      this.currentIndex = 0;
    }

    const point = this.telemetryData[this.currentIndex];

    const newPosition: Vector3D = {
      x: point.x,
      y: point.y,
      z: point.z,
    };

    this.drone.updateLocalPosition(newPosition);
    this.drone.updateRotationY(point.heading);

    // Envoi des données vers le ThreeShipService si callback défini
    if (this.onTelemetryUpdate) {
      this.onTelemetryUpdate(point);
    }

    this.currentIndex++;

    if (this.currentIndex < this.telemetryData.length) {
      const nextPoint = this.telemetryData[this.currentIndex];
      const timeDelta = (nextPoint.time - point.time) * 1000 / this.speedMultiplier;
      const clampedDelay = Math.max(16, timeDelta);

      setTimeout(() => {
        this.animationId = requestAnimationFrame(() => this.update());
      }, clampedDelay);
    }
  }
}
