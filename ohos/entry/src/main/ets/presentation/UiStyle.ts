/** Shared, platform-neutral readable UI tokens. Density is always an explicit
 * preference; available width or device type must never opt into compact mode.
 * The pinned 48vp/heading-22/helper-14 floor is the touch-target and legibility
 * guarantee; the additive tokens below carry the visual weight (fills, corners,
 * elevation) so chrome can follow the HarmonyOS system look without shrinking a
 * hit box. Palette values intentionally mirror the official HarmonyOS sample
 * baseline: cool neutral canvas, white cards, #0A59F7 brand blue and restrained
 * semantic tints. */
export class UiStyle {
  /** Cool neutral canvas keeps white cards visually elevated. */
  static readonly page: string = '#F1F3F5';
  static readonly card: string = '#FFFFFF';
  /** Inputs use a soft inset fill instead of a heavy outline. */
  static readonly field: string = '#F4F6F9';
  static readonly ink: string = '#182431';
  static readonly muted: string = '#5E6A75';
  static readonly edge: string = '#E3E7EC';
  static readonly edgeLight: string = '#FFFFFF';
  static readonly accent: string = '#0A59F7';
  static readonly accentStrong: string = '#0746C4';
  static readonly accentSoft: string = '#E8F0FE';
  static readonly onAccent: string = '#FFFFFF';
  static readonly danger: string = '#C6382F';
  static readonly dangerSoft: string = '#FDECEA';
  static readonly warning: string = '#8A5A00';
  static readonly warningSoft: string = '#FFF4DE';
  static readonly success: string = '#1B6B4C';
  static readonly successSoft: string = '#E4F5EC';
  static readonly heading: number = 22;
  static readonly section: number = 18;
  static readonly helper: number = 14;
  static readonly control: number = 48;
  static readonly controlVisual: number = 40;
  static readonly radius: number = 12;
  static readonly paneGap: number = 16;
  static readonly disabledOpacity: number = 0.45;
  /** Visual-only scale. Never used as a hit target. */
  static readonly controlSm: number = 32;
  static readonly glyph: number = 15;
  static readonly icon: number = 20;
  static readonly display: number = 26;
  static readonly radiusCard: number = 20;
  static readonly radiusPill: number = 24;
  static readonly hairline: string = '#14182431';
  static readonly fill: string = '#0A182431';
  static readonly fillStrong: string = '#12182431';
  static readonly shadowRadius: number = 18;
  static readonly shadowColor: string = '#1A0F1C2E';
  static readonly shadowOffsetY: number = 6;
  static readonly headerSurface: string = '#F2FFFFFF';
  static readonly floatingSurface: string = '#F2FFFFFF';
  /** One card rhythm used by every settings/tool surface. */
  static readonly cardPadding: number = 16;
  static readonly cardGap: number = 12;
  /** Drawn chrome stays compact; the 48vp touch box is restored by responseRegion. */
  static controlFor(compact: boolean): number { return compact ? 36 : 40; }
  static headingFor(compact: boolean): number { return compact ? 18 : UiStyle.heading; }
  static sectionFor(compact: boolean): number { return compact ? 15 : UiStyle.section; }
  static textFor(compact: boolean): number { return compact ? 14 : UiStyle.body(false); }
  /** One gutter per scrolling pane, never repeated by child panels. */
  static contentInset(width: number): number { return width < 360 ? 12 : width < 840 ? 16 : 24; }
  /** Labels share a row with their control from 360vp upward. The label keeps
   * enough width to wrap internally instead of forcing a full-width stack. */
  static fieldLabelWidth(width: number): string { return width < 360 ? '100%' : width >= 600 ? '38%' : '40%'; }
  static fieldControlWidth(width: number): string { return width < 360 ? '100%' : width >= 600 ? '60%' : '56%'; }
  /** Short numeric labels fit beside a useful input in a normal inspector.
   * Count wide glyphs conservatively; long labels/units still get their own row.
   * This is presentation only and never creates, releases or submits a draft. */
  private static inlineNumber(width: number, label: string, unit: string, compact: boolean): boolean {
    if (!Number.isFinite(width) || width < 300) { return false; }
    const text: string = label + (unit.length > 0 ? ' · ' + unit : '');
    const font: number = UiStyle.body(compact);
    let estimate: number = 12;
    for (let index: number = 0; index < text.length; index++) {
      estimate += text.charCodeAt(index) > 255 ? font : font * 0.6;
    }
    const labelFraction: number = width >= 600 ? 0.4 : 0.45;
    return estimate <= width * labelFraction && width * (1 - labelFraction) >= 120;
  }
  static numberLabelWidth(width: number, label: string, unit: string = '', compact: boolean = false): string {
    return UiStyle.inlineNumber(width, label, unit, compact) ? (width >= 600 ? '38%' : '40%') : '100%';
  }
  static numberControlWidth(width: number, label: string, unit: string = '', compact: boolean = false): string {
    return UiStyle.inlineNumber(width, label, unit, compact) ? (width >= 600 ? '60%' : '56%') : '100%';
  }
  static toolbarItemWidth(width: number, count: number): string {
    const capacity: number = Math.max(1, Math.floor(Math.max(0, width) / UiStyle.control));
    const columns: number = capacity >= count ? count : capacity >= 3 ? 3 : capacity >= 2 ? 2 : 1;
    return (100 / columns).toString() + '%';
  }
  static body(compact: boolean = false): number { return compact ? 15 : 16; }
  static gap(compact: boolean = false): number { return compact ? 6 : 8; }
  static padding(compact: boolean = false): number { return compact ? 10 : 12; }
}
