/*
    Project: Hoot Mobile
    -------------------

    File: TouchTargets.ts

    Purpose:

        Define shared touch-target sizing for phone controls.

    Responsibilities:

        - Keep tappable controls at a comfortable Android phone size
        - Provide shared hit slop for compact inline controls
        - Avoid repeated magic numbers across screens

    This file intentionally does NOT contain:

        - component styling
        - platform-specific gesture handling
        - accessibility labels or roles
*/

/*
    Android's Material guidance treats 48dp as the practical minimum touch
    target for phone controls. React Native layout units map to density
    independent pixels, so this constant can be used directly in styles.
*/
export const MINIMUM_TOUCH_TARGET_SIZE = 48;

/*
    Inline text controls cannot always reserve a full 48dp layout box without
    making rows look padded and uneven. Hit slop keeps those controls easy to
    tap while preserving the surrounding typography.
*/
export const TOUCH_TARGET_HIT_SLOP = {
  top: 12,
  right: 12,
  bottom: 12,
  left: 12,
};

/* end of TouchTargets.ts */
