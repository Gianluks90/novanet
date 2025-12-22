import { inject, LOCALE_ID, Pipe, PipeTransform } from '@angular/core';
import { ZOOM_LEVEL_LABELS } from '../const/zoomLevelLabels';

@Pipe({
  name: 'zoomLevelLabel',
})
export class ZoomLevelLabelPipe implements PipeTransform {
  private locale = inject(LOCALE_ID);

  transform(code: string): string {
    console.log(ZOOM_LEVEL_LABELS[code]);
    
    const lang = this.locale.split('-')[0]; // it, en    
    return ZOOM_LEVEL_LABELS[code.toLowerCase()]?.[lang] ?? code;
  }
}
