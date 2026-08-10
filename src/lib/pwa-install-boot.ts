/**
 * Inline boot script: capture beforeinstallprompt before React mounts, and
 * block mobile browsers until the install gate hydrates.
 */
export const PWA_INSTALL_BOOT_SCRIPT = `(function(){try{var w=window;w.__PWA_DEFERRED_INSTALL=null;w.addEventListener("beforeinstallprompt",function(e){e.preventDefault();w.__PWA_DEFERRED_INSTALL=e;});var n=navigator;var ua=n.userAgent||"";var ios=/iPhone|iPad|iPod/i.test(ua)||(n.platform==="MacIntel"&&n.maxTouchPoints>1);var android=/Android/i.test(ua);var standalone=!!n.standalone||w.matchMedia("(display-mode: standalone)").matches||w.matchMedia("(display-mode: fullscreen)").matches;if((ios||android)&&!standalone){var d=document.createElement("div");d.id="pwa-install-boot-gate";d.setAttribute("aria-hidden","true");d.style.cssText="position:fixed;inset:0;z-index:50;background:rgba(0,0,0,0.7)";(document.body||document.documentElement).appendChild(d);}}catch(e){}})();`;
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __PWA_DEFERRED_INSTALL?: BeforeInstallPromptEvent | null;
  }
}

export function takeDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  if (typeof window === "undefined") return null;
  return window.__PWA_DEFERRED_INSTALL ?? null;
}

export function removePwaInstallBootGate(): void {
  if (typeof document === "undefined") return;
  document.getElementById("pwa-install-boot-gate")?.remove();
}
