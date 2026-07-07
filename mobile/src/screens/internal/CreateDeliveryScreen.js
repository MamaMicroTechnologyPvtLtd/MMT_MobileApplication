import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { api } from '../../api/client';
import { Button, Field, Card } from '../../components/ui';
import UploadField from '../../components/UploadField';
import { colors, spacing } from '../../theme';

// Delivery is generated after advance payment: a Delivery ID + the order/PO/
// invoice references, a truck photo/video, and the vehicle + driver details.
export default function CreateDeliveryScreen({ route, navigation }) {
  const { orderId, customerId, projectId } = route.params || {};
  const [form, setForm] = useState({
    invoice_no: '', vehicle_number: '', driver_name: '', driver_number: '',
    delivery_location: '', postal_code: '', remark: '',
    invoice_url: '', po_url: '', bill_url: '', eway_bill_url: '',
    truck_image_url: '', truck_video_url: '',
  });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const d = await api('/deliveries', {
        method: 'POST',
        body: { order_id: orderId, customer_id: customerId, project_id: projectId, ...form },
      });
      Alert.alert('Delivery created', `${d.delivery_id} created for order ${orderId}.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Could not create', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
      <Text style={styles.order}>Order {orderId}</Text>
      <Text style={styles.h1}>Create delivery</Text>

      <Card>
        <Field label="Invoice number" value={form.invoice_no} onChangeText={set('invoice_no')} placeholder="Invoice / bill no" />
        <View style={styles.two}>
          <View style={styles.half}><Field label="Vehicle number" value={form.vehicle_number} onChangeText={set('vehicle_number')} placeholder="KA01AB1234" /></View>
          <View style={styles.half}><Field label="Postal code" value={form.postal_code} onChangeText={set('postal_code')} placeholder="Pincode" keyboardType="numeric" /></View>
        </View>
        <View style={styles.two}>
          <View style={styles.half}><Field label="Driver name" value={form.driver_name} onChangeText={set('driver_name')} placeholder="Name" /></View>
          <View style={styles.half}><Field label="Driver number" value={form.driver_number} onChangeText={set('driver_number')} placeholder="Mobile" keyboardType="phone-pad" /></View>
        </View>
        <Field label="Delivery location" value={form.delivery_location} onChangeText={set('delivery_location')} placeholder="Address / area" />
        <Field label="Remark" value={form.remark} onChangeText={set('remark')} placeholder="Any note" multiline />
      </Card>

      <Text style={styles.h2}>Truck photo &amp; video</Text>
      <Card>
        <UploadField label="Truck photo" kind="image" icon="📷" value={form.truck_image_url} onChange={set('truck_image_url')} />
        <UploadField label="Truck video" kind="video" icon="🎥" value={form.truck_video_url} onChange={set('truck_video_url')} />
      </Card>

      <Text style={styles.h2}>Documents</Text>
      <Card>
        <UploadField label="Invoice" kind="document" value={form.invoice_url} onChange={set('invoice_url')} />
        <UploadField label="PO" kind="document" value={form.po_url} onChange={set('po_url')} />
        <UploadField label="Bill (GST/tax)" kind="document" value={form.bill_url} onChange={set('bill_url')} />
        <UploadField label="E-way bill" kind="document" value={form.eway_bill_url} onChange={set('eway_bill_url')} />
      </Card>

      <Button title="Create delivery" onPress={submit} loading={saving} />
      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  order: { fontSize: 13, fontWeight: '800', color: colors.primary },
  h1: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 2, marginBottom: spacing.md },
  h2: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  two: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
});
