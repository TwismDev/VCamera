import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { createJob } from '@/api/jobs';
import { listDrivers } from '@/api/profiles';
import { geocodeAddress } from '@/api/routing';
import { Banner, Button, Field, Screen } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';
import type { Profile } from '@/lib/types';
import { useActiveSession } from '@/state/session';

export default function NewJob() {
  const { org, userId } = useActiveSession();
  const router = useRouter();

  const [address, setAddress] = useState('');
  const [productCount, setProductCount] = useState('');
  const [cash, setCash] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [assignTo, setAssignTo] = useState<string | null>(null);

  const [drivers, setDrivers] = useState<Profile[]>([]);
  const [located, setLocated] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    listDrivers(org.id)
      .then((all) => setDrivers(all.filter((driver) => driver.is_active)))
      .catch(() => setDrivers([]));
  }, [org.id]);

  /**
   * Resolving the address up front is optional but worth doing: with
   * coordinates stored the driver's ETA is computed against an exact point and
   * the pin lands in the right place on the map.
   */
  const checkAddress = async () => {
    setError(null);
    setNotice(null);
    if (address.trim().length < 4) {
      setError('Enter the delivery address first.');
      return;
    }

    setLocating(true);
    try {
      const result = await geocodeAddress(address.trim());
      setLocated({ lat: result.lat, lng: result.lng, label: result.formatted_address });
      setNotice(`Found: ${result.formatted_address}`);
    } catch (caught) {
      setLocated(null);
      setError(
        caught instanceof Error
          ? `${caught.message}. You can still send the job; the driver's app will look the address up.`
          : 'Address lookup failed.',
      );
    } finally {
      setLocating(false);
    }
  };

  const submit = async () => {
    setError(null);

    const count = Number(productCount);
    const cashAmount = Number(cash === '' ? '0' : cash);

    if (address.trim().length < 4) {
      setError('Enter the delivery address.');
      return;
    }
    if (!Number.isInteger(count) || count < 0) {
      setError('Enter the number of products as a whole number.');
      return;
    }
    if (!Number.isFinite(cashAmount) || cashAmount < 0) {
      setError('Enter the cash to collect as a number, or leave it at zero.');
      return;
    }

    setBusy(true);
    try {
      await createJob({
        orgId: org.id,
        createdBy: userId,
        address: located?.label ?? address.trim(),
        addressLat: located?.lat ?? null,
        addressLng: located?.lng ?? null,
        productCount: count,
        cashToCollect: cashAmount,
        customerName: customerName.trim() || null,
        customerPhone: customerPhone.trim() || null,
        notes: notes.trim() || null,
        assignTo,
      });
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the delivery.');
    } finally {
      setBusy(false);
    }
  };

  const cashPreview = Number(cash);

  return (
    <Screen scroll>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {error ? <Banner tone="error" message={error} /> : null}
        {notice ? <Banner tone="success" message={notice} /> : null}

        <Field
          label="Delivery address"
          value={address}
          onChangeText={(next) => {
            setAddress(next);
            setLocated(null);
          }}
          placeholder="24 Harbour Road, Cape Town"
          multiline
        />

        <Button
          label={located ? 'Address confirmed' : 'Check address on the map'}
          variant={located ? 'success' : 'ghost'}
          onPress={checkAddress}
          loading={locating}
          style={styles.checkButton}
        />

        <Field
          label="Number of products"
          value={productCount}
          onChangeText={setProductCount}
          placeholder="12"
          keyboardType="number-pad"
        />

        <Field
          label="Cash to collect on delivery"
          value={cash}
          onChangeText={setCash}
          placeholder="0.00"
          keyboardType="decimal-pad"
          hint={
            Number.isFinite(cashPreview) && cash !== ''
              ? formatMoney(cashPreview, org.currency)
              : `Leave empty if nothing is owed. Amounts are in ${org.currency}.`
          }
        />

        <Field
          label="Customer name"
          value={customerName}
          onChangeText={setCustomerName}
          placeholder="Optional"
          autoCapitalize="words"
        />

        <Field
          label="Customer phone"
          value={customerPhone}
          onChangeText={setCustomerPhone}
          placeholder="Optional"
          keyboardType="phone-pad"
        />

        <Field
          label="Notes for the driver"
          value={notes}
          onChangeText={setNotes}
          placeholder="Gate code, parking, who to ask for"
          multiline
        />

        <Text style={styles.sectionLabel}>Send to</Text>
        <View style={styles.driverList}>
          <Pressable
            onPress={() => setAssignTo(null)}
            style={[styles.driverChip, assignTo === null && styles.driverChipActive]}
          >
            <Text style={[styles.driverChipText, assignTo === null && styles.driverChipTextActive]}>
              Leave unassigned
            </Text>
          </Pressable>

          {drivers.map((driver) => {
            const active = assignTo === driver.id;
            return (
              <Pressable
                key={driver.id}
                onPress={() => setAssignTo(driver.id)}
                style={[styles.driverChip, active && styles.driverChipActive]}
              >
                <Text style={[styles.driverChipText, active && styles.driverChipTextActive]}>
                  {driver.full_name || 'Unnamed driver'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {drivers.length === 0 ? (
          <Text style={styles.hint}>
            No drivers have joined yet. Share your team code from the Team tab, then assign this job.
          </Text>
        ) : null}

        <Button label="Create delivery" onPress={submit} loading={busy} style={styles.submit} />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  checkButton: { marginBottom: spacing.lg },
  sectionLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600', marginBottom: spacing.sm },
  driverList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  driverChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  driverChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  driverChipText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  driverChipTextActive: { color: colors.primaryText },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: spacing.md },
  submit: { marginTop: spacing.md },
});
