import { useEffect, useState } from "react";

export type Orientation = "portrait" | "landscape";

/**
 * Orientation from the viewport's actual shape rather than screen.orientation,
 * which reports the device's physical rotation: those disagree on a tablet in
 * a split-screen or slide-over window, and the reader cares about the box it
 * has been given, not how the hardware is being held.
 *
 * visualViewport is preferred where it exists because iOS reports innerHeight
 * without accounting for the dynamic toolbars, which is what makes a "full
 * height" layout hide its own bottom bar behind Safari's.
 */
export function useOrientation(): Orientation {
  const [orientation, setOrientation] = useState<Orientation>(() => readOrientation());

  useEffect(() => {
    const update = () => setOrientation(readOrientation());
    // Four sources because no single one is reliable everywhere: screen
    // orientation is the most direct signal of a rotation but is absent on
    // older iOS, the deprecated orientationchange still covers those, resize
    // catches window and split-view changes on tablets, and visualViewport
    // catches the on-screen keyboard and iOS toolbar reflows that the others
    // miss. They are idempotent, so firing several times costs nothing.
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.visualViewport?.addEventListener("resize", update);
    screen.orientation?.addEventListener("change", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
      screen.orientation?.removeEventListener("change", update);
    };
  }, []);

  return orientation;
}

function readOrientation(): Orientation {
  const width = window.visualViewport?.width ?? window.innerWidth;
  const height = window.visualViewport?.height ?? window.innerHeight;
  return width >= height ? "landscape" : "portrait";
}

/**
 * True for touch-first devices — phones and tablets — so the rotate prompt and
 * the larger touch targets are only offered where they mean something. Based
 * on input capability rather than screen width or user-agent sniffing: a
 * narrow desktop window is still a mouse, and an iPad reports a desktop-class
 * user agent by default.
 */
export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(() => window.matchMedia("(pointer: coarse)").matches);

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const update = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isTouch;
}
