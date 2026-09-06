// the space switcher as a RAIL-HEAD menu, shipped AS A PACK.
//
// No reimplementation here. `SWITCHER_DROPDOWN` is published on the host's
// EXTERNALS contract (`host-externals.ts`) beside `SWITCHER_RAIL`, so this pack
// contributes the REAL component. What differs from `classic-switcher` is the
// implementation's own `placement: "rail-head"`: the frame reads that field to
// mount the switcher inside the session rail's head rather than in its own
// column, and the grid's switcher track collapses to 0 (`app-shell.tsx`). That
// is the whole point of the `phone` layout — a 56px column is a sixth of a
// 390px screen.
import { SWITCHER_DROPDOWN } from "@fraym/ui";

export const implementation = SWITCHER_DROPDOWN;

/** The bundle contract (doc 68 §16.2): the host takes the default export. */
export default SWITCHER_DROPDOWN.component;
