import React from 'react';
import {
  TouchableOpacity,
  TouchableOpacityProps,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
} from 'react-native';
import { LUXURY_THEME } from '../../constants/theme';

export interface ButtonProps extends TouchableOpacityProps {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  children: React.ReactNode;
  fullWidth?: boolean;
  className?: string;
  /** testID for E2E testing */
  testID?: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  children,
  fullWidth = false,
  disabled,
  className = '',
  testID,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || isLoading;

  // Variant styles
  const variantStyles = {
    primary: 'bg-primary',
    secondary: 'bg-surface-elevated',
    outline: 'bg-transparent border-2 border-primary',
    ghost: 'bg-transparent',
  };

  const textVariantStyles = {
    primary: 'text-text-primary',
    secondary: 'text-text-secondary',
    outline: 'text-primary',
    ghost: 'text-primary',
  };

  // Size styles
  const sizeStyles = {
    sm: 'py-2 px-4',
    md: 'py-3 px-6',
    lg: 'py-4 px-8',
  };

  const textSizeStyles = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  return (
    <TouchableOpacity
      disabled={isDisabled}
      activeOpacity={0.8}
      testID={testID}
      className={`
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        rounded-lg
        items-center
        justify-center
        ${fullWidth ? 'w-full' : ''}
        ${isDisabled ? 'opacity-50' : ''}
        ${className}
      `}
      style={styles.button}
      {...props}
    >
      {isLoading ? (
        <View className="flex-row items-center justify-center">
          <ActivityIndicator
            size="small"
            color={variant === 'primary' ? LUXURY_THEME.bg.primary : LUXURY_THEME.gold.main}
          />
          <Text
            className={`
              ${textVariantStyles[variant]}
              ${textSizeStyles[size]}
              font-semibold
              ml-2
            `}
          >
            Loading...
          </Text>
        </View>
      ) : (
        <Text
          className={`
            ${textVariantStyles[variant]}
            ${textSizeStyles[size]}
            font-semibold
          `}
        >
          {children}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    // Ensure minimum touch target of 44px
    minHeight: 44,
    // Add subtle shadow for depth
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
});
