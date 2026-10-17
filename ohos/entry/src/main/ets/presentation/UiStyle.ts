/** Shared, platform-neutral readable UI tokens. Density is always an explicit
 * preference; available width or device type must never opt into compact mode. */
export class UiStyle {
  static readonly page: string = '#E8EFF2';
  static readonly card: string = '#F8FAFB';
  static readonly field: string = '#FFFFFF';
  static readonly ink: string = '#142D3A';
  static readonly muted: string = '#536875';
  static readonly edge: string = '#C6D8DF';
  static readonly edgeLight: string = '#F4FFFF';
  static readonly accent: string = '#087E8B';
  static readonly accentSoft: string = '#DEEFF2';
  static readonly danger: string = '#B53C42';
  static readonly dangerSoft: string = '#FCECEF';
  static readonly warning: string = '#805415';
  static readonly success: string = '#216646';
  static readonly heading: number = 22;
  static readonly helper: number = 14;
  static readonly control: number = 52;
  static readonly radius: number = 12;
  static body(compact: boolean = false): number { return compact ? 16 : 18; }
  static gap(compact: boolean = false): number { return compact ? 8 : 12; }
  static padding(compact: boolean = false): number { return compact ? 12 : 16; }
}
