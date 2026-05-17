import type { IXRService } from '../../Domain/Interfaces/IXRService';

export class StartImmersiveARUseCase {
    constructor(private xrService: IXRService) {}

    public execute(): Promise<void> {
        return this.xrService.startImmersiveAR();
    }
}
