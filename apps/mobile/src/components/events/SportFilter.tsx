import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import { LUXURY_THEME } from '../../constants/theme';

type SportFilterType = 'ALL' | 'NFL' | 'NBA';

interface SportFilterProps {
  selected: SportFilterType;
  onSelect: (sport: SportFilterType) => void;
}

const SPORTS: SportFilterType[] = ['ALL', 'NFL', 'NBA'];

/**
 * Premium segmented control for sport filtering
 *
 * Features:
 * - Smooth animated selection indicator
 * - Spring physics for natural motion
 * - Proper accessibility labels
 * - 44pt minimum touch targets
 * - Haptic-like visual feedback
 */
export function SportFilter({ selected, onSelect }: SportFilterProps) {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Calculate position based on selected index
  const selectedIndex = SPORTS.indexOf(selected);

  useEffect(() => {
    // Animate selection indicator to new position with spring physics
    Animated.spring(slideAnim, {
      toValue: selectedIndex,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();

    // Subtle scale animation for selection feedback
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.05,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, [selectedIndex, slideAnim, scaleAnim]);

  const handleSelect = (sport: SportFilterType) => {
    if (sport !== selected) {
      onSelect(sport);
    }
  };

  // Calculate indicator position (each segment is approximately 33.33% width)
  const indicatorTranslateX = slideAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: ['0%', '100%', '200%'],
  });

  return (
    <View className="px-4 py-3">
      <View className="bg-surface rounded-2xl p-1" style={styles.container}>
        {/* Animated selection indicator */}
        <Animated.View
          className="absolute bg-primary rounded-xl"
          style={[
            styles.indicator,
            {
              transform: [{ translateX: indicatorTranslateX }, { scale: scaleAnim }],
            },
          ]}
        />

        {/* Sport buttons */}
        <View className="flex-row">
          {SPORTS.map((sport, index) => {
            const isSelected = sport === selected;

            return (
              <Pressable
                key={sport}
                onPress={() => handleSelect(sport)}
                className="flex-1 items-center justify-center"
                style={({ pressed }) => [
                  styles.button,
                  pressed && !isSelected && styles.buttonPressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`Filter by ${sport === 'ALL' ? 'all sports' : sport}`}
              >
                <Text
                  className={`font-bold text-base ${
                    isSelected ? 'text-text-primary' : 'text-text-muted'
                  }`}
                  style={isSelected && styles.selectedText}
                >
                  {sport}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    width: '31.5%', // Slightly less than 33.33% to account for padding
    height: '100%',
    shadowColor: LUXURY_THEME.gold.main,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  button: {
    // Ensure minimum 44pt touch target
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 16,
    zIndex: 1, // Ensure buttons are above indicator
  },
  buttonPressed: {
    opacity: 0.7,
  },
  selectedText: {
    textShadowColor: 'rgba(214, 179, 106, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
