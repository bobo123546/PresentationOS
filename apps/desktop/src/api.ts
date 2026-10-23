const fragment = new URLSearchParams(window.location.hash.slice(1));
const freshToken = fragment.get('session');
if (freshToken) {
  sessionStorage.setItem('presentationos-session', freshToken);
  history.replaceState(null, '', window.location.pathname + window.location.search);
}
export const API_BASE = window.location.origin;
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${sessionStorage.getItem('presentationos-session') ?? ''}`);
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}
