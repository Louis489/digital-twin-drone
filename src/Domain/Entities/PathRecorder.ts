export interface RecordedVector3 {
  x: number;
  y: number;
  z: number;
  clone(): RecordedVector3;
  copy(source: RecordedVector3): this;
  lerp(target: RecordedVector3, alpha: number): this;
}

export interface RecordedQuaternion {
  x: number;
  y: number;
  z: number;
  w: number;
  clone(): RecordedQuaternion;
  copy(source: RecordedQuaternion): this;
  slerp(target: RecordedQuaternion, alpha: number): this;
}

export interface ROVWaypoint {
  position: RecordedVector3;
  rotation: RecordedQuaternion;
  timestamp: number;
}

export class PathRecorder {
  private readonly waypoints: ROVWaypoint[] = [];

  public clear(): void {
    this.waypoints.length = 0;
  }

  public record(position: RecordedVector3, rotation: RecordedQuaternion, timestamp: number): void {
    this.waypoints.push({
      position: position.clone(),
      rotation: rotation.clone(),
      timestamp,
    });
  }

  public getWaypoints(): readonly ROVWaypoint[] {
    return this.waypoints;
  }

  public get count(): number {
    return this.waypoints.length;
  }
}
