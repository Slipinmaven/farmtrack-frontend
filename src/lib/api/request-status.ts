const wakeupDelayMs = 8_000;
const listeners = new Set<() => void>();

let activeRequests = 0;
let wakingUp = false;
let wakeupTimer: ReturnType<typeof setTimeout> | undefined;

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

export function beginApiRequest(): void {
  activeRequests += 1;
  if (activeRequests !== 1) return;

  wakeupTimer = setTimeout(() => {
    if (activeRequests === 0) return;
    wakingUp = true;
    notifyListeners();
  }, wakeupDelayMs);
}

export function endApiRequest(): void {
  activeRequests = Math.max(0, activeRequests - 1);
  if (activeRequests > 0) return;

  if (wakeupTimer) {
    clearTimeout(wakeupTimer);
    wakeupTimer = undefined;
  }
  if (wakingUp) {
    wakingUp = false;
    notifyListeners();
  }
}

export function subscribeToApiWakeup(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isApiWakingUp(): boolean {
  return wakingUp;
}
