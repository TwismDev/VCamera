import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, Field, Screen } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { geocodeAddress } from '@/services/eta';
import { colors, spacing, type } from '@/theme';

/**
 * A driver logging work they picked up themselves — a walk-up, or a customer
 * who called them directly.
 *
 * It lands on the dispatcher's board like any other job, marked as the driver's
 * own, and is created already accepted: the driver raised it, so there is
 * nothing for them to accept.
 */
export default function DriverNewJob() {
  const { profile } = useAuth();
  const router = useRouter();

  const [address, setAddress] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [productCount, setProductCount] = useState('1');
  const [cash, setCash] = useState('0');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!profile?.org_id) return;
    if (!address.trim()) return setError('Where is it going?');

    const products = Number.parseInt(productCount, 10);
    const cashAmount = Number.parseFloat(cash);
    if (!Number.isFinite(products) || products < 0) {
      return setError('Number of items must be a whole number.');
    }
    if (!Number.isFinite(cashAmount) || cashAmount < 0) {
      return setError('Cash to collect must be a number.');
    }

    setBusy(true);
    setError(null);

    const coords = await geocodeAddress(address);

    const { data, error: insertError } = await supabase
      .from('jobs')
      .insert({
        org_id: profile.org_id,
        created_by: profile.id,
        driver_id: profile.id,
        origin: 'driver',
        // Raised by the driver, so it is theirs already — no accept step.
        status: 'accepted',
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
    router.replace(`/driver/job/${data.id}`);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <Screen>
        <Banner tone="info">
          Your dispatcher sees this on their board straight away, and can track you on it like any
          other job.
        </Banner>

        <Card>
          <Field
            label="Delivery address"
            value={address}
            onChangeText={setAddress}
            placeholder="12 Bourke St, Melbourne VIC"
            multiline
            hint="Looked up automatically, so your ETA and the map pin work right away."
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
                label="Number of items"
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
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Anything worth recording about this one"
          />
        </Card>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title="Add job" onPress={submit} loading={busy} />
        <Text style={styles.muted}>
          You can correct the details on your own jobs afterwards. Jobs your dispatcher sends you
          are theirs to change.
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pair: { flexDirection: 'row', gap: spacing.md },
  pairItem: { flex: 1 },
  error: { color: colors.danger, fontWeight: '600' },
  muted: { ...type.body, color: colors.textMuted, textAlign: 'center' },
});
