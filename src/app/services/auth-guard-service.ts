import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { getAuth } from 'firebase/auth';

@Injectable({
  providedIn: 'root'
})
export class AuthGuardService {
  constructor(private router: Router) { }

  public async canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Promise<boolean> {
    const auth = getAuth();
    const user = await this.getCurrentUser(auth);
    if (user) {
      return true;
    } else {
      this.router.navigate(['']);
      return false;
    }
  }

  private getCurrentUser(auth: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const unsubscribe = auth.onAuthStateChanged((user: any) => {
        unsubscribe(); // Unsubscribe immediately to avoid memory leaks
        resolve(user);
      }, reject);
    });
  }
}