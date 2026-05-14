import {
  ROV_INSPECTION_MISSION,
  ROV_INSPECTION_PILLARS,
  type MissionVector3,
  type InspectionMissionState,
  type WritableInspectionMissionFrame,
} from '../../Domain/Entities/InspectionMission';

export class UpdateROVInspectionMissionUseCase {
  public execute(state: InspectionMissionState, output: WritableInspectionMissionFrame): void {
    const missionTime = state.time % ROV_INSPECTION_MISSION.totalDurationSeconds;
    const pillarIndex = Math.floor(missionTime / ROV_INSPECTION_MISSION.pillarDurationSeconds);
    const pillarTime = missionTime - pillarIndex * ROV_INSPECTION_MISSION.pillarDurationSeconds;
    const pillar = ROV_INSPECTION_PILLARS[pillarIndex];
    const previousPillar = ROV_INSPECTION_PILLARS[
      (pillarIndex + ROV_INSPECTION_PILLARS.length - 1) % ROV_INSPECTION_PILLARS.length
    ];

    if (pillarTime < ROV_INSPECTION_MISSION.approachDurationSeconds) {
      const progress = this.smoothStep(pillarTime / ROV_INSPECTION_MISSION.approachDurationSeconds);
      const startX = this.getOrbitEdgeX(previousPillar, Math.PI * 2);
      const startZ = this.getOrbitEdgeZ(previousPillar, Math.PI * 2);
      const endX = this.getOrbitEdgeX(pillar, Math.PI);
      const endZ = this.getOrbitEdgeZ(pillar, Math.PI);

      output.position.set(
        this.lerp(startX, endX, progress),
        ROV_INSPECTION_MISSION.targetDepth,
        this.lerp(startZ, endZ, progress),
      );
      output.lookAt.set(pillar.x, pillar.y, pillar.z);
      return;
    }

    const orbitTime = pillarTime - ROV_INSPECTION_MISSION.approachDurationSeconds;
    const orbitProgress = orbitTime / ROV_INSPECTION_MISSION.orbitDurationSeconds;
    const orbitAngle = orbitProgress * Math.PI * 2;

    output.position.set(
      pillar.x + Math.cos(orbitAngle) * ROV_INSPECTION_MISSION.safetyRadius,
      ROV_INSPECTION_MISSION.targetDepth,
      pillar.z + Math.sin(orbitAngle) * ROV_INSPECTION_MISSION.safetyRadius,
    );
    output.lookAt.set(pillar.x, pillar.y, pillar.z);
  }

  private getOrbitEdgeX(pillar: MissionVector3, angle: number): number {
    return pillar.x + Math.cos(angle) * ROV_INSPECTION_MISSION.safetyRadius;
  }

  private getOrbitEdgeZ(pillar: MissionVector3, angle: number): number {
    return pillar.z + Math.sin(angle) * ROV_INSPECTION_MISSION.safetyRadius;
  }

  private lerp(start: number, end: number, progress: number): number {
    return start + (end - start) * progress;
  }

  private smoothStep(progress: number): number {
    return progress * progress * (3 - 2 * progress);
  }
}
