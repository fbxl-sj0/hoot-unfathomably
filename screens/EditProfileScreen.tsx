/*
    Project: Hoot Unfathomably
    --------------------------

    File: EditProfileScreen.tsx

    Purpose:

        Edit the authenticated Fediverse profile and keep local account state current.

    Responsibilities:

        - Edit profile text, metadata, and standard privacy flags
        - Select optional avatar and header images from the system picker
        - Persist the authoritative account returned by the server
        - Refresh both active and saved account contexts

    This file intentionally does NOT contain:

        - profile request encoding
        - image cropping
        - account relationship controls
*/

import Icon from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import React, { useRef, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
} from "react-native";
import { useDispatch } from "react-redux";

import AppButton from "../components/AppButton";
import SuggestLogin from "../components/SuggestLogin";
import { stripHtml } from "../components/StatusCard";
import { Text, TextInput, View } from "../components/Themed";
import { SCROLL_FORM_BOTTOM_PADDING } from "../constants/TouchTargets";
import useTheme from "../hooks/useTheme";
import { useLotideCtx } from "../hooks/useLotideCtx";
import * as StorageService from "../services/StorageService";
import {
  ProfileFieldInput,
  ProfileImageInput,
  updateProfile,
} from "../services/UnfathomablyProfileService";
import type { UnfathomablyAccount } from "../services/UnfathomablyService";
import { setCtx } from "../slices/lotideSlice";
import type { RootStackScreenProps } from "../types";
import { getErrorMessage } from "../utils/error";

type ImageKind = "avatar" | "header";

