// One WebGL room at a time. The hero and the closing section each show the room, four sections apart, never both on
// screen. Each holds a canvas only while it owns the slot: the section that most recently came near the viewport.
// The other drops its context (and its environment map, refraction buffer, composer targets) and shows its static
// frame, so the page never holds two contexts' worth of GPU memory.
import { createContext } from "react";
import type { PosterVariant } from "./ObservatoryPoster";

export type RoomOwner = PosterVariant | null;

export type RoomSlot = {
  owner: RoomOwner;
  claim: (who: PosterVariant) => void;
  /**
   * Times the performance monitor stepped the room down this visit. Shared, so a GPU that could not hold the hero
   * does not make the closing section mount the full room, compile and decline all over again.
   */
  declines: number;
  decline: () => void;
  /**
   * The device cannot run the room this visit: no context (none at all, or only a slow software fallback the browser
   * refused), a software rasteriser, or a scene that threw. Shared, so the other section does not try again.
   */
  unusable: boolean;
  markUnusable: () => void;
};

/** May this section hold a canvas? Without a provider (a stage used on its own) it always may. */
export function mayHoldRoom(
  slot: RoomSlot | null,
  who: PosterVariant,
): boolean {
  return !slot || slot.owner === who;
}

export const RoomSlotContext = createContext<RoomSlot | null>(null);
