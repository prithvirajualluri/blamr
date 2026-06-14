import { useCallback, useEffect, useState } from 'react';

/** True when the URL is under /app (operator dashboard). Everything else is the public marketing site. */
export function useIsOperatorApp(): boolean {
  const [isApp, setIsApp] = useState(() => window.location.pathname.startsWith('/app'));

  useEffect(() => {
    const sync = () => setIsApp(window.location.pathname.startsWith('/app'));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  return isApp;
}

export function navigateTo(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useNavigate() {
  return useCallback((path: string) => navigateTo(path), []);
}
