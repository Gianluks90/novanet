import { ApplicationRef, ComponentRef, createComponent, EnvironmentInjector, Injectable } from '@angular/core';
import { SnackbarComponent } from '../components/snackbar/snackbar.component';

@Injectable({
  providedIn: 'root',
})
export class NotificationService {

  constructor(private appRef: ApplicationRef, private injector: EnvironmentInjector) { }

    public notify(
    message: string,
    icon: 'check' | 'dangerous' | 'warning' | 'info' = 'info',
    duration: number = 3000
  ): void {
    const container = document.getElementById('notificationContainer');
    if (!container) {
      console.warn('Notification container not found');
      return;
    }

    // Crea dinamicamente il componente
    const snackbarRef: ComponentRef<SnackbarComponent> =
      createComponent(SnackbarComponent, {
        environmentInjector: this.injector,
      });

    snackbarRef.instance.message = message;
    snackbarRef.instance.icon = icon;

    // Attacca al DOM dentro al container
    this.appRef.attachView(snackbarRef.hostView);
    const domElem = (snackbarRef.hostView as any).rootNodes[0] as HTMLElement;
    container.appendChild(domElem);

    // Rimuove dopo la durata
    setTimeout(() => {
      this.appRef.detachView(snackbarRef.hostView);
      snackbarRef.destroy();
    }, duration);
  }
}
