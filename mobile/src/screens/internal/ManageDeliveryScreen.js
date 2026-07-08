import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, RefreshControl, Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, fileUrl } from '../../api/client';
import { Button, Field, Card, Badge } from '../../components/ui';
import UploadField from '../../components/UploadField';
import { colors, spacing, radius } from '../../theme';

const STATUSES = ['pending', 'dispatched', 'in_transit', 'delivered'];
const dt = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

// Internal delivery management: update driver/vehicle, add the timestamped
// onsite photo, move the status, and mark delivered (which closes the order +
// enquiry).
export default function ManageDeliveryScreen({ route, navigation }) {
  const { deliveryId } = route.params;
  const [d, setD] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ vehicle_number: '', driver_name: '', driver_number: '', onsite_photo_url: '' });

  const load = useCallback(async () => {
    try {
      const data = await api(`/deliveries/${deliveryId}`);
      setD(data);
      setForm((f) => ({
        vehicle_number: data.vehicle_number || '',
        driver_name: data.driver_name || '',
        driver_number: data.driver_number || '',
        onsite_photo_url: data.onsite_photo_url || f.onsite_photo_url,
      }));
    } catch (e) { Alert.alert('Error', e.message); }
  }, [deliveryId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const patch = async (body, successMsg) => {
    setSaving(true);
    try {
      await api(`/deliveries/${deliveryId}`, { method: 'PATCH', body });
      if (successMsg) Alert.alert('Done', successMsg);
      await load();
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const saveDetails = () => patch({
    vehicle_number: form.vehicle_number,
    driver_name: form.driver_name,
    driver_number: form.driver_number,
    onsite_photo_url: form.onsite_photo_url || undefined,
  }, 'Delivery updated');

  const markDelivered = () => Alert.alert(
    'Mark delivered?',
    'This sets the delivery to delivered and closes the order + enquiry.',
    [{ text: 'Cancel' }, { text: 'Confirm', onPress: () => patch({ status: 'delivered' }, 'Delivered — order closed.') }],
  );

  if (!d) return <View style={styles.center}><Text style={{ color: colors.muted }}>Loading…</Text></View>;

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <View style={styles.top}>
        <Text style={styles.did}>{d.delivery_id}</Text>
        <Badge label={d.status} />
      </View>
      <Text style={styles.meta}>Order {d.order_id}{d.project_id ? ` · Project ${d.project_id}` : ''}</Text>

      <Text style={styles.h2}>Status</Text>
      <View style={styles.seg}>
        {STATUSES.map((s) => (
          <TouchableOpacity
            key={s}
            onPress={() => patch({ status: s }, s === 'delivered' ? undefined : `Status: ${s}`)}
            disabled={saving || s === 'delivered'}
            style={[styles.segItem, d.status === s && styles.segItemOn]}
          >
            <Text style={[styles.segText, d.status === s && styles.segTextOn]}>{s.replace('_', ' ')}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.h2}>Vehicle &amp; driver</Text>
      <Card>
        <Field label="Vehicle number" value={form.vehicle_number} onChangeText={(v) => setForm((f) => ({ ...f, vehicle_number: v }))} placeholder="KA01AB1234" />
        <View style={styles.two}>
          <View style={styles.half}><Field label="Driver name" value={form.driver_name} onChangeText={(v) => setForm((f) => ({ ...f, driver_name: v }))} placeholder="Name" /></View>
          <View style={styles.half}><Field label="Driver phone" value={form.driver_number} onChangeText={(v) => setForm((f) => ({ ...f, driver_number: v }))} placeholder="Mobile" keyboardType="phone-pad" /></View>
        </View>
      </Card>

      <Text style={styles.h2}>Photos (date/time auto-captured)</Text>
      <Card>
        <PhotoRow label="On-load (our side)" url={d.onload_photo_url} at={d.onload_photo_at} />
        <View style={{ height: spacing.sm }} />
        <Text style={styles.fieldLabel}>Onsite delivery photo</Text>
        <UploadField label={null} kind="image" icon="📍" value={form.onsite_photo_url} onChange={(v) => setForm((f) => ({ ...f, onsite_photo_url: v }))} />
        {d.onsite_photo_at ? <Text style={styles.stamp}>Captured: {dt(d.onsite_photo_at)}</Text> : null}
      </Card>

      <Button title="Save details" onPress={saveDetails} loading={saving} />
      <View style={{ height: spacing.sm }} />
      {d.status !== 'delivered' ? (
        <Button title="Mark delivered & close order" onPress={markDelivered} disabled={saving} />
      ) : (
        <Text style={styles.closed}>✓ Delivered — order &amp; enquiry closed.</Text>
      )}
      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

function PhotoRow({ label, url, at }) {
  return (
    <View style={styles.photoRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.stamp}>{at ? `Captured: ${dt(at)}` : 'Not captured'}</Text>
      </View>
      {url ? (
        <TouchableOpacity style={styles.viewBtn} onPress={() => Linking.openURL(fileUrl(url))}>
          <Text style={styles.viewText}>View</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  did: { fontSize: 15, fontWeight: '800', color: colors.primary },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2, marginBottom: spacing.sm },
  h2: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  seg: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segItem: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  segItemOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  segText: { color: colors.muted, fontWeight: '700', fontSize: 13, textTransform: 'capitalize' },
  segTextOn: { color: '#fff' },
  two: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 4 },
  photoRow: { flexDirection: 'row', alignItems: 'center' },
  stamp: { fontSize: 12, color: colors.muted },
  viewBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.md, backgroundColor: colors.primary },
  viewText: { color: '#fff', fontWeight: '700' },
  closed: { color: colors.success, fontWeight: '800', textAlign: 'center', marginTop: spacing.sm },
});
