import type { IXRService } from '../../Domain/Interfaces/IXRService';

export class StartImmersiveVRUseCase {
    constructor(private xrService: IXRService) {}

    public execute(): Promise<void> {
        return this.xrService.startImmersiveVR();
    }
}
