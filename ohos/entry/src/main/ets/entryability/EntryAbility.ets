import { UIAbility } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';

export default class EntryAbility extends UIAbility {
  onWindowStageCreate(windowStage: window.WindowStage): void {
    AppStorage.setOrCreate('mfpForeground', true);
    try {
      windowStage.loadContent('pages/Index').catch(() => {
        AppStorage.setOrCreate('mfpForeground', false);
        console.error('MultiFunPlayer failed to load its main page');
      });
    } catch (error) {
      AppStorage.setOrCreate('mfpForeground', false);
      console.error('MultiFunPlayer failed to create its main window');
    }
  }
  onForeground(): void { AppStorage.setOrCreate('mfpForeground', true); }
  onBackground(): void { AppStorage.setOrCreate('mfpForeground', false); }
  onDestroy(): void { AppStorage.setOrCreate('mfpForeground', false); }
}
