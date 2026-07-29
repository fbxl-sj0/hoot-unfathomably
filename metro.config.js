/*
    Project: Hoot Mobile
    -------------------

    File: metro.config.js

    Purpose:

        Configure Metro for the Expo React Native application.

    Responsibilities:

        - Load Expo's default Metro configuration
        - Export the bundler configuration used by native and web builds

    This file intentionally does NOT contain:

        - Babel transformation rules
        - application runtime code
        - native Android build configuration
*/

const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = config;

/* end of metro.config.js */
