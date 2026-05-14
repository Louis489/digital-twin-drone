import { IOceanoService } from '../../Domain/Interfaces/IOceanoService';

/**
 * @class ToggleBathymetryUseCase
 * Orchestre l'activation ou la désactivation de la bathymétrie selon les principes Clean Architecture.
 */
export class ToggleBathymetryUseCase {
    constructor(private oceanoService: IOceanoService) {}

    public execute(isActive: boolean): void {
        if (isActive) {
            this.oceanoService.enableBathymetryLayer();
        } else {
            this.oceanoService.disableBathymetryLayer();
        }
    }
}
