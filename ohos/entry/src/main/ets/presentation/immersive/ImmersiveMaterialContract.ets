/** API-20-safe contract. Never import the API-26 module from this file. */
export class ImmersiveMaterialStatus {
  state: string;
  runtimeApi: number;
  materialLevel: number | undefined;
  constructor(state: string, runtimeApi: number = 0, materialLevel: number | undefined = undefined) {
    this.state = state;
    this.runtimeApi = runtimeApi;
    this.materialLevel = materialLevel;
  }
}

/** Cleanup failed after a partially applied style: do not claim fallback success. */
export class ImmersiveMaterialCleanupError extends Error {
  constructor() { super('Native material cleanup could not be confirmed'); }
}

export interface ImmersiveMaterialAdapter {
  materialLevel: number;
  applySelect(instance: SelectAttribute): void;
  applyToggle(instance: ToggleAttribute): void;
  applySlider(instance: SliderAttribute): void;
  decorateDialog(options: AlertDialogParamWithButtons): AlertDialogParamWithButtons;
  decorateCustomDialog(options: CustomDialogControllerOptions): CustomDialogControllerOptions;
}
