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
export default function EnquiryScreen() {
  const empty = { subject: '', message: '', quantity: '', unit: '', target_price: '', pincode: '', contact_phone: '' };
  const [form, setForm] = useState(empty);
  const [projectMode, setProjectMode] = useState('new'); // 'new' | 'existing'
  const [projectId, setProjectId] = useState(null);
  const [projects, setProjects] = useState([]);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState(null); // { id, name, subcategories }
  const [subcategory, setSubcategory] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [enquiries, setEnquiries] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

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
    if (!category) {
      Alert.alert('Select a category', 'Choose a category (and sub-category) for your enquiry.');
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        ...form,
        category: category?.name,
        subcategory: subcategory?.name,
        project_id: projectMode === 'existing' ? projectId : undefined,
      };
      const created = await api('/enquiries', { method: 'POST', body });
      Alert.alert('Enquiry sent', `Your enquiry ${created.enquiry_id} has been sent to the MMT team.`);
      setForm(empty);
      setProjectId(null);
      setProjectMode('new');
      setCategory(null);
      setSubcategory(null);
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

        <Text style={styles.label}>Category *</Text>
        <View style={styles.projList}>
          {categories.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => { setCategory(c); setSubcategory(null); }}
              style={[styles.projChip, category?.id === c.id && styles.projChipOn]}
            >
              <Text style={[styles.projText, category?.id === c.id && styles.projTextOn]}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {category && category.subcategories?.length ? (
          <>
            <Text style={styles.label}>Sub-category</Text>
            <View style={styles.projList}>
              {category.subcategories.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => setSubcategory(s)}
                  style={[styles.projChip, subcategory?.id === s.id && styles.projChipOn]}
                >
                  <Text style={[styles.projText, subcategory?.id === s.id && styles.projTextOn]}>{s.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}

        <Field label="Subject" value={form.subject} onChangeText={set('subject')} placeholder="Short title" />
        <Field label="Requirement *" value={form.message} onChangeText={set('message')} placeholder="Describe your requirement in detail" multiline />
        <View style={styles.two}>
          <View style={styles.half}><Field label="Quantity" value={form.quantity} onChangeText={set('quantity')} placeholder="e.g. 200" keyboardType="numeric" /></View>
          <View style={styles.half}><Field label="Unit" value={form.unit} onChangeText={set('unit')} placeholder="bags / tons" /></View>
        </View>
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
            <Text style={styles.enqMeta}>
              {[e.category, e.quantity && `${e.quantity} ${e.unit || ''}`.trim(), e.pincode]
                .filter(Boolean).join('  •  ')}
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
  hint: { color: colors.muted, fontSize: 13, marginBottom: spacing.md },
  projList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  projChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  projChipOn: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  projText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  projTextOn: { color: colors.primaryDark },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  enqId: { fontSize: 13, fontWeight: '800', color: colors.primary },
  enqSubject: { fontSize: 15, fontWeight: '700', color: colors.text },
  enqMsg: { fontSize: 14, color: colors.text, marginTop: 2 },
  enqMeta: { fontSize: 12, color: colors.muted, marginTop: 6 },
});
