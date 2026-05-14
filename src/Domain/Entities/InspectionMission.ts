export interface MissionVector3 {
  x: number;
  y: number;
  z: number;
}

export interface InspectionMissionState {
  time: number;
}

export interface InspectionMissionFrame {
  position: MissionVector3;
  lookAt: MissionVector3;
}

export interface WritableMissionVector3 extends MissionVector3 {
  set(x: number, y: number, z: number): this;
}

export interface WritableInspectionMissionFrame {
  position: WritableMissionVector3;
  lookAt: WritableMissionVector3;
}

export const OFFSHORE_TURBINE_POSITION: MissionVector3 = {
  x: 700,
  y: -55,
  z: -500,
};

export const ROV_INSPECTION_PILLARS: readonly MissionVector3[] = [
  { x: OFFSHORE_TURBINE_POSITION.x + 15, y: OFFSHORE_TURBINE_POSITION.y + 5, z: OFFSHORE_TURBINE_POSITION.z + 15 },
  { x: OFFSHORE_TURBINE_POSITION.x - 15, y: OFFSHORE_TURBINE_POSITION.y + 5, z: OFFSHORE_TURBINE_POSITION.z + 15 },
  { x: OFFSHORE_TURBINE_POSITION.x, y: OFFSHORE_TURBINE_POSITION.y + 5, z: OFFSHORE_TURBINE_POSITION.z - 15 },
] as const;

export const ROV_INSPECTION_MISSION = {
  targetDepth: OFFSHORE_TURBINE_POSITION.y + 5,
  pillarSpacing: 15,
  safetyRadius: 6,
  approachDurationSeconds: 8,
  orbitDurationSeconds: 22,
  pillarDurationSeconds: 30,
  totalDurationSeconds: 90,
} as const;
