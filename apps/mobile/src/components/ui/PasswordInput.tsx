import React, { useState } from 'react';
import {
  TextInput,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import type { InputProps } from './Input';

export interface PasswordInputProps extends Omit<InputProps, 'secureTextEntry'> {
  showStrengthIndicator?: boolean;
}

export const PasswordInput = React.forwardRef<TextInput, PasswordInputProps>(
  (
    {
      label = 'Password',
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
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const hasError = !!error;

    const togglePasswordVisibility = () => {
      setIsPasswordVisible(!isPasswordVisible);
    };

    return (
      <View className={`mb-4 ${containerClassName}`}>
        {label && (
          <Text
            className={`text-sm font-medium text-gray-200 mb-2 ${labelClassName}`}
          >
            {label}
          </Text>
        )}

        <View className="relative">
          <TextInput
            ref={ref}
            testID={testID}
            className={`
              px-4 py-3 pr-12 rounded-lg text-base text-white
              bg-surface border
              ${hasError ? 'border-error' : 'border-gray-700'}
              ${props.editable === false ? 'opacity-50' : ''}
              ${inputClassName}
            `}
            style={[styles.input, style]}
            placeholderTextColor="#9ca3af"
            secureTextEntry={!isPasswordVisible}
            autoCapitalize="none"
            autoCorrect={false}
            {...props}
          />

          <TouchableOpacity
            onPress={togglePasswordVisibility}
            className="absolute right-0 top-0 h-full px-3 justify-center"
            style={styles.toggleButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <Text className="text-gray-400 text-sm font-medium">
              {isPasswordVisible ? 'Hide' : 'Show'}
            </Text>
          </TouchableOpacity>
        </View>

        {hasError && error && (
          <Text
            className={`text-xs text-error mt-1 ${errorClassName}`}
          >
            {error}
          </Text>
        )}

        {!hasError && helperText && (
          <Text className="text-xs text-gray-400 mt-1">
            {helperText}
          </Text>
        )}
      </View>
    );
  }
);

PasswordInput.displayName = 'PasswordInput';

const styles = StyleSheet.create({
  input: {
    // Ensure minimum touch target of 44px
    minHeight: 44,
    // Improve text rendering on Android
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  toggleButton: {
    // Ensure minimum touch target
    minHeight: 44,
    minWidth: 44,
  },
});
