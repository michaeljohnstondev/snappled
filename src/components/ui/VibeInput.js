import React, { forwardRef } from 'react';
import { TextInput, StyleSheet } from 'react-native';
import theme from '../../theme/themes';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';

const VibeInput = forwardRef(({
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  multiline,
  onContentSizeChange,
  style,
  isCompleted,
  hasDropdownOpen,
  onFocus,
  onBlur,
  autoComplete,
  textContentType,
  importantForAutofill,
  autoCorrect,
  autoCapitalize,
  spellCheck,
  dataDetectorTypes,
  maxLength,
  ...otherProps
}, ref) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <TextInput
      ref={ref}
      placeholder={placeholder}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      multiline={multiline}
      onContentSizeChange={onContentSizeChange}
      onFocus={onFocus}
      onBlur={onBlur}
      autoComplete={autoComplete}
      textContentType={textContentType}
      importantForAutofill={importantForAutofill}
      autoCorrect={autoCorrect}
      autoCapitalize={autoCapitalize}
      spellCheck={spellCheck}
      dataDetectorTypes={dataDetectorTypes}
      maxLength={maxLength}
      placeholderTextColor="#aaa"
      style={[
        styles.input,
        isCompleted && styles.completedInput,
        hasDropdownOpen && styles.inputWithDropdown,
        style,
      ]}
      {...otherProps}
    />
  );
});

VibeInput.displayName = 'VibeInput';

export default VibeInput;

const makeStyles = (t) => ({
  input: {
    borderWidth: 3,
    borderColor: theme.colors.vibeBlue,
    borderRadius: theme.sizes.borderRadius,
    padding: theme.sizes.inputPadding,
    fontSize: 16,
    fontFamily: theme.fonts.main,
    color: t.colors.textPrimary,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  completedInput: {
    // Keep neon blue regardless of state
  },
  inputWithDropdown: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
});
