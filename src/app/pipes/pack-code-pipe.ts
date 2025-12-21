import { Pipe, PipeTransform } from '@angular/core';
import { Pack } from '../models/pack';

@Pipe({
  name: 'packCode',
  standalone: true
})
export class PackCodePipe implements PipeTransform {

  transform(value: string | undefined | null, packs: Pack[]): string {
    if (!value || !packs?.length) return '';

    const pack = packs.find(p => p.code === value);
    return pack ? pack.name : value; // fallback al code se non trovato
  }

}