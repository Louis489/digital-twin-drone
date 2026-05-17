export interface IXRService {
  toggleARMode(isActive: boolean): void;
  startImmersiveAR(): Promise<void>;
}
