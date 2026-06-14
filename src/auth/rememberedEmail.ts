const LS_KEY = 'vte_remembered_email';

export function getRememberedEmail(): string | null {
  return localStorage.getItem(LS_KEY);
}

export function setRememberedEmail(email: string): void {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    localStorage.removeItem(LS_KEY);
    return;
  }
  localStorage.setItem(LS_KEY, normalized);
}
