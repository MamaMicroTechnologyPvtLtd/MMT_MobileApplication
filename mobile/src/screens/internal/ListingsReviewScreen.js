import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, Alert, TouchableOpacity, Linking, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, openDownload } from '../../api/client';
import { Card, Badge, EmptyState } from '../../components/ui';
import { colors, spacing, radius, fmtDate, fmtDateTime } from '../../theme';

const fmt = fmtDate;
const STATUSES = ['positive', 'follow_up', 'negative'];

// Admin/Manager: review all listing engineers' listings, filter, re-status, and
// download the daily Excel sheet.
export default function ListingsReviewScreen() {
  const [engineers, setEngineers] = useState([]);
  const [selected, setSelected] = useState(null); // engineer id filter
  const [listings, setListings] = useState([]);
  const [dayReports, setDayReports] = useState([]);
  const [showReports, setShowReports] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [eng, ls, dr] = await Promise.all([
        api('/listings/engineers').catch(() => []),
        api(`/listings${selected ? `?engineer_id=${selected}` : ''}`),
        api('/listings/day-reports').catch(() => []),
      ]);
      setEngineers(eng);
      setListings(ls);
      setDayReports(dr);
    } catch (e) { Alert.alert('Error', e.message); }
  }, [selected]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setStatus = async (id, status) => {
    try {
      await api(`/listings/${id}`, { method: 'PATCH', body: { status } });
      await load();
    } catch (e) { Alert.alert('Error', e.message); }
  };

  const exportSheet = async () => {
    const q = selected ? `?engineer_id=${selected}` : '';
    try { await openDownload(`/listings/export.xlsx${q}`); }
    catch { Alert.alert('Download', 'Could not open the export.'); }
  };

  const renderItem = ({ item }) => (
    <Card>
      <View style={styles.top}>
        <Text style={styles.title}>{item.project_name || item.customer_name || 'Listing'}</Text>
        <Badge label={item.status} />
      </View>
      <Text style={styles.body}>{[item.customer_name, item.phone, item.location, item.pincode].filter(Boolean).join(' · ')}</Text>
      {item.requirement ? <Text style={styles.body} numberOfLines={2}>{item.requirement}</Text> : null}
      {item.materials && item.materials.length ? (
        <Text style={styles.body}>
          {item.materials.map((m) => [m.material, m.quantity, m.unit].filter(Boolean).join(' ')).join(', ')}
        </Text>
      ) : null}
      <Text style={styles.meta}>{[item.engineer_full_name, item.category, fmt(item.listing_date)].filter(Boolean).join('  •  ')}</Text>
      <Text style={styles.stamp}>🕑 {fmtDateTime(item.created_at)}</Text>
      <View style={styles.actions}>
        {STATUSES.map((s) => (
          <TouchableOpacity key={s} onPress={() => setStatus(item.id, s)} style={[styles.mini, item.status === s && styles.miniOn]}>
            <Text style={[styles.miniText, item.status === s && styles.miniTextOn]}>{s.replace('_', ' ')}</Text>
          </TouchableOpacity>
        ))}
      </View>
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
          <View style={styles.headRow}>
            <Text style={styles.h1}>Listings</Text>
            <TouchableOpacity style={styles.exportBtn} onPress={exportSheet}>
              <Text style={styles.exportText}>⬇ Excel</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => setShowReports((s) => !s)} style={styles.reportToggle}>
            <Text style={styles.reportToggleText}>
              🗓 Submitted day reports ({dayReports.length}) {showReports ? '▲' : '▼'}
            </Text>
          </TouchableOpacity>
          {showReports ? (
            dayReports.length === 0 ? (
              <Text style={styles.reportEmpty}>No day reports submitted yet.</Text>
            ) : dayReports.slice(0, 20).map((r) => (
              <View key={r.id} style={styles.reportRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reportName}>{r.engineer_full_name || r.engineer_email}</Text>
                  <Text style={styles.reportMeta}>{fmt(r.report_date)} · submitted {fmtDateTime(r.generated_at)}</Text>
                </View>
                <Text style={styles.reportCounts}>{r.total} · <Text style={{ color: colors.success }}>{r.positive}✓</Text></Text>
              </View>
            ))
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
            <TouchableOpacity onPress={() => setSelected(null)} style={[styles.chip, !selected && styles.chipOn]}>
              <Text style={[styles.chipText, !selected && styles.chipTextOn]}>All</Text>
            </TouchableOpacity>
            {engineers.map((e) => (
              <TouchableOpacity key={e.id} onPress={() => setSelected(e.id)} style={[styles.chip, selected === e.id && styles.chipOn]}>
                <Text style={[styles.chipText, selected === e.id && styles.chipTextOn]}>
                  {(e.full_name || e.email || 'Engineer').split(' ')[0]} · {e.today_count}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      }
      ListEmptyComponent={<EmptyState icon="📋" title="No listings" subtitle="Listing engineers' entries appear here." />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    />
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  h1: { fontSize: 22, fontWeight: '800', color: colors.text },
  exportBtn: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7 },
  exportText: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  reportToggle: { paddingVertical: 8, marginBottom: spacing.sm },
  reportToggleText: { color: colors.primary, fontWeight: '800', fontSize: 14 },
  reportEmpty: { color: colors.muted, fontSize: 13, marginBottom: spacing.md },
  reportRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  reportName: { fontSize: 14, fontWeight: '700', color: colors.text },
  reportMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  reportCounts: { fontSize: 14, fontWeight: '800', color: colors.text },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, marginRight: 8 },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  chipTextOn: { color: '#fff' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1 },
  body: { fontSize: 13, color: colors.muted, marginTop: 2 },
  meta: { fontSize: 12, color: colors.muted, marginTop: 6 },
  stamp: { fontSize: 12, color: colors.primary, fontWeight: '700', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: spacing.sm },
  mini: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  miniOn: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  miniText: { color: colors.muted, fontWeight: '700', fontSize: 12, textTransform: 'capitalize' },
  miniTextOn: { color: colors.primaryDark },
});
