import { inject, Pipe, PipeTransform } from '@angular/core';
import { ZOOM_LEVEL_LABELS } from '../const/zoomLevelLabels';
import { I18nService } from '../i18n/i18n-service';

@Pipe({
  name: 'zoomLevelLabel',
  pure: false,
})
export class ZoomLevelLabelPipe implements PipeTransform {
  private i18n = inject(I18nService);

  transform(code: string): string { 
    const lang = this.i18n.lang(); // it, en    
    return ZOOM_LEVEL_LABELS[code.toLowerCase()]?.[lang] ?? code;
  }
}
