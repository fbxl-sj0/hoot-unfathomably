/*
    Project: Hoot Mobile
    -------------------

    File: NotFoundScreen.tsx

    Purpose:

        Render the fallback route for unknown links.

    Responsibilities:

        - Explain that the route is missing
        - Offer navigation back to the root screen

    This file intentionally does NOT contain:

        - deep link configuration
        - error recovery for API calls
*/

import * as React from 'react';
import { StyleSheet } from 'react-native';

import { RootStackScreenProps } from '../types';
import AppButton from '../components/AppButton';
import { Text, View } from '../components/Themed';
import useTheme from '../hooks/useTheme';

export default function NotFoundScreen({ navigation }: RootStackScreenProps<'NotFound'>) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Screen not found</Text>
      <Text secondary style={styles.message}>
        This link does not match a screen Hoot can open.
      </Text>
      <AppButton
        title="Go Home"
        onPress={() => navigation.replace('Root')}
        color={theme.tint}
        style={styles.button}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    marginTop: 10,
    textAlign: 'center',
  },
  button: {
    marginTop: 15,
  },
});

/* end of NotFoundScreen.tsx */
