/* ============================================================
   Progressive disclosure for stepper forms.

   A step is revealed only once every earlier step's gate() passes,
   so the form guides the user one action at a time instead of
   showing every field (and a wall of explanatory text) at once.

   State is recomputed on each update() (non-monotonic): clearing
   inputs or saving naturally collapses the later steps again.
   ============================================================ */

/**
 * @param {{ el: HTMLElement|null, gate?: () => boolean }[]} steps
 *   Ordered steps. The first is always visible; each later step
 *   appears when all preceding gates return true. A step without a
 *   gate is treated as "always complete" (used for the last step).
 */
export function createStepFlow(steps) {
  const list = (steps || []).filter((s) => s && s.el);
  function update() {
    let prevDone = true;
    for (const s of list) {
      s.el.classList.toggle("locked", !prevDone);
      prevDone = prevDone && (s.gate ? !!s.gate() : true);
    }
  }
  return { update };
}
