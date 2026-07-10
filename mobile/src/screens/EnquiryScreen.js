import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, RefreshControl, TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { Button, Field, Card, Badge, EmptyState } from '../components/ui';
import { colors, spacing } from '../theme';

// The Customer home: FIRST the form to send an enquiry to Internal, then the
// customer's own recent enquiries with their status.
const emptyItem = () => ({ categoryId: null, category: '', subcategory: '', quantity: '', unit: '' });

export default function EnquiryScreen() {
  const empty = { subject: '', message: '', target_price: '', pincode: '', contact_phone: '' };
  const [form, setForm] = useState(empty);
  const [projectMode, setProjectMode] = useState('new'); // 'new' | 'existing'
  const [projectId, setProjectId] = useState(null);
  const [projects, setProjects] = useState([]);
  const [categories, setCategories] = useState([]);
  // Each item = one material: category + subcategory + quantity + unit.
  const [items, setItems] = useState([emptyItem()]);
  const [submitting, setSubmitting] = useState(false);
  const [enquiries, setEnquiries] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const setItem = (idx, patch) => setItems((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const addItem = () => setItems((rows) => [...rows, emptyItem()]);
  const removeItem = (idx) => setItems((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== idx) : rows));
  const pickCategory = (idx, c) => setItem(idx, { categoryId: c.id, category: c.name, subcategory: '' });
  const pickSubcategory = (idx, s) => setItem(idx, { subcategory: s.name });

  const load = useCallback(async () => {
    try {
      const [enq, proj, cats] = await Promise.all([
        api('/enquiries'),
        api('/projects/mine').catch(() => []),
        api('/categories').catch(() => []),
      ]);
      setEnquiries(enq);
      setProjects(proj);
      setCategories(cats);
    } catch (e) {
      // silently ignore on the home list; the form still works
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onSubmit = async () => {
    if (!form.message.trim()) {
      Alert.alert('Requirement needed', 'Please describe what you need in the requirement box.');
      return;
    }
    if (projectMode === 'existing' && !projectId) {
      Alert.alert('Select a project', 'Choose an existing project, or switch to "New project".');
      return;
    }
    const cleanItems = items
      .map((it) => ({ category: it.category, subcategory: it.subcategory, quantity: it.quantity.trim(), unit: it.unit.trim() }))
      .filter((it) => it.category || it.quantity || it.unit);
    if (cleanItems.length === 0 || !cleanItems.some((it) => it.category)) {
      Alert.alert('Add a material', 'Choose at least one category (and its quantity/unit).');
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        ...form,
        items: cleanItems,
        project_id: projectMode === 'existing' ? projectId : undefined,
      };
      const created = await api('/enquiries', { method: 'POST', body });
      Alert.alert('Enquiry sent', `Your enquiry ${created.enquiry_id} (${cleanItems.length} material${cleanItems.length > 1 ? 's' : ''}) has been sent to the MMT team.`);
      setForm(empty);
      setProjectId(null);
      setProjectMode('new');
      setItems([emptyItem()]);
      load();
    } catch (e) {
      Alert.alert('Could not send', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <Text style={styles.h1}>Send an enquiry</Text>
      <Text style={styles.sub}>Tell us what you need. Our team will get back with a quotation.</Text>

      <Card>
        <Text style={styles.label}>This enquiry is for</Text>
        <View style={styles.seg}>
          {['new', 'existing'].map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => setProjectMode(m)}
              style={[styles.segItem, projectMode === m && styles.segItemOn]}
            >
              <Text style={[styles.segText, projectMode === m && styles.segTextOn]}>
                {m === 'new' ? 'A new project' : 'An existing project'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {projectMode === 'existing' ? (
          projects.length === 0 ? (
            <Text style={styles.hint}>No existing projects on your account. Choose &quot;A new project&quot;.</Text>
          ) : (
            <View style={styles.projList}>
              {projects.map((p) => (
                <TouchableOpacity
                  key={p.project_id}
                  onPress={() => setProjectId(p.project_id)}
                  style={[styles.projChip, projectId === p.project_id && styles.projChipOn]}
                >
                  <Text style={[styles.projText, projectId === p.project_id && styles.projTextOn]}>
                    #{p.project_id}{p.order_id ? ` · ${p.order_id}` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )
        ) : null}

        <Text style={styles.label}>Materials needed *</Text>
        <Text style={styles.hint}>Add every material your project needs — each with its own category, quantity and unit (e.g. Cement · 50 · bags, then Bricks · 200 · no).</Text>
        {items.map((it, idx) => {
          const cat = categories.find((c) => c.id === it.categoryId);
          return (
            <View key={idx} style={styles.itemBox}>
              <View style={styles.itemHead}>
                <Text style={styles.itemTitle}>Material {idx + 1}</Text>
                {items.length > 1 ? (
                  <TouchableOpacity onPress={() => removeItem(idx)}><Text style={styles.itemRemove}>✕ Remove</Text></TouchableOpacity>
                ) : null}
              </View>
              <View style={styles.projList}>
                {categories.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => pickCategory(idx, c)}
                    style={[styles.projChip, it.categoryId === c.id && styles.projChipOn]}
                  >
                    <Text style={[styles.projText, it.categoryId === c.id && styles.projTextOn]}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {cat && cat.subcategories?.length ? (
                <View style={styles.projList}>
                  {cat.subcategories.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      onPress={() => pickSubcategory(idx, s)}
                      style={[styles.subChip, it.subcategory === s.name && styles.projChipOn]}
                    >
                      <Text style={[styles.projText, it.subcategory === s.name && styles.projTextOn]}>{s.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
              <View style={styles.two}>
                <View style={styles.half}><Field label="Quantity" value={it.quantity} onChangeText={(v) => setItem(idx, { quantity: v })} placeholder="e.g. 50" keyboardType="numeric" /></View>
                <View style={styles.half}><Field label="Unit" value={it.unit} onChangeText={(v) => setItem(idx, { unit: v })} placeholder="bags / tons / no" /></View>
              </View>
            </View>
          );
        })}
        <TouchableOpacity onPress={addItem} style={styles.addItemBtn}>
          <Text style={styles.addItemText}>+ Add another material</Text>
        </TouchableOpacity>

        <Field label="Subject" value={form.subject} onChangeText={set('subject')} placeholder="Short title" />
        <Field label="Requirement *" value={form.message} onChangeText={set('message')} placeholder="Describe your overall requirement" multiline />
        <View style={styles.two}>
          <View style={styles.half}><Field label="Target price" value={form.target_price} onChangeText={set('target_price')} placeholder="₹ / unit" /></View>
          <View style={styles.half}><Field label="Project pincode" value={form.pincode} onChangeText={set('pincode')} placeholder="Site / delivery pincode" keyboardType="numeric" /></View>
        </View>
        <Field label="Contact phone" value={form.contact_phone} onChangeText={set('contact_phone')} placeholder="Best number to reach you" keyboardType="phone-pad" />
        <Button title="Send enquiry" onPress={onSubmit} loading={submitting} />
      </Card>

      <Text style={styles.h2}>Your recent enquiries</Text>
      {enquiries.length === 0 ? (
        <EmptyState icon="📝" title="No enquiries yet" subtitle="Your sent enquiries will appear here." />
      ) : (
        enquiries.map((e) => (
          <Card key={e.enquiry_id}>
            <View style={styles.cardTop}>
              <Text style={styles.enqId}>{e.enquiry_id}</Text>
              <Badge label={e.status} />
            </View>
            {e.subject ? <Text style={styles.enqSubject}>{e.subject}</Text> : null}
            <Text style={styles.enqMsg} numberOfLines={2}>{e.message}</Text>
            {Array.isArray(e.items) && e.items.length ? (
              <Text style={styles.enqItems}>
                {e.items.map((it) => [it.category, it.quantity, it.unit].filter(Boolean).join(' ')).join('  •  ')}
              </Text>
            ) : null}
            <Text style={styles.enqMeta}>
              {[!e.items?.length && e.category, e.pincode].filter(Boolean).join('  •  ')}
            </Text>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 22, fontWeight: '800', color: colors.text },
  sub: { fontSize: 14, color: colors.muted, marginTop: 2, marginBottom: spacing.lg },
  h2: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm },
  two: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  seg: { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
  segItem: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center' },
  segItemOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  segText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  segTextOn: { color: '#fff' },
  hint: { color: colors.muted, fontSize: 13, marginBottom: spacing.md, lineHeight: 18 },
  projList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  projChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  subChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  projChipOn: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  projText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  projTextOn: { color: colors.primaryDark },
  itemBox: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.md, marginBottom: spacing.md, backgroundColor: colors.bg },
  itemHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  itemTitle: { fontSize: 13, fontWeight: '800', color: colors.text },
  itemRemove: { fontSize: 12, fontWeight: '700', color: colors.danger },
  addItemBtn: { alignSelf: 'flex-start', paddingVertical: 8, marginBottom: spacing.md },
  addItemText: { color: colors.primary, fontWeight: '800', fontSize: 14 },
  enqItems: { fontSize: 13, color: colors.primaryDark, fontWeight: '600', marginTop: 4 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  enqId: { fontSize: 13, fontWeight: '800', color: colors.primary },
  enqSubject: { fontSize: 15, fontWeight: '700', color: colors.text },
  enqMsg: { fontSize: 14, color: colors.text, marginTop: 2 },
  enqMeta: { fontSize: 12, color: colors.muted, marginTop: 6 },
});
