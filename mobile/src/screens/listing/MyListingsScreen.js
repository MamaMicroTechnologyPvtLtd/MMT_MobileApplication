import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, Alert, TouchableOpacity, Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, API_BASE_URL, getToken } from '../../api/client';
import { Card, Badge, Button, EmptyState } from '../../components/ui';
import { colors, spacing } from '../../theme';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '');
const today = () => new Date().toISOString().slice(0, 10);

// Listing Engineer task tab: today's listings + day report (generate + download).
export default function MyListingsScreen() {
  const [listings, setListings] = useState([]);
  const [report, setReport] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ls, rep] = await Promise.all([
        api(`/listings?date=${today()}`),
        api('/listings/day-report').catch(() => null),
      ]);
      setListings(ls);
      setReport(rep);
    } catch (e) { Alert.alert('Error', e.message); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const generate = async () => {
    setGenerating(true);
    try {
      await api('/listings/day-report', { method: 'POST', body: { date: today() } });
      Alert.alert('Day report submitted', 'Your Admin & Manager have been notified.');
      await load();
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setGenerating(false); }
  };

  const download = async () => {
    const token = await getToken();
    const url = `${API_BASE_URL}/listings/export.xlsx?date=${today()}&token=${encodeURIComponent(token)}`;
    Linking.openURL(url).catch(() => Alert.alert('Download', 'Could not open the export.'));
  };

  const renderItem = ({ item }) => (
    <Card>
      <View style={styles.top}>
        <Text style={styles.title}>{item.project_name || item.customer_name || 'Listing'}</Text>
        <Badge label={item.status} />
      </View>
      <Text style={styles.body}>
        {[item.customer_name, item.phone, item.location, item.pincode].filter(Boolean).join(' · ')}
      </Text>
      {item.requirement ? <Text style={styles.body} numberOfLines={2}>{item.requirement}</Text> : null}
      <Text style={styles.meta}>{[item.category, item.quantity, item.budget, fmt(item.listing_date)].filter(Boolean).join('  •  ')}</Text>
    </Card>
  );

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
      data={listings}
      keyExtractor={(x) => String(x.id)}
      renderItem={renderItem}
      ListHeaderComponent={
        <View>
          <Text style={styles.h1}>Today&apos;s task</Text>
          <Card>
            <Text style={styles.reportTitle}>Day report · {today()}</Text>
            <View style={styles.counts}>
              <Count label="Total" value={report?.total ?? listings.length} />
              <Count label="Positive" value={report?.positive ?? 0} tint={colors.success} />
              <Count label="Follow-up" value={report?.follow_up ?? 0} tint={colors.warning} />
              <Count label="Negative" value={report?.negative ?? 0} tint={colors.danger} />
            </View>
            <Button title="Generate & submit day report" onPress={generate} loading={generating} />
            <View style={{ height: spacing.sm }} />
            <Button title="⬇ Download Excel sheet" variant="ghost" onPress={download} />
            <Text style={styles.reportNote}>
              Submitting sends this report to your Admin &amp; Manager, who can view it in their dashboard.
              Download the Excel sheet for your own records or to share.
            </Text>
          </Card>
          <Text style={styles.h2}>My listings today</Text>
        </View>
      }
      ListEmptyComponent={<EmptyState icon="📝" title="No listings yet today" subtitle="Add listings from the New Listing tab." />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    />
  );
}

function Count({ label, value, tint }) {
  return (
    <View style={styles.count}>
      <Text style={[styles.countValue, tint && { color: tint }]}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: spacing.md },
  h2: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm },
  reportTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  reportNote: { fontSize: 12, color: colors.muted, marginTop: spacing.md, lineHeight: 17 },
  counts: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  count: { alignItems: 'center', flex: 1 },
  countValue: { fontSize: 22, fontWeight: '900', color: colors.text },
  countLabel: { fontSize: 12, color: colors.muted },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1 },
  body: { fontSize: 13, color: colors.muted, marginTop: 2 },
  meta: { fontSize: 12, color: colors.muted, marginTop: 6 },
});
