import type { IGeoSpatialService } from '../../Domain';

export class ToggleShippingLanesUseCase {
  constructor(private readonly geoSpatialService: IGeoSpatialService) {}

  public execute(visible: boolean): Promise<void> {
    return this.geoSpatialService.toggleShippingLanes(visible);
  }
}
