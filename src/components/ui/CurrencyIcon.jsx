// CurrencyIcon — draws a coin, ticket or trophy at a given size.
//
// Every currency glyph in the app goes through here, so the art is
// consistent everywhere and swapping it is one file. Takes the currency
// by NAME rather than an image, so callers never touch an asset path
// and can't reintroduce the drift this replaced.

import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { currencyFor } from '../../lib/currency';

/**
 * @param {string} name  coins | tickets | tokens | trophies
 * @param {number} size  box height in points; the icon is optically
 *   scaled within it (see CURRENCY.scale)
 */
export default function CurrencyIcon({ name, size = 20, style }) {
  const currency = currencyFor(name);

  // An unknown currency renders nothing rather than a broken image or a
  // fallback glyph - a wrong icon on a spend button is worse than none.
  if (!currency) return null;

  const inner = Math.round(size * currency.scale);

  return (
    <View
      style={[{ width: size, height: size }, styles.box, style]}
      pointerEvents="none"
    >
      <Image
        source={currency.source}
        // contain, so the optical scale is the only thing deciding
        // apparent size and a wide asset is never squashed to fit.
        resizeMode="contain"
        style={{ width: inner, height: inner }}
      />
    </View>
  );
}

/**
 * Icon plus amount, the pairing the resource bar and the store both
 * want. Kept here so the gap between the two is consistent - it was
 * being re-invented at every call site.
 */
export function CurrencyAmount({ name, amount, size = 20, textStyle, style }) {
  return (
    <View style={[styles.row, style]}>
      <CurrencyIcon name={name} size={size} />
      <Text style={[styles.amount, { fontSize: size * 0.7 }, textStyle]}>
        {typeof amount === 'number' ? amount.toLocaleString() : amount}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  amount: {
    color: 'white',
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
