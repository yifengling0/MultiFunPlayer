import { ConfigurationDiagnostic } from '../core/DeviceProfile';

export type AppOrientation = 'auto' | 'vertical' | 'horizontal';
export type UiDensity = 'readable' | 'compact';
export type ErrorDisplayType = 'none' | 'dialog' | 'snackbar';

/** Only preferences with an implemented OHOS presentation effect belong here.
 * Orientation selects the in-window layout, never the physical screen rotation.
 * OHOS defaults to responsive auto layout; upstream defaults to Vertical.
 * Error presentation never suppresses safety state or the persistent status.
 * Desktop window flags and NLog/JSON logging have no platform adapter and must
 * not become persisted no-op switches. No runtime input or window state lives
 * in this DTO. */
export class GeneralConfiguration {
  appOrientation: AppOrientation = 'auto';
  errorDisplayType: ErrorDisplayType = 'snackbar';
  uiDensity: UiDensity = 'readable';

  static validate(value: GeneralConfiguration): ConfigurationDiagnostic[] {
    try { GeneralConfiguration.check(value); return []; }
    catch (error) {
      return [new ConfigurationDiagnostic('general', 'invalid_general', (error as Error).message)];
    }
  }

  /** Schema 1 gains an absent section additively. A present section must be
   * complete and recognized; only the additive uiDensity preference may be absent
   * in older snapshots, restoring readable on every device. */
  static fromJson(raw: GeneralConfiguration | undefined): GeneralConfiguration {
    return raw === undefined ? new GeneralConfiguration() : GeneralConfiguration.clone(raw);
  }

  static clone(value: GeneralConfiguration): GeneralConfiguration {
    GeneralConfiguration.check(value);
    const result = new GeneralConfiguration();
    result.appOrientation = value.appOrientation;
    result.errorDisplayType = value.errorDisplayType;
    result.uiDensity = value.uiDensity === undefined ? 'readable' : value.uiDensity;
    return result;
  }

  private static check(value: GeneralConfiguration): void {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('general must be an object.');
    }
    const allowed: string[] = ['appOrientation', 'errorDisplayType', 'uiDensity'];
    const keys = Object.keys(value);
    if (keys.some(key => allowed.indexOf(key) < 0)) {
      throw new Error('general contains an unsupported or unsafe field.');
    }
    if (['appOrientation', 'errorDisplayType'].some(key => keys.indexOf(key) < 0)) {
      throw new Error('general is missing a required field.');
    }
    if (keys.indexOf('uiDensity') >= 0 && value.uiDensity !== 'readable' && value.uiDensity !== 'compact') {
      throw new Error('general.uiDensity must be readable or compact.');
    }
    if (value.appOrientation !== 'auto' && value.appOrientation !== 'vertical' && value.appOrientation !== 'horizontal') {
      throw new Error('general.appOrientation must be auto, vertical or horizontal.');
    }
    if (value.errorDisplayType !== 'none' && value.errorDisplayType !== 'dialog' && value.errorDisplayType !== 'snackbar') {
      throw new Error('general.errorDisplayType must be none, dialog or snackbar.');
    }
  }
}

export function defaultGeneralConfiguration(): GeneralConfiguration { return new GeneralConfiguration(); }
export function validateGeneralConfiguration(value: GeneralConfiguration): ConfigurationDiagnostic[] {
  return GeneralConfiguration.validate(value);
}
export function cloneGeneralConfiguration(value: GeneralConfiguration): GeneralConfiguration {
  return GeneralConfiguration.clone(value);
}
