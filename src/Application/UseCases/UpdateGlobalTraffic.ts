import type { IAISService, Vessel } from '../../Domain';

export class UpdateGlobalTrafficUseCase {
  constructor(private readonly aisService: IAISService) {}

  public execute(): Promise<Vessel[]> {
    return this.aisService.getVessels();
  }
}
