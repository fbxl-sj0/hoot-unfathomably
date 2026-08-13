/*
    Project: Hoot Unfathomably
    --------------------------

    File: BrandMark.tsx

    Purpose:

        Render the canonical Unfathomably galaxy mark in native layouts.

    Responsibilities:

        - Present the shared high-resolution transparent brand asset
        - Give the otherwise decorative mark an accessible identity
        - Keep brand image sizing consistent between authentication screens

    This file intentionally does NOT contain:

        - App icon or splash-screen generation
        - Instance-provided logos
        - Navigation behavior
*/

import React from "react";
import { Image, StyleProp, ImageStyle } from "react-native";

export interface BrandMarkProps {
  size?: number;
  style?: StyleProp<ImageStyle>;
}

export default function BrandMark({ size = 72, style }: BrandMarkProps) {
  return (
    <Image
      accessibilityLabel="Unfathomably galaxy logo"
      resizeMode="contain"
      source={require("../assets/images/unfathomably-mark.png")}
      style={[{ height: size, width: size }, style]}
    />
  );
}

/* end of BrandMark.tsx */
