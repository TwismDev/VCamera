import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, Field, Screen } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useTeam } from '@/hooks/useTeam';
import { useAuth } from '@/providers/AuthProvider';
import { geocodeAddress } from '@/services/eta';
import { colors, radius, spacing, type } from '@/theme';

export default function NewJob() {
  const { profile } = useAuth();
  const router = useRouter();
  const { drivers, loading: loadingTeam } = useTeam(profile?.org_id);

  const [address, setAddress] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [productCount, setProductCount] = useState('1');
  const [cash, setCash] = useState('0');
  const [notes, setNotes] = useState('');
  const [driverId, setDriverId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!profile?.org_id) return;
    if (!address.trim()) return setError('A delivery address is required.');

    const products = Number.parseInt(productCount, 10);
    const cashAmount = Number.parseFloat(cash);
    if (!Number.isFinite(products) || products < 0) return setError('Product count must be a whole number.');
    if (!Number.isFinite(cashAmount) || cashAmount < 0) return setError('Cash to collect must be a number.');

    setBusy(true);
    setError(null);

    // Resolving coordinates up front means the driver's ETA and the boss's map
    // both work the moment the job lands, with no extra taps.
    const coords = await geocodeAddress(address);

    const { data, error: insertError } = await supabase
      .from('jobs')
      .insert({
        org_id: profile.org_id,
        created_by: profile.id,
        driver_id: driverId || null,
        address: address.trim(),
        address_lat: coords?.lat ?? null,
        address_lng: coords?.lng ?? null,
        customer_name: customerName.trim() || null,
        customer_phone: customerPhone.trim() || null,
        product_count: products,
        cash_to_collect: cashAmount,
        notes: notes.trim() || null,
      })
      .select('id')
      .single();

    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }
    router.replace(`/boss/job/${data.id}`);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <Screen>
        <Card>
          <Field
            label="Delivery address"
            value={address}
            onChangeText={setAddress}
            placeholder="12 Bourke St, Melbourne VIC"
            multiline
            hint="Looked up automatically so the driver gets an ETA and you get a map pin."
          />
          <Field label="Customer name" value={customerName} onChangeText={setCustomerName} placeholder="Optional" />
          <Field
            label="Customer phone"
            value={customerPhone}
            onChangeText={setCustomerPhone}
            keyboardType="phone-pad"
            placeholder="Optional"
          />
        </Card>

        <Card>
          <View style={styles.pair}>
            <View style={styles.pairItem}>
              <Field
                label="Number of products"
                value={productCount}
                onChangeText={setProductCount}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.pairItem}>
              <Field
                label="Cash to collect"
                value={cash}
                onChangeText={setCash}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
          <Field
            label="Notes for the driver"
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Gate code, back entrance, ask for Dave…"
          />
        </Card>

        <Card>
          <Text style={type.label}>ASSIGN TO</Text>
          {loadingTeam ? (
            <Text style={styles.muted}>Loading drivers…</Text>
          ) : drivers.length === 0 ? (
            <Banner tone="warning">
              No drivers have joined yet. Share your team code from the job board, then assign this
              job once they are in.
            </Banner>
          ) : (
            <View style={styles.pickerWrap}>
              <Picker selectedValue={driverId} onValueChange={setDriverId}>
                <Picker.Item label="Leave unassigned" value="" />
                {drivers.map((driver) => (
                  <Picker.Item
                    key={driver.id}
                    label={driver.full_name || 'Unnamed driver'}
                    value={driver.id}
                  />
                ))}
              </Picker>
            </View>
          )}
        </Card>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title="Send job" onPress={submit} loading={busy} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pair: { flexDirection: 'row', gap: spacing.md },
  pairItem: { flex: 1 },
  pickerWrap: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  muted: { ...type.body, color: colors.textMuted },
  error: { color: colors.danger, fontWeight: '600' },
});
