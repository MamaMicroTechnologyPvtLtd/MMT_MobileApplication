import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, Alert, TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api/client';
import { Card, Badge, EmptyState, Button } from '../../components/ui';
import { colors, spacing } from '../../theme';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '');

// Internal home: the enquiries raised by customers appear on top. From here the
// internal member creates a Project + Order and moves into the supplier flow.
export default function EnquiriesScreen({ navigation }) {
  const [enquiries, setEnquiries] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      setEnquiries(await api('/enquiries'));
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Call customer -> Project ID -> Order ID, then go straight to the supplier
  // requirement form for that order.
  const convert = async (enq) => {
    setBusy(enq.enquiry_id);
    try {
      const order = await api('/orders', {
        method: 'POST',
        body: {
          customer_id: enq.customer_id,
          enquiry_id: enq.enquiry_id,
          project_id: enq.project_id || undefined, // reuse existing project if the enquiry has one
          requirement: enq.message,
          quantity: enq.quantity ? `${enq.quantity} ${enq.unit || ''}`.trim() : undefined,
          pincode: enq.pincode || enq.customer_pincode,
        },
      });
      navigation.navigate('SendRequirement', {
        orderId: order.order_id,
        pincode: order.pincode,
        requirement: order.requirement,
      });
    } catch (e) {
      Alert.alert('Could not create order', e.message);
    } finally {
      setBusy(null);
    }
  };

  const renderItem = ({ item }) => (
    <Card>
      <View style={styles.top}>
        <Text style={styles.eid}>{item.enquiry_id}</Text>
        <Badge label={item.status} />
      </View>
      <Text style={styles.customer}>
        {[item.first_name, item.last_name].filter(Boolean).join(' ') || item.customer_id}
        {item.mobile_num ? `  ·  ${item.mobile_num}` : ''}
      </Text>
      {item.subject ? <Text style={styles.subject}>{item.subject}</Text> : null}
      <Text style={styles.msg} numberOfLines={3}>{item.message}</Text>
      <Text style={styles.meta}>
        {[item.project_id ? `Existing project #${item.project_id}` : 'New project',
          item.contact_phone && `☎ ${item.contact_phone}`,
          item.category, item.quantity && `${item.quantity} ${item.unit || ''}`.trim(),
          item.pincode || item.customer_pincode, fmt(item.created_at)].filter(Boolean).join('  •  ')}
      </Text>
      {item.status === 'new' || item.status === 'in_discussion' ? (
        <Button
          title={item.project_id ? 'Create order & send to suppliers' : 'Create project + order → suppliers'}
          onPress={() => convert(item)}
          loading={busy === item.enquiry_id}
          style={{ marginTop: spacing.md }}
        />
      ) : null}
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <Text style={styles.h1}>Customer Enquiries</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Directory')}>
          <Text style={styles.link}>Directory ›</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
        data={enquiries}
        keyExtractor={(x) => x.enquiry_id}
        renderItem={renderItem}
        ListEmptyComponent={<EmptyState icon="📭" title="No enquiries yet" subtitle="Customer enquiries will show here." />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  h1: { fontSize: 20, fontWeight: '800', color: colors.text },
  link: { color: colors.primary, fontWeight: '700' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  eid: { fontSize: 13, fontWeight: '800', color: colors.primary },
  customer: { fontSize: 15, fontWeight: '700', color: colors.text },
  subject: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 2 },
  msg: { fontSize: 14, color: colors.muted, marginTop: 2 },
  meta: { fontSize: 12, color: colors.muted, marginTop: 6 },
});