export default function EditProfileScreen({
  navigation,
}: RootStackScreenProps<"EditProfile">) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const dispatch = useDispatch();
  const account = ctx?.login?.user as unknown as
    UnfathomablyAccount | undefined;
  const [displayName, setDisplayName] = useState(account?.display_name || "");
  const [note, setNote] = useState(stripHtml(account?.note || ""));
  const [locked, setLocked] = useState(account?.locked === true);
  const [bot, setBot] = useState(account?.bot === true);
  const [discoverable, setDiscoverable] = useState(
    account?.discoverable !== false,
  );
  const [fields, setFields] = useState<ProfileFieldInput[]>(() => {
    const existing = (account?.fields || []).slice(0, 4).map(field => ({
      name: stripHtml(field.name),
      value: stripHtml(field.value),
    }));
    return existing.length > 0 ? existing : [{ name: "", value: "" }];
  });
  const [avatar, setAvatar] = useState<ProfileImageInput>();
  const [header, setHeader] = useState<ProfileImageInput>();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  if (!ctx?.login || !account) return <SuggestLogin />;

  async function chooseImage(kind: ImageKind) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photo access is off",
        "Allow photo access in Android settings to choose a profile image.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      mediaTypes: ["images"],
      quality: 0.9,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset?.uri) return;
    const image: ProfileImageInput = {
      mimeType: asset.mimeType || "image/jpeg",
      name: asset.fileName || `${kind}.jpg`,
      uri: asset.uri,
    };
    if (kind === "avatar") setAvatar(image);
    else setHeader(image);
  }

  function updateField(index: number, change: Partial<ProfileFieldInput>) {
    setFields(current =>
      current.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...change } : field,
      ),
    );
  }

  async function save() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const updated = await updateProfile(ctx!, {
        avatar,
        bot,
        discoverable,
        displayName,
        fields: fields.filter(field => field.name.trim() || field.value.trim()),
        header,
        locked,
        note,
      });
      const nextContext: LotideContext = {
        ...ctx!,
        login: { ...ctx!.login!, user: updated as unknown as Login["user"] },
      };
      await Promise.all([
        StorageService.lotideContext.store(nextContext),
        StorageService.lotideContextKV.store(nextContext),
      ]);
      dispatch(setCtx(nextContext));
      navigation.goBack();
    } catch (reason) {
      Alert.alert("Could not update profile", getErrorMessage(reason));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.root}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.images}>
        <Pressable
          accessibilityLabel="Choose profile picture"
          accessibilityRole="button"
          onPress={() => void chooseImage("avatar")}
          style={styles.imageAction}
        >
          <Image
            source={{ uri: avatar?.uri || account.avatar }}
            style={styles.avatar}
          />
          <Text tint>Change picture</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Choose profile header"
          accessibilityRole="button"
          onPress={() => void chooseImage("header")}
          style={styles.imageAction}
        >
          {header?.uri || account.header ? (
            <Image
              source={{ uri: header?.uri || account.header }}
              style={styles.headerImage}
            />
          ) : (
            <View
              style={[
                styles.headerImage,
                styles.headerFallback,
                { backgroundColor: theme.secondaryBackground },
              ]}
            >
              <Icon
                name="image-outline"
                color={theme.secondaryText}
                size={28}
              />
            </View>
          )}
          <Text tint>Change header</Text>
        </Pressable>
      </View>
      <Text secondary>Display name</Text>
      <TextInput
        accessibilityLabel="Display name"
        maxLength={200}
        onChangeText={setDisplayName}
        style={styles.input}
        value={displayName}
      />
      <Text secondary>Bio</Text>
      <TextInput
        accessibilityLabel="Profile bio"
        maxLength={5_000}
        multiline
        onChangeText={setNote}
        style={styles.bio}
        textAlignVertical="top"
        value={note}
      />

      <Text style={styles.sectionTitle}>Profile fields</Text>
      {fields.map((field, index) => (
        <View key={`field-${index}`} style={styles.field}>
          <TextInput
            accessibilityLabel={`Profile field ${index + 1} name`}
            maxLength={255}
            onChangeText={value => updateField(index, { name: value })}
            placeholder="Label"
            style={styles.fieldName}
            value={field.name}
          />
          <TextInput
            accessibilityLabel={`Profile field ${index + 1} value`}
            maxLength={2_048}
            onChangeText={value => updateField(index, { value })}
            placeholder="Value or link"
            style={styles.fieldValue}
            value={field.value}
          />
          {fields.length > 1 ? (
            <Pressable
              accessibilityLabel={`Remove profile field ${index + 1}`}
              accessibilityRole="button"
              onPress={() =>
                setFields(current =>
                  current.filter((_field, fieldIndex) => fieldIndex !== index),
                )
              }
              style={styles.removeField}
            >
              <Icon name="remove-circle-outline" color={theme.red} size={25} />
            </Pressable>
          ) : null}
        </View>
      ))}
      {fields.length < 4 ? (
        <AppButton
          color={theme.secondaryTint}
          onPress={() =>
            setFields(current => [...current, { name: "", value: "" }])
          }
          title="Add profile field"
        />
      ) : null}

      <Text style={styles.sectionTitle}>Profile preferences</Text>
      <PreferenceSwitch
        label="Manually approve followers"
        onChange={setLocked}
        value={locked}
      />
      <PreferenceSwitch
        label="This is an automated account"
        onChange={setBot}
        value={bot}
      />
      <PreferenceSwitch
        label="Suggest this profile to others"
        onChange={setDiscoverable}
        value={discoverable}
      />
      <AppButton
        disabled={saving}
        fullWidth
        onPress={() => void save()}
        title={saving ? "Saving profile..." : "Save profile"}
      />
    </ScrollView>
  );
}

function PreferenceSwitch({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: boolean) => void;
  value: boolean;
}) {
  return (
    <View style={styles.preference}>
      <Text style={styles.preferenceLabel}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        onValueChange={onChange}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 10,
    padding: 16,
    paddingBottom: SCROLL_FORM_BOTTOM_PADDING,
  },
  images: { alignItems: "flex-start", flexDirection: "row", gap: 20 },
  imageAction: { alignItems: "center", gap: 5, minHeight: 48 },
  avatar: { borderRadius: 42, height: 84, width: 84 },
  headerImage: { borderRadius: 8, height: 84, width: 168 },
  headerFallback: { alignItems: "center", justifyContent: "center" },
  input: { fontSize: 17, minHeight: 48 },
  bio: { minHeight: 130, paddingTop: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginTop: 8 },
  field: { alignItems: "center", flexDirection: "row", gap: 6 },
  fieldName: { flex: 0.7, minHeight: 48 },
  fieldValue: { flex: 1.3, minHeight: 48 },
  removeField: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    minWidth: 48,
  },
  preference: { alignItems: "center", flexDirection: "row", minHeight: 52 },
  preferenceLabel: { flex: 1 },
});

/* end of EditProfileScreen.tsx */
