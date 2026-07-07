import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput, Linking, ScrollView,
} from 'react-native';
import { api } from '../../api/client';
import { Button, Field, Badge, Card } from '../../components/ui';
import { colors, spacing, radius } from '../../theme';

const MAX = 30;

// "Enter the pincode -> get all suppliers at that locality -> choose up to 30 ->
// enter requirement / note / quantity / price range -> SEND to all at one click."
export default function SendRequirementScreen({ route, navigation }) {
  const { orderId, pincode: initialPincode, requirement: initialReq } = route.params;
  const [pincode, setPincode] = useState(initialPincode || '');
  const [suppliers, setSuppliers] = useState([]);
  const [selected, setSelected] = useState({});
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);

  const [form, setForm] = useState({
    requirement: initialReq || '',
    note: '',
    quantity: '',
    price_range: '',
  });
  const [result, setResult] = useState(null); // send result incl. whatsapp links
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  const search = useCallback(async () => {
    setSearching(true);
    try {
      const list = await api(`/suppliers?${pincode ? `pincode=${encodeURIComponent(pincode)}` : ''}`);
      setSuppliers(list);
      if (list.length === 0) Alert.alert('No suppliers', 'No suppliers found for this pincode. Try another, or add suppliers in the Directory.');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSearching(false);
    }
  }, [pincode]);

  const toggle = (id) => {
    setSelected((s) => {
      const next = { ...s };
      if (next[id]) delete next[id];
      else {
        if (selectedIds.length >= MAX) {
          Alert.alert('Limit reached', `You can select at most ${MAX} suppliers.`);
          return s;
        }
        next[id] = true;
      }
      return next;
    });
  };

  const send = async () => {
    if (selectedIds.length === 0) {
      Alert.alert('Select suppliers', 'Choose at least one supplier to send the requirement.');
      return;
    }
    if (!form.requirement.trim()) {
      Alert.alert('Requirement needed', 'Enter the requirement message.');
      return;
    }
    setSending(true);
    try {
      const res = await api(`/orders/${orderId}/send-suppliers`, {
        method: 'POST',
        body: { supplier_ids: selectedIds, ...form },
      });
      setResult(res); // show the WhatsApp options
    } catch (e) {
      Alert.alert('Could not send', e.message);
    } finally {
      setSending(false);
    }
  };

  const renderSupplier = ({ item }) => {
    const on = !!selected[item.supplier_id];
    return (
      <TouchableOpacity style={[styles.supplier, on && styles.supplierOn]} onPress={() => toggle(item.supplier_id)}>
        <View style={[styles.check, on && styles.checkOn]}>{on ? <Text style={styles.checkMark}>✓</Text> : null}</View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sName}>{item.supplier_firm_name || item.supplier_id}</Text>
          <Text style={styles.sMeta}>
            {[item.contact_person_name, item.city, item.mobile].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Text style={styles.sId}>{item.supplier_id}</Text>
      </TouchableOpacity>
    );
  };

  // After sending, show the WhatsApp options (deep links, or cloud-send status).
  if (result) {
    const cloud = result.whatsapp_mode === 'cloud_api';
    const withPhone = (result.whatsapp || []).filter((w) => w.wa_link);
    return (
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
        <Text style={styles.successTitle}>✓ Requirement sent</Text>
        <Text style={styles.successSub}>
          {orderId} sent in-app to {result.suppliers_sent} supplier(s).
          {cloud ? ' Also sent on WhatsApp.' : ' Send on WhatsApp below.'}
        </Text>

        <Text style={styles.h2}>WhatsApp {cloud ? '(auto-sent)' : '(tap to send each)'}</Text>
        {withPhone.length === 0 ? (
          <Card><Text style={styles.muted}>No supplier phone numbers available for WhatsApp.</Text></Card>
        ) : withPhone.map((w) => (
          <Card key={w.supplier_id}>
            <View style={styles.waRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.waName}>{w.firm_name || w.supplier_id}</Text>
                <Text style={styles.muted}>{w.phone || 'no phone'}</Text>
              </View>
              {cloud ? (
                <Badge label={w.sent ? 'sent' : 'failed'} />
              ) : (
                <TouchableOpacity style={styles.waBtn} onPress={() => Linking.openURL(w.wa_link)}>
                  <Text style={styles.waBtnText}>WhatsApp</Text>
                </TouchableOpacity>
              )}
            </View>
          </Card>
        ))}

        <View style={{ height: spacing.md }} />
        <Button title="View comparison sheet" onPress={() => navigation.replace('OrderDetail', { orderId })} />
      </ScrollView>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
      data={suppliers}
      keyExtractor={(x) => x.supplier_id}
      renderItem={renderSupplier}
      ListHeaderComponent={
        <View>
          <Text style={styles.order}>Order {orderId}</Text>
          <Text style={styles.h2}>1 · Find suppliers by pincode</Text>
          <View style={styles.searchRow}>
            <TextInput
              value={pincode}
              onChangeText={setPincode}
              placeholder="Enter pincode"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              style={styles.searchInput}
            />
            <Button title="Search" onPress={search} loading={searching} style={{ paddingHorizontal: 20 }} />
          </View>

          <Text style={styles.h2}>2 · Select suppliers (up to {MAX})</Text>
          <View style={styles.selRow}>
            <Badge label={`${selectedIds.length} selected`} />
            {suppliers.length ? <Text style={styles.count}>{suppliers.length} found</Text> : null}
          </View>
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.hint}>Search a pincode to list suppliers in that locality.</Text>
      }
      ListFooterComponent={
        <View style={{ marginTop: spacing.lg }}>
          <Text style={styles.h2}>3 · Requirement details</Text>
          <Field label="Requirement message *" value={form.requirement} onChangeText={set('requirement')} placeholder="What you need" multiline />
          <Field label="Note (rules / conditions / mandatory)" value={form.note} onChangeText={set('note')} placeholder="e.g. GST mandatory, deliver in 3 days" multiline />
          <View style={styles.two}>
            <View style={styles.half}><Field label="Quantity" value={form.quantity} onChangeText={set('quantity')} placeholder="e.g. 200 bags" /></View>
            <View style={styles.half}><Field label="Price range" value={form.price_range} onChangeText={set('price_range')} placeholder="₹330–360" /></View>
          </View>
          <Button
            title={`SEND to ${selectedIds.length || ''} supplier${selectedIds.length === 1 ? '' : 's'}`.replace('  ', ' ')}
            onPress={send}
            loading={sending}
          />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  order: { fontSize: 13, fontWeight: '800', color: colors.primary, marginBottom: spacing.sm },
  h2: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm },
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  searchInput: {
    flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text,
  },
  selRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  count: { color: colors.muted, fontSize: 13 },
  hint: { color: colors.muted, fontSize: 14, paddingVertical: spacing.md },
  supplier: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm, gap: spacing.md,
  },
  supplierOn: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  check: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkMark: { color: '#fff', fontWeight: '900', fontSize: 14 },
  sName: { fontSize: 15, fontWeight: '700', color: colors.text },
  sMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  sId: { fontSize: 11, color: colors.muted, fontWeight: '700' },
  two: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  successTitle: { fontSize: 22, fontWeight: '800', color: colors.success },
  successSub: { fontSize: 14, color: colors.muted, marginTop: 4, marginBottom: spacing.lg, lineHeight: 20 },
  muted: { color: colors.muted, fontSize: 13 },
  waRow: { flexDirection: 'row', alignItems: 'center' },
  waName: { fontSize: 15, fontWeight: '700', color: colors.text },
  waBtn: { backgroundColor: '#25D366', borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 9 },
  waBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
