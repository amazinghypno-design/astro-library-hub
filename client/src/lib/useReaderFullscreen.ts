import { useCallback, useEffect, useState } from "react";
import type { RefObject } from "react";

/**
 * Fullscreen for a reader, made to behave the same on every device people
 * actually use — which the Fullscreen API on its own does not.
 *
 * iPhone Safari has never supported Element.requestFullscreen (only <video>
 * goes fullscreen there), and iPadOS only gained it recently. So the state
 * here is OURS, and the component styles itself as a fixed, full-viewport
 * layer whenever it is set. The native call is an enhancement on top: where it
 * works (Android Chrome, desktop, newer iPad) it also hides the browser
 * chrome, and where it does not, the CSS layer alone still fills the screen.
 *
 * Same story for orientation: screen.orientation.lock() turns a landscape
 * document to landscape automatically on Android, and does nothing at all on
 * iOS — which is exactly why callers still need to ask the reader to rotate
 * (see RotateDeviceOverlay) rather than assuming the lock worked.
 */

interface WebkitFullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => void;
}

interface WebkitFullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
}

interface LockableOrientation extends ScreenOrientation {
  lock?: (orientation: "landscape" | "portrait" | "any") => Promise<void>;
}

function nativeFullscreenElement(): Element | null {
  const doc = document as WebkitFullscreenDocument;
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export interface ReaderFullscreen {
  isFullscreen: boolean;
  enter: () => void;
  exit: () => void;
  toggle: () => void;
}

export function useReaderFullscreen(elementRef: RefObject<HTMLElement | null>, options?: { preferLandscape?: boolean }): ReaderFullscreen {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const preferLandscape = options?.preferLandscape ?? false;

  const enter = useCallback(() => {
    setIsFullscreen(true);
    const el = elementRef.current as WebkitFullscreenElement | null;
    if (el) {
      // navigationUI:"hide" asks Android Chrome for the address bar too.
      const request = el.requestFullscreen?.({ navigationUI: "hide" }) ?? (el.webkitRequestFullscreen?.(), undefined);
      void Promise.resolve(request).catch(() => {
        // Denied or unsupported — the CSS layer is already carrying it.
      });
    }
    if (preferLandscape) {
      const orientation = screen.orientation as LockableOrientation | undefined;
      void orientation?.lock?.("landscape").catch(() => {
        // iOS, or a device the user is holding locked — RotateDeviceOverlay asks instead.
      });
    }
  }, [elementRef, preferLandscape]);

  const exit = useCallback(() => {
    setIsFullscreen(false);
    const orientation = screen.orientation as LockableOrientation | undefined;
    try {
      orientation?.unlock?.();
    } catch {
      // Never supported everywhere; nothing to undo if it is not.
    }
    if (nativeFullscreenElement()) {
      const doc = document as WebkitFullscreenDocument;
      void Promise.resolve(document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.()).catch(() => {});
    }
  }, []);

  const toggle = useCallback(() => (isFullscreen ? exit() : enter()), [isFullscreen, enter, exit]);

  // The browser can leave fullscreen without us: Escape, the Android back
  // gesture, a swipe down. Follow it so our own state never lies.
  useEffect(() => {
    function onChange() {
      if (!nativeFullscreenElement()) setIsFullscreen(false);
    }
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  // Escape has to be handled by hand for the CSS-only path, where the browser
  // has no fullscreen of its own to leave.
  useEffect(() => {
    if (!isFullscreen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") exit();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen, exit]);

  // Stop the page behind the reader from scrolling under it — on iOS that
  // otherwise shows up as the layer sliding around with rubber-band scrolling.
  useEffect(() => {
    if (!isFullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isFullscreen]);

  return { isFullscreen, enter, exit, toggle };
}

/**
 * What a reader exposes to the page around it, so a "read fullscreen" button
 * outside the reader opens the reader's OWN fullscreen — the one that keeps
 * the pen, highlighter and capture toolbar — rather than handing the raw file
 * to the browser's built-in viewer, which has none of them.
 */
export interface ReaderHandle {
  enterFullscreen: () => void;
}
