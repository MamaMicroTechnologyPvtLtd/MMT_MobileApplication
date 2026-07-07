import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Linking } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { uploadFile, fileUrl } from '../api/client';
import { colors, radius, spacing } from '../theme';

const TYPE_MAP = {
  image: ['image/*'],
  video: ['video/*'],
  document: ['application/pdf', 'image/*'],
  any: ['application/pdf', 'image/*', 'video/*'],
};

// Pick a file, upload it, and report the served URL via onChange. Shows the
// current attachment with a link to view and a re-pick option.
export default function UploadField({ label, value, onChange, kind = 'document', icon = '📎' }) {
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: TYPE_MAP[kind] || TYPE_MAP.any,
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      setBusy(true);
      const up = await uploadFile(res.assets[0]);
      onChange(up.url);
    } catch (e) {
      Alert.alert('Upload failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        <TouchableOpacity style={[styles.picker, value && styles.pickerDone]} onPress={pick} disabled={busy}>
          {busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.pickerText} numberOfLines={1}>
              {icon}  {value ? 'Attached — tap to replace' : 'Tap to attach'}
            </Text>
          )}
        </TouchableOpacity>
        {value ? (
          <TouchableOpacity style={styles.view} onPress={() => Linking.openURL(fileUrl(value))}>
            <Text style={styles.viewText}>View</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'stretch' },
  picker: {
    flex: 1, borderWidth: 1, borderColor: colors.primary, borderStyle: 'dashed',
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center', minHeight: 46,
  },
  pickerDone: { borderStyle: 'solid', backgroundColor: colors.primaryLight },
  pickerText: { color: colors.primary, fontWeight: '600' },
  view: {
    paddingHorizontal: 16, justifyContent: 'center', borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  viewText: { color: '#fff', fontWeight: '700' },
});
