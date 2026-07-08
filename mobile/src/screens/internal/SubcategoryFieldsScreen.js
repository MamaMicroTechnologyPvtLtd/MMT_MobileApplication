import React, { useState, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, TextInput,
} from 'react-native';
import { api } from '../../api/client';
import { Button, Card } from '../../components/ui';
import { colors, spacing, radius } from '../../theme';

const TYPES = [
  ['text', 'Text'],
  ['number', 'Number'],
];

// Admin/Manager: define the fields a supplier fills when quoting for this
// sub-category. These render dynamically in the supplier's reply form.
export default function SubcategoryFieldsScreen({ route, navigation }) {
  const { subId, name, fields: initial } = route.params;
  const [fields, setFields] = useState(Array.isArray(initial) ? initial : []);
  const [label, setLabel] = useState('');
  const [type, setType] = useState('text');
  const [saving, setSaving] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: `Fields · ${name}` });
  }, [navigation, name]);

  const slug = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  const addField = () => {
    if (!label.trim()) return;
    const key = slug(label);
    if (!key) { Alert.alert('Invalid', 'Enter a valid field name.'); return; }
    if (fields.some((f) => f.key === key)) { Alert.alert('Duplicate', 'A field with this name already exists.'); return; }
    setFields([...fields, { key, label: label.trim(), type }]);
    setLabel('');
    setType('text');
  };

  const remove = (key) => setFields(fields.filter((f) => f.key !== key));

  const save = async () => {
    setSaving(true);
    try {
      await api(`/categories/subcategories/${subId}`, { method: 'PATCH', body: { fields } });
      Alert.alert('Saved', 'Supplier fields updated for this sub-category.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
      <Text style={styles.h1}>Supplier fields</Text>
      <Text style={styles.sub}>
        These extra fields appear in the supplier&apos;s quotation form when the enquiry is
        <Text style={{ fontWeight: '800' }}> {name}</Text>.
      </Text>

      <Card>
        {fields.length === 0 ? (
          <Text style={styles.muted}>No custom fields yet — the supplier sees the standard form.</Text>
        ) : fields.map((f) => (
          <View key={f.key} style={styles.fieldRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>{f.label}</Text>
              <Text style={styles.fieldMeta}>{f.key} · {f.type}</Text>
            </View>
            <TouchableOpacity onPress={() => remove(f.key)} style={styles.removeBtn}>
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          </View>
        ))}
      </Card>

      <Text style={styles.section}>Add a field</Text>
      <Card>
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder="Field label (e.g. Brand, Grade, Packaging)"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        <View style={styles.typeRow}>
          {TYPES.map(([k, lbl]) => (
            <TouchableOpacity key={k} onPress={() => setType(k)} style={[styles.typeItem, type === k && styles.typeItemOn]}>
              <Text style={[styles.typeText, type === k && styles.typeTextOn]}>{lbl}</Text>
            </TouchableOpacity>
          ))}
          <View style={{ flex: 1 }} />
          <Button title="Add field" variant="ghost" onPress={addField} style={{ paddingHorizontal: 18 }} />
        </View>
      </Card>

      <Button title="Save fields" onPress={save} loading={saving} />
      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 22, fontWeight: '800', color: colors.text },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2, marginBottom: spacing.lg, lineHeight: 18 },
  section: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  muted: { color: colors.muted, fontSize: 13 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  fieldLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  fieldMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  removeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.danger },
  removeText: { color: colors.danger, fontWeight: '700', fontSize: 12 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, marginBottom: spacing.md },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeItem: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  typeItemOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  typeTextOn: { color: '#fff' },
});
