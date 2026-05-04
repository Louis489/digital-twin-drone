export interface GpsPosition {
  latitude: number;
  longitude: number;
  altitude: number;
}

export interface Orientation {
  pitch: number;
  roll: number;
  yaw: number;
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface DroneProps {
  id: string;
  position: GpsPosition;
  orientation: Orientation;
  batteryLevel: number;
  localPosition?: Vector3D;
  rotationY?: number;
}

export class Drone {
  private readonly _id: string;
  private _position: GpsPosition;
  private _orientation: Orientation;
  private _batteryLevel: number;
  private _localPosition: Vector3D;
  private _rotationY: number;

  constructor(props: DroneProps) {
    this._id = props.id;
    this._position = props.position;
    this._orientation = props.orientation;
    this._batteryLevel = this.validateBatteryLevel(props.batteryLevel);
    this._localPosition = props.localPosition ?? { x: 0, y: 0, z: 0 };
    this._rotationY = props.rotationY ?? 0;
  }

  get id(): string {
    return this._id;
  }

  get position(): GpsPosition {
    return { ...this._position };
  }

  get orientation(): Orientation {
    return { ...this._orientation };
  }

  get batteryLevel(): number {
    return this._batteryLevel;
  }

  get localPosition(): Vector3D {
    return { ...this._localPosition };
  }

  get rotationY(): number {
    return this._rotationY;
  }

  updatePosition(newPosition: GpsPosition): void {
    this._position = { ...newPosition };
  }

  updateOrientation(newOrientation: Orientation): void {
    this._orientation = { ...newOrientation };
  }

  updateLocalPosition(newPosition: Vector3D): void {
    this._localPosition = { ...newPosition };
  }

  updateRotationY(newRotation: number): void {
    this._rotationY = newRotation;
  }

  updateBatteryLevel(newLevel: number): void {
    this._batteryLevel = this.validateBatteryLevel(newLevel);
  }

  isBatteryCritical(): boolean {
    return this._batteryLevel < 20;
  }

  private validateBatteryLevel(level: number): number {
    if (level < 0) return 0;
    if (level > 100) return 100;
    return level;
  }
}
