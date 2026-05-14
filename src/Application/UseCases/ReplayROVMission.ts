import type { ROVWaypoint, RecordedQuaternion, RecordedVector3 } from '../../Domain/Entities/PathRecorder';

export interface ReplayROVMissionOutput {
  position: RecordedVector3;
  rotation: RecordedQuaternion;
}

export class ReplayROVMissionUseCase {
  public execute(waypoints: readonly ROVWaypoint[], elapsedSeconds: number, output: ReplayROVMissionOutput): boolean {
    if (waypoints.length < 2) return false;

    const firstTimestamp = waypoints[0].timestamp;
    const lastTimestamp = waypoints[waypoints.length - 1].timestamp;
    const averageSegmentDuration = (lastTimestamp - firstTimestamp) / (waypoints.length - 1);
    const duration = lastTimestamp - firstTimestamp + averageSegmentDuration;
    if (duration <= 0) return false;

    const replayTime = elapsedSeconds % duration;
    const normalizedTime = firstTimestamp + replayTime;
    let currentIndex = waypoints.length - 1;
    let segmentDuration = averageSegmentDuration;
    let segmentElapsed = replayTime - (lastTimestamp - firstTimestamp);

    for (let index = 0; index < waypoints.length - 1; index++) {
      if (normalizedTime >= waypoints[index].timestamp && normalizedTime <= waypoints[index + 1].timestamp) {
        currentIndex = index;
        segmentDuration = waypoints[index + 1].timestamp - waypoints[index].timestamp;
        segmentElapsed = normalizedTime - waypoints[index].timestamp;
        break;
      }
    }

    const current = waypoints[currentIndex];
    const next = waypoints[currentIndex + 1] ?? waypoints[0];
    const progress = segmentDuration > 0 ? segmentElapsed / segmentDuration : 0;
    const smoothProgress = this.smoothStep(progress);

    output.position.copy(current.position).lerp(next.position, smoothProgress);
    output.rotation.copy(current.rotation).slerp(next.rotation, smoothProgress);
    return true;
  }

  private smoothStep(progress: number): number {
    return progress * progress * (3 - 2 * progress);
  }
}
