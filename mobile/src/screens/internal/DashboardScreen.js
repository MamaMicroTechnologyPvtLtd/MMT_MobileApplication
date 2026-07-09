import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api/client';
import { Card, Badge } from '../../components/ui';
import { colors, spacing, radius, fmtDateTime as fmt } from '../../theme';

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function DashboardScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setData(await api('/dashboard')); } catch { /* noop */ }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!data) {
    return <View style={styles.center}><Text style={{ color: colors.muted }}>Loading…</Text></View>;
  }

  const pendingQuotes = data.supplier_quotations.received; // awaiting internal action
  const openOrders = data.orders.total - data.orders.completed - data.orders.cancelled;

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <Text style={styles.h1}>Dashboard</Text>

      <View style={styles.tiles}>
        <Tile label="Customers" value={data.customers} icon="👥" onPress={() => navigation.navigate('Directory', { tab: 'customers' })} />
        <Tile label="Suppliers" value={data.suppliers} icon="🏭" onPress={() => navigation.navigate('Directory', { tab: 'suppliers' })} />
        <Tile label="Listing Engineers" value={data.listing_engineers ?? 0} icon="👷" tint={colors.accent} onPress={() => navigation.navigate('Staff')} />
        <Tile label="New enquiries" value={data.enquiries.new} icon="📥" tint={colors.info} onPress={() => navigation.navigate('Enquiries')} />
        <Tile label="Open orders" value={openOrders} icon="📦" onPress={() => navigation.navigate('Orders')} />
        <Tile label="Quotes to action" value={pendingQuotes} icon="📄" tint={colors.warning} />
        <Tile label="In delivery" value={data.deliveries.pending + data.deliveries.dispatched + data.deliveries.in_transit} icon="🚚" />
      </View>

      <Text style={styles.h2}>Revenue</Text>
      <Card>
        <Line label="Quoted (all)" value={money(data.revenue.quoted_total)} />
        <Line label="Confirmed" value={money(data.revenue.confirmed_total)} strong />
        <Line label="Margin (confirmed)" value={money(data.revenue.margin_total)} tint={colors.success} />
        <Line label="Payments received" value={money(data.revenue.payments_paid)} />
      </Card>

      <Text style={styles.h2}>Orders by stage</Text>
      <Card>
        <StageBars stages={data.orders} />
      </Card>

      <Text style={styles.h2}>Recent enquiries</Text>
      {data.recent_enquiries.length === 0 ? <Text style={styles.empty}>None yet.</Text> : data.recent_enquiries.map((e) => (
        <Card key={e.enquiry_id}>
          <View style={styles.rowTop}>
            <Text style={styles.rid}>{e.enquiry_id}</Text>
            <Badge label={e.status} />
          </View>
          <Text style={styles.rtitle}>{[e.first_name, e.last_name].filter(Boolean).join(' ') || '—'}</Text>
          <Text style={styles.rbody} numberOfLines={1}>{e.subject || e.category || ''}</Text>
          <Text style={styles.rmeta}>{fmt(e.created_at)}</Text>
        </Card>
      ))}

      <View style={styles.h2Row}>
        <Text style={styles.h2}>Recent listings</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Listings')}>
          <Text style={styles.seeAll}>Open Listings ›</Text>
        </TouchableOpacity>
      </View>
      {(!data.recent_listings || data.recent_listings.length === 0) ? <Text style={styles.empty}>None yet.</Text> : data.recent_listings.map((l) => (
        <Card key={l.id}>
          <View style={styles.rowTop}>
            <Text style={styles.rtitle}>{l.project_name || l.customer_name || 'Listing'}</Text>
            <Badge label={l.status} />
          </View>
          <Text style={styles.rbody}>
            {[l.customer_name, l.phone && `☎ ${l.phone}`, l.location, l.pincode].filter(Boolean).join(' · ') || 'No contact details'}
          </Text>
          {l.materials && l.materials.length ? (
            <Text style={styles.rbody} numberOfLines={2}>
              {l.materials.map((m) => [m.material, m.quantity, m.unit].filter(Boolean).join(' ')).join(', ')}
            </Text>
          ) : null}
          <Text style={styles.rmeta}>👷 {l.engineer_full_name || 'Engineer'} · {fmt(l.created_at)}</Text>
        </Card>
      ))}

      <Text style={styles.h2}>Recent orders</Text>
      {data.recent_orders.length === 0 ? <Text style={styles.empty}>None yet.</Text> : data.recent_orders.map((o) => (
        <TouchableOpacity key={o.order_id} onPress={() => navigation.navigate('OrderDetail', { orderId: o.order_id })}>
          <Card>
            <View style={styles.rowTop}>
              <Text style={styles.rid}>{o.order_id}</Text>
              <Badge label={o.status} />
            </View>
            <Text style={styles.rbody} numberOfLines={1}>{o.requirement || '—'}</Text>
            <Text style={styles.rmeta}>{o.quotes} quotes · {fmt(o.created_at)}</Text>
          </Card>
        </TouchableOpacity>
      ))}
      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

