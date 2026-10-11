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
};

/** May this section hold a canvas? Without a provider (a stage used on its own) it always may. */
export function mayHoldRoom(
  slot: RoomSlot | null,
  who: PosterVariant,
): boolean {
  return !slot || slot.owner === who;
}

export const RoomSlotContext = createContext<RoomSlot | null>(null);
