import type { IAISService, Vessel } from '../../Domain';

export class UpdateVesselTrafficUseCase {
  private intervalId: number | null = null;

  constructor(private readonly aisService: IAISService) {}

  public execute(): Promise<Vessel[]> {
    return this.aisService.getVessels();
  }

  public start(onUpdate: (vessels: Vessel[]) => void, intervalMs = 1500): void {
    this.stop();

    const update = async () => {
      const vessels = await this.execute();
      onUpdate(vessels);
    };

    update();
    this.intervalId = window.setInterval(update, intervalMs);
  }

  public stop(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