function Tile({ label, value, icon, tint, onPress }) {
  const Comp = onPress ? TouchableOpacity : View;
  return (
    <Comp style={styles.tile} onPress={onPress} activeOpacity={0.85}>
      <Text style={styles.tileIcon}>{icon}</Text>
      <Text style={[styles.tileValue, tint && { color: tint }]}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </Comp>
  );
}

function Line({ label, value, strong, tint }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={[styles.lineValue, strong && { fontWeight: '900', fontSize: 17 }, tint && { color: tint }]}>{value}</Text>
    </View>
  );
}

// Simple horizontal bars for the main order stages.
function StageBars({ stages }) {
  const items = [
    ['sent_to_suppliers', 'Sent to suppliers', colors.info],
    ['quotes_received', 'Quotes received', colors.primary],
    ['quoted_to_customer', 'Quoted to customer', colors.warning],
    ['confirmed', 'Confirmed', colors.success],
    ['in_delivery', 'In delivery', colors.accent],
    ['completed', 'Completed', colors.muted],
  ];
  const max = Math.max(1, ...items.map(([k]) => stages[k] || 0));
  return (
    <View>
      {items.map(([k, label, c]) => (
        <View key={k} style={styles.barRow}>
          <Text style={styles.barLabel}>{label}</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${((stages[k] || 0) / max) * 100}%`, backgroundColor: c }]} />
          </View>
          <Text style={styles.barValue}>{stages[k] || 0}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  h1: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: spacing.md },
  h2: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  h2Row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.sm },
  seeAll: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    width: '47%', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.lg,
  },
  tileIcon: { fontSize: 22 },
  tileValue: { fontSize: 26, fontWeight: '900', color: colors.text, marginTop: 4 },
  tileLabel: { fontSize: 13, color: colors.muted, marginTop: 2 },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  lineLabel: { fontSize: 14, color: colors.muted },
  lineValue: { fontSize: 15, fontWeight: '700', color: colors.text },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  barLabel: { width: 130, fontSize: 12, color: colors.muted },
  barTrack: { flex: 1, height: 10, backgroundColor: colors.bg, borderRadius: 6, overflow: 'hidden', marginHorizontal: 8 },
  barFill: { height: 10, borderRadius: 6 },
  barValue: { width: 26, textAlign: 'right', fontSize: 13, fontWeight: '700', color: colors.text },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  rid: { fontSize: 13, fontWeight: '800', color: colors.primary },
  rtitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  rbody: { fontSize: 14, color: colors.muted, marginTop: 2 },
  rmeta: { fontSize: 12, color: colors.muted, marginTop: 6 },
  empty: { color: colors.muted, fontSize: 14, marginBottom: spacing.md },
});
