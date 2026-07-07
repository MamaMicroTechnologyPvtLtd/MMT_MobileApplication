import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { api, uploadFile } from '../../api/client';
import { Button, Field, Card } from '../../components/ui';
import { colors, spacing, radius } from '../../theme';

const UNITS = ['hrs', 'days', 'weeks'];

// The supplier reply form: quotation PDF + duration (hrs/days/weeks) + note +
// submit. Used for the initial quotation and for Final Quotation / Final PO
// requests (the `stage` param decides which).
export default function SupplierReplyScreen({ route, navigation }) {
  const { orderId, stage, requirement, note: reqNote } = route.params;
  const isFinal = stage === 'final_quotation' || stage === 'final_po';
  const title = stage === 'final_po' ? 'Send Final PO'
    : stage === 'final_quotation' ? 'Send Final Quotation' : 'Reply with quotation';

  const [file, setFile] = useState(null);
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [duration, setDuration] = useState('');
  const [unit, setUnit] = useState('days');
  const [noteText, setNoteText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const pick = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets && res.assets[0]) setFile(res.assets[0]);
    } catch (e) {
      Alert.alert('Could not pick file', e.message);
    }
  };

  const submit = async () => {
    if (!file && !duration) {
      Alert.alert('Add details', 'Attach the quotation document and/or enter a duration.');
      return;
    }
    setSubmitting(true);
    try {
      let document_url;
      if (file) {
        setUploading(true);
        const up = await uploadFile(file);
        document_url = up.url;
        setUploading(false);
      }
      const quoteStage = stage === 'requirement' ? 'quotation' : stage;
      await api(`/orders/${orderId}/quotations`, {
        method: 'POST',
        body: {
          price: price ? Number(price) : undefined,
          quantity: quantity || undefined,
          duration: duration || undefined,
          duration_unit: unit,
          note: noteText || undefined,
          document_url,
          stage: quoteStage,
        },
      });
      Alert.alert('Submitted', 'Your response has been sent to the MMT team.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Could not submit', e.message);
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
      <Text style={styles.oid}>{orderId}</Text>
      <Text style={styles.h1}>{title}</Text>

      <Card>
        <Text style={styles.reqLabel}>Requirement</Text>
        <Text style={styles.reqText}>{requirement || '—'}</Text>
        {reqNote ? <Text style={styles.reqNote}>Note: {reqNote}</Text> : null}
      </Card>

      <Card>
        <Text style={styles.section}>Quotation document {isFinal ? '(PO / final)' : '(PDF)'}</Text>
        <TouchableOpacity style={styles.picker} onPress={pick}>
          <Text style={styles.pickerIcon}>{file ? '📎' : '⬆️'}</Text>
          <Text style={styles.pickerText} numberOfLines={1}>
            {file ? file.name : 'Tap to attach a PDF or image'}
          </Text>
        </TouchableOpacity>

        <Field label="Quoted price (optional)" value={price} onChangeText={setPrice} placeholder="e.g. 340" keyboardType="numeric" />
        <Field label="Quantity (optional)" value={quantity} onChangeText={setQuantity} placeholder="e.g. 200 bags" />

        <Text style={styles.label}>Duration</Text>
        <View style={styles.durationRow}>
          <Field
            value={duration}
            onChangeText={setDuration}
            placeholder="e.g. 3"
            keyboardType="numeric"
            style={{ flex: 1 }}
          />
          <View style={styles.units}>
            {UNITS.map((u) => (
              <TouchableOpacity key={u} onPress={() => setUnit(u)} style={[styles.unit, unit === u && styles.unitOn]}>
                <Text style={[styles.unitText, unit === u && styles.unitTextOn]}>{u}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Field label="Note (condition / policy / rules)" value={noteText} onChangeText={setNoteText} placeholder="Any conditions" multiline />
      </Card>

      <Button title={uploading ? 'Uploading…' : 'Submit response'} onPress={submit} loading={submitting} />
      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  oid: { fontSize: 13, fontWeight: '800', color: colors.primary },
  h1: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 2, marginBottom: spacing.md },
  reqLabel: { fontSize: 12, color: colors.muted, fontWeight: '700' },
  reqText: { fontSize: 15, color: colors.text, marginTop: 2 },
  reqNote: { fontSize: 13, color: colors.muted, marginTop: 4, fontStyle: 'italic' },
  section: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  picker: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.primary, borderStyle: 'dashed',
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  pickerIcon: { fontSize: 20 },
  pickerText: { flex: 1, color: colors.primary, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  durationRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', marginBottom: spacing.md },
  units: { flexDirection: 'row', gap: 6 },
  unit: {
    paddingHorizontal: 12, paddingVertical: 12, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  unitOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  unitText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  unitTextOn: { color: '#fff' },
});
