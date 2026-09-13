import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Field } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';
import type { Job } from '@/lib/types';

/**
 * The closing report.
 *
 * Both figures are pre-filled with what was ordered, because the usual case is
 * that everything matched and the driver should not have to retype it. When
 * they differ the mismatch is spelled out before the job is closed, since that
 * is the number the dispatcher will be reconciling against the day's takings.
 */
export function CompletionForm({
  job,
  currency,
  onComplete,
}: {
  job: Job;
  currency: string;
  onComplete: (deliveredCount: number, cashCollected: number, notes: string) => Promise<void>;
}) {
  const [delivered, setDelivered] = useState(String(job.product_count));
  const [cash, setCash] = useState(job.cash_to_collect.toFixed(2));
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deliveredCount = Number(delivered);
  const cashCollected = Number(cash);
  const validCount = Number.isInteger(deliveredCount) && deliveredCount >= 0;
  const validCash = Number.isFinite(cashCollected) && cashCollected >= 0;

  const productGap = validCount ? job.product_count - deliveredCount : 0;
  const cashGap = validCash ? Number((job.cash_to_collect - cashCollected).toFixed(2)) : 0;
  const hasMismatch = productGap !== 0 || cashGap !== 0;

  const submit = async () => {
    if (!validCount) {
      setError('Enter how many products you handed over, as a whole number.');
      return;
    }
    if (!validCash) {
      setError('Enter how much cash you collected.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onComplete(deliveredCount, cashCollected, notes.trim());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not complete the job.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Text style={styles.title}>Complete the delivery</Text>
      <Text style={styles.sub}>
        Confirm what you actually handed over and collected. This is what your dispatcher sees.
      </Text>

      {error ? <Banner tone="error" message={error} /> : null}

      <Field
        label={`Products delivered (ordered: ${job.product_count})`}
        value={delivered}
        onChangeText={setDelivered}
        keyboardType="number-pad"
      />

      <Field
        label={`Cash collected (expected: ${formatMoney(job.cash_to_collect, currency)})`}
        value={cash}
        onChangeText={setCash}
        keyboardType="decimal-pad"
        hint={validCash ? formatMoney(cashCollected, currency) : undefined}
      />

      {hasMismatch ? (
        <View style={styles.mismatch}>
          <Text style={styles.mismatchTitle}>This does not match the order</Text>
          {productGap !== 0 ? (
            <Text style={styles.mismatchText}>
              {Math.abs(productGap)} product{Math.abs(productGap) === 1 ? '' : 's'}{' '}
              {productGap > 0 ? 'short' : 'over'}.
            </Text>
          ) : null}
          {cashGap !== 0 ? (
            <Text style={styles.mismatchText}>
              {formatMoney(Math.abs(cashGap), currency)} {cashGap > 0 ? 'short' : 'over'} on cash.
            </Text>
          ) : null}
          <Text style={styles.mismatchText}>Say why in the note below.</Text>
        </View>
      ) : null}

      <Field
        label="Note for your dispatcher"
        value={notes}
        onChangeText={setNotes}
        placeholder={hasMismatch ? 'Why the numbers differ' : 'Optional'}
        multiline
      />

      <Button label="Complete delivery" variant="success" onPress={submit} loading={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: spacing.xs },
  sub: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: spacing.lg },
  mismatch: {
    backgroundColor: '#D9770622',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: 2,
  },
  mismatchTitle: { color: colors.warning, fontSize: 14, fontWeight: '700', marginBottom: spacing.xs },
  mismatchText: { color: colors.text, fontSize: 13, lineHeight: 19 },
});
