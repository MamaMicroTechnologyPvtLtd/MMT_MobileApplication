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
  const empty = { category: '', subject: '', message: '', quantity: '', unit: '', target_price: '', pincode: '' };
  const [form, setForm] = useState(empty);
  const [submitting, setSubmitting] = useState(false);
  const [enquiries, setEnquiries] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    try {
      const data = await api('/enquiries');
      setEnquiries(data);
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
    setSubmitting(true);
    try {
      const created = await api('/enquiries', { method: 'POST', body: form });
      Alert.alert('Enquiry sent', `Your enquiry ${created.enquiry_id} has been sent to the MMT team.`);
      setForm(empty);
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
        <Field label="Category" value={form.category} onChangeText={set('category')} placeholder="e.g. Cement, Steel, Sanitary" />
        <Field label="Subject" value={form.subject} onChangeText={set('subject')} placeholder="Short title" />
        <Field label="Requirement *" value={form.message} onChangeText={set('message')} placeholder="Describe your requirement in detail" multiline />
        <View style={styles.two}>
          <View style={styles.half}><Field label="Quantity" value={form.quantity} onChangeText={set('quantity')} placeholder="e.g. 200" keyboardType="numeric" /></View>
          <View style={styles.half}><Field label="Unit" value={form.unit} onChangeText={set('unit')} placeholder="bags / tons" /></View>
        </View>
        <View style={styles.two}>
          <View style={styles.half}><Field label="Target price" value={form.target_price} onChangeText={set('target_price')} placeholder="₹ / unit" /></View>
          <View style={styles.half}><Field label="Pincode" value={form.pincode} onChangeText={set('pincode')} placeholder="Delivery pincode" keyboardType="numeric" /></View>
        </View>
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
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  enqId: { fontSize: 13, fontWeight: '800', color: colors.primary },
  enqSubject: { fontSize: 15, fontWeight: '700', color: colors.text },
  enqMsg: { fontSize: 14, color: colors.text, marginTop: 2 },
  enqMeta: { fontSize: 12, color: colors.muted, marginTop: 6 },
});
