import React from 'react';
import {
  TextInput,
  TextInputProps,
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { LUXURY_THEME } from '../../constants/theme';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  helperText?: string;
  containerClassName?: string;
  labelClassName?: string;
  inputClassName?: string;
  errorClassName?: string;
  /** testID for E2E testing - applied to the TextInput element */
  testID?: string;
}

export const Input = React.forwardRef<TextInput, InputProps>(
  (
    {
      label,
      error,
      helperText,
      containerClassName = '',
      labelClassName = '',
      inputClassName = '',
      errorClassName = '',
      style,
      testID,
      ...props
    },
    ref
  ) => {
    const hasError = !!error;

    return (
      <View className={`mb-4 ${containerClassName}`}>
        {label && (
          <Text
            className={`text-sm font-medium text-text-secondary mb-2 ${labelClassName}`}
          >
            {label}
          </Text>
        )}

        <TextInput
          ref={ref}
          testID={testID}
          className={`
            px-4 py-3 rounded-lg text-base text-text-primary
            bg-surface border
            ${hasError ? 'border-error' : 'border-gray-700'}
            ${props.editable === false ? 'opacity-50' : ''}
            ${inputClassName}
          `}
          style={[styles.input, style]}
          placeholderTextColor={LUXURY_THEME.text.muted}
          {...props}
        />

        {hasError && error && (
          <Text
            className={`text-xs text-error mt-1 ${errorClassName}`}
          >
            {error}
          </Text>
        )}

        {!hasError && helperText && (
          <Text className="text-xs text-text-secondary mt-1">
            {helperText}
          </Text>
        )}
      </View>
    );
  }
);

Input.displayName = 'Input';

const styles = StyleSheet.create({
  input: {
    // Ensure minimum touch target of 44px
    minHeight: 44,
    // Improve text rendering on Android
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
