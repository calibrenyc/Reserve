const nativeFetch = window.fetch.bind(window);
export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = localStorage.getItem('reserve_token');
  const locationId = localStorage.getItem('reserve_location_id');
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (locationId) headers.set('X-Location-ID', locationId);
  return nativeFetch(input, { ...init, headers });
}
