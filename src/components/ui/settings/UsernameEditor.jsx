// UsernameEditor — the inline edit state of the Settings username row.
//
// Dumb UI: it holds the draft text and nothing else. Validation,
// availability and the rename itself all live in the screen +
// usernameService, and come back in through `error` and `saving`.
//
// Inline rather than a modal so the rule hint and the error sit right
// under the field the user is typing in.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import VibeInput from '../VibeInput';
import VibeButton from '../VibeButton';
import theme from '../../../theme/themes';

export default function UsernameEditor({
  value,
  onChangeText,
  onSave,
  onCancel,
  saving = false,
  error,
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Username</Text>

      <VibeInput
        value={value}
        onChangeText={onChangeText}
        placeholder="new_handle"
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        maxLength={20}
        editable={!saving}
      />

      <Text style={error ? styles.error : styles.hint}>
        {error || '3–20 characters. Letters, numbers and underscores only.'}
      </Text>

      <Text style={styles.note}>
        {"Renaming also updates your name on every snapple and prompt " +
         "you've posted. Comments you've already left keep the old one."}
      </Text>

      {/* Both buttons use the SAME variant on purpose. The `green`
          variant is a nested border + fill with its own padding and a
          10px vertical margin, so pairing it with a `toggle` left
          Cancel visibly taller than Save. Same variant = same box. */}
      <View style={styles.actions}>
        <VibeButton
          label="Cancel"
          onPress={onCancel}
          variant="toggle"
          color="gray"
          disabled={saving}
          style={styles.action}
        />
        <VibeButton
          label={saving ? 'Saving…' : 'Save'}
          onPress={onSave}
          variant="toggle"
          color="green"
          disabled={saving}
          style={styles.action}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  label: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  hint: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 6 },
  error: { color: theme.colors.vibeRed, fontSize: 12, marginTop: 6, fontWeight: '600' },
  note: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 8,
    fontStyle: 'italic',
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  action: { flex: 1 },
});
