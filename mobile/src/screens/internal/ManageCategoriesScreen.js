import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, RefreshControl, TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api/client';
import { Button, Card } from '../../components/ui';
import { colors, spacing, radius } from '../../theme';

// Admin/Manager: manage the Category → Sub-category taxonomy used in enquiries
// and the supplier form. Additions are saved permanently.
export default function ManageCategoriesScreen({ navigation }) {
  const [categories, setCategories] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [subInputs, setSubInputs] = useState({}); // catId -> text
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setCategories(await api('/categories')); } catch (e) { Alert.alert('Error', e.message); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addCategory = async () => {
    if (!newCat.trim()) return;
    setBusy(true);
    try {
      await api('/categories', { method: 'POST', body: { name: newCat.trim() } });
      setNewCat('');
      await load();
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setBusy(false); }
  };

  const addSub = async (catId) => {
    const name = (subInputs[catId] || '').trim();
    if (!name) return;
    try {
      await api(`/categories/${catId}/subcategories`, { method: 'POST', body: { name } });
      setSubInputs((s) => ({ ...s, [catId]: '' }));
      await load();
    } catch (e) { Alert.alert('Error', e.message); }
  };

  const removeSub = async (subId) => {
    try { await api(`/categories/subcategories/${subId}`, { method: 'DELETE' }); await load(); }
    catch (e) { Alert.alert('Error', e.message); }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <Text style={styles.h1}>Categories</Text>
      <Text style={styles.sub}>Used in the customer enquiry form and to drive the supplier quotation fields.</Text>

      <Card>
        <Text style={styles.label}>Add a category</Text>
        <View style={styles.row}>
          <TextInput value={newCat} onChangeText={setNewCat} placeholder="e.g. Plumbing" placeholderTextColor={colors.muted} style={styles.input} />
          <Button title="Add" onPress={addCategory} loading={busy} style={{ paddingHorizontal: 18 }} />
        </View>
      </Card>

      {categories.map((c) => (
        <Card key={c.id}>
          <Text style={styles.catName}>{c.name}</Text>
          <View style={styles.chips}>
            {(c.subcategories || []).map((s) => (
              <TouchableOpacity
                key={s.id}
                style={styles.chip}
                onPress={() => navigation.navigate('SubcategoryFields', { subId: s.id, name: s.name, fields: s.fields })}
                onLongPress={() => removeSub(s.id)}
              >
                <Text style={styles.chipText}>{s.name}</Text>
                {Array.isArray(s.fields) && s.fields.length ? <Text style={styles.chipCount}>  ·{s.fields.length}f</Text> : null}
              </TouchableOpacity>
            ))}
            {(c.subcategories || []).length === 0 ? <Text style={styles.muted}>No sub-categories yet.</Text> : null}
          </View>
          <View style={styles.row}>
            <TextInput
              value={subInputs[c.id] || ''}
              onChangeText={(v) => setSubInputs((s) => ({ ...s, [c.id]: v }))}
              placeholder="Add sub-category"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <Button title="Add" variant="ghost" onPress={() => addSub(c.id)} style={{ paddingHorizontal: 18 }} />
          </View>
        </Card>
      ))}
      <Text style={styles.hint}>Long-press a sub-category to remove it.</Text>
      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 22, fontWeight: '800', color: colors.text },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2, marginBottom: spacing.lg },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginTop: spacing.sm },
  input: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: colors.text },
  catName: { fontSize: 16, fontWeight: '800', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primary },
  chipText: { color: colors.primaryDark, fontWeight: '700', fontSize: 12 },
  chipCount: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 13 },
  hint: { color: colors.muted, fontSize: 12, marginTop: spacing.md },
});
