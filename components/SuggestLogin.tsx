/*
    Project: Hoot Mobile
    -------------------

    File: SuggestLogin.tsx

    Purpose:

        Prompt anonymous users to choose a host and sign in.

    Responsibilities:

        - Show the login call-to-action
        - Coordinate host selection before showing the login form
        - Preview the selected host's public theme before authentication

    This file intentionally does NOT contain:

        - credential storage
        - post-login navigation
*/

import React, { useState } from "react";
import { StyleSheet } from "react-native";
import { useDispatch } from "react-redux";
import { View } from "./Themed";
import HostList from "./HostList";
import Login from "./Login";
import { setCtx } from "../slices/lotideSlice";

export default function SuggestLogin() {
  const dispatch = useDispatch();
  const [hostName, setHostName] = useState<string>();
  const [domain, setDomain] = useState<string>();
  const [username, setUsername] = useState<string>();

  function selectHost(
    selectedDomain: string,
    selectedName?: string,
    selectedUsername?: string,
  ) {
    setHostName(selectedName);
    setDomain(selectedDomain);
    setUsername(selectedUsername);

    /*
        A server selection without a login is an in-memory preview context.
        It lets the public theme provider style the login screen while keeping
        account tokens and the persisted active profile untouched.
    */
    dispatch(setCtx({ apiUrl: selectedDomain }));
  }

  function clearSelectedHost() {
    setDomain(undefined);
    dispatch(setCtx({}));
  }

  return (
    <View style={styles.root}>
      {!domain ? (
        <HostList
          onSelect={selectHost}
        />
      ) : (
        <Login
          hostName={hostName}
          domain={domain}
          username={username}
          onGoBack={clearSelectedHost}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    height: "100%",
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    width: "100%",
    marginBottom: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  actionButtons: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
  },
});

/* end of SuggestLogin.tsx */
