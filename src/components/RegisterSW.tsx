'use client';

import { useEffect } from 'react';

export function RegisterSW() {
  useEffect(() => {
    console.log('🔧 [RegisterSW] mounting');
    console.log('🔧 [RegisterSW] serviceWorker en navigator:', 'serviceWorker' in navigator);
    console.log('🔧 [RegisterSW] NODE_ENV:', process.env.NODE_ENV);
    console.log('🔧 [RegisterSW] origen:', typeof window !== 'undefined' ? window.location.origin : 'n/a');

    if (!('serviceWorker' in navigator)) {
      console.warn('🔧 [RegisterSW] navegador sin soporte de Service Worker');
      return;
    }

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('✅ [RegisterSW] registrado. scope:', reg.scope);
          console.log('✅ [RegisterSW] estado:', {
            installing: !!reg.installing,
            waiting: !!reg.waiting,
            active: !!reg.active,
          });
        })
        .catch((err) => {
          console.error('❌ [RegisterSW] falló registro:', err);
        });
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
    }
  }, []);

  return null;
}
