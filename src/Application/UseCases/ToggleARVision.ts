import { ThreeShipService } from '../../Infrastructure/Services/ThreeShipService';

export class ToggleARVisionUseCase {
    constructor(private shipService: ThreeShipService) {}

    public execute(isActive: boolean): void {
        this.shipService.toggleARMode(isActive);
    }
}
