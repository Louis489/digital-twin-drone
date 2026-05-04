import { Drone, Vector3D } from '../../Domain/Entities/Drone';

export class SimulateDroneMovement {
  private drone: Drone;
  private angle: number = 0;
  private radius: number = 5;
  private speed: number = 0.01;

  constructor(drone: Drone) {
    this.drone = drone;
  }

  start(): void {
    this.update();
  }

  private update(): void {
    this.angle += this.speed;

    const newPosition: Vector3D = {
      x: Math.cos(this.angle) * this.radius,
      y: 0.5,
      z: Math.sin(this.angle) * this.radius,
    };

    const newRotationY = -this.angle;

    this.drone.updateLocalPosition(newPosition);
    this.drone.updateRotationY(newRotationY);

    requestAnimationFrame(() => this.update());
  }

  setRadius(radius: number): void {
    this.radius = radius;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }
}
