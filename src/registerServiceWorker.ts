export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    const manifestUrl = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href ?? new URL("manifest.webmanifest", window.location.href).href;
    const serviceWorkerUrl = new URL("service-worker.js", manifestUrl);
    const serviceWorkerScope = new URL("./", serviceWorkerUrl).href;

    navigator.serviceWorker.register(serviceWorkerUrl, { scope: serviceWorkerScope }).catch((error: unknown) => {
      console.warn("Service worker registration failed", error);
    });
  });
}
