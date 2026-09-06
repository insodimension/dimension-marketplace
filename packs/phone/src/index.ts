// Phone is a LAYOUT plugin: its whole contribution is DATA - four slots and a
// space that binds the SAME packs Code (Assembled) binds, except the switcher,
// which is `phone-switcher` (`placement: "rail-head"`) so no column is spent
// on it. Zero pixels, zero runtime, no reimplementation anywhere in the chain.
//
// What this space is FOR: it is what Dimension Mobile mounts
// (`enabledSpaces: ["phone"]`), and on a desktop it is the honest preview of
// what a phone sees — pick it in the switcher and narrow the window.
export {};
