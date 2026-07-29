/*
    Project: Hoot Mobile
    -------------------

    File: StyledText.tsx

    Purpose:

        Provide themed text wrappers used by legacy screens.

    Responsibilities:

        - Expose mono and default text variants
        - Keep text color aligned with the active theme

    This file intentionally does NOT contain:

        - rich HTML rendering
        - layout containers
*/

import * as React from 'react';

import { Text, TextProps } from './Themed';

export function MonoText(props: TextProps) {
  return <Text {...props} style={[props.style, { fontFamily: 'space-mono' }]} />;
}

/* end of StyledText.tsx */
