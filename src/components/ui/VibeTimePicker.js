import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
  Pressable,
  BackHandler,
  Keyboard,
  Platform,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '../../theme/themes';

// Constants
const TIME_CONFIG = {
  HOURS: [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  MINUTES: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55], // 5-minute increments
  PERIODS: ['AM', 'PM'],
};

// Utility Functions
const createTimeFromSelection = (hour, minute, period) => {
  const newTime = new Date();
  let hour24 = hour;
  if (period === 'PM' && hour !== 12) hour24 += 12;
  if (period === 'AM' && hour === 12) hour24 = 0;
  newTime.setHours(hour24, minute, 0, 0);
  return newTime;
};

const parseTimeToSelection = (time) => ({
  hour: time.getHours() % 12 || 12,
  minute: Math.floor(time.getMinutes() / 5) * 5, // Round to nearest 5 minutes
  period: time.getHours() >= 12 ? 'PM' : 'AM',
});

const formatDisplayTime = (hour, minute, period) => {
  return `${hour}:${minute.toString().padStart(2, '0')} ${period}`;
};

// Themed Picker Button Component
const ThemedPickerButton = React.memo(({ label, onPress, selected }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      { opacity: pressed ? 0.8 : 1 },
      styles.pickerButton,
      !selected && styles.unselectedPickerButton,
    ]}
  >
    {selected ? (
      <LinearGradient
        colors={theme.colors.buttonGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.selectedPickerGradient}
      >
        <Text style={styles.selectedPickerText}>{label}</Text>
      </LinearGradient>
    ) : (
      <View style={styles.unselectedPickerContent}>
        <Text style={styles.unselectedPickerText}>{label}</Text>
      </View>
    )}
  </Pressable>
));

// Done Button Component
const DoneButton = React.memo(({ onPress, label = 'Done' }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }, styles.doneButton]}
  >
    <LinearGradient
      colors={theme.colors.buttonGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.doneButtonGradient}
    >
      <Text style={styles.doneButtonText}>{label}</Text>
    </LinearGradient>
  </Pressable>
));

// Time Column Component with circular scrolling
const TimeColumn = React.memo(
  ({
    options,
    selectedValue,
    onSelect,
    formatter = (v) => v.toString(),
    circular = false,
    isInitialMount = false,
  }) => {
    const scrollViewRef = React.useRef(null);
    const hasSetInitialPosition = React.useRef(false);

    // For circular scrolling, create a much longer list by repeating the options
    const getCircularOptions = () => {
      if (!circular) return options;

      // Repeat the options multiple times to create smooth circular effect
      const repeats = 10; // Show 5 full cycles above and below
      const circularList = [];

      for (let i = 0; i < repeats; i++) {
        circularList.push(...options);
      }

      return circularList;
    };

    const displayOptions = getCircularOptions();
    const originalLength = options.length;

    // Only set initial position when modal first opens
    React.useEffect(() => {
      if (
        circular &&
        scrollViewRef.current &&
        isInitialMount &&
        !hasSetInitialPosition.current
      ) {
        // Start in the middle of our repeated list
        const middleStart = Math.floor(displayOptions.length / 2);
        const selectedIndex = options.findIndex((opt) => opt === selectedValue);

        // Calculate position to center the selected item in the visible area
        const scrollViewHeight = 240; // Height of our scroll view
        const itemHeight = 56; // button height + margins
        const visibleItems = Math.floor(scrollViewHeight / itemHeight); // ~4-5 items visible
        const centerOffset = Math.floor(visibleItems / 2) * itemHeight; // Offset to center

        const startPosition =
          (middleStart + selectedIndex) * itemHeight - centerOffset;

        // Set initial scroll position without animation
        setTimeout(() => {
          scrollViewRef.current?.scrollTo({
            y: Math.max(0, startPosition),
            animated: false,
          });
          hasSetInitialPosition.current = true;
        }, 100);
      }
    }, [circular, isInitialMount]); // Removed selectedValue from dependencies

    // Reset the flag when modal closes/opens
    React.useEffect(() => {
      if (!isInitialMount) {
        hasSetInitialPosition.current = false;
      }
    }, [isInitialMount]);

    const handleScroll = React.useCallback(
      (event) => {
        if (!circular) return;

        const offsetY = event.nativeEvent.contentOffset.y;
        const itemHeight = 56;
        const currentIndex = Math.round(offsetY / itemHeight);

        // If we're getting close to the ends, jump to the equivalent position in the middle
        const buffer = originalLength * 2; // 2 full cycles as buffer
        const totalItems = displayOptions.length;

        if (currentIndex < buffer) {
          // Near the top, jump to equivalent position further down
          const equivalentIndex = currentIndex + originalLength * 4;
          const newOffset = equivalentIndex * itemHeight;
          setTimeout(() => {
            scrollViewRef.current?.scrollTo({ y: newOffset, animated: false });
          }, 0);
        } else if (currentIndex > totalItems - buffer) {
          // Near the bottom, jump to equivalent position further up
          const equivalentIndex = currentIndex - originalLength * 4;
          const newOffset = equivalentIndex * itemHeight;
          setTimeout(() => {
            scrollViewRef.current?.scrollTo({ y: newOffset, animated: false });
          }, 0);
        }
      },
      [circular, originalLength, displayOptions.length]
    );

    const getActualValue = (displayIndex) => {
      if (!circular) return displayOptions[displayIndex];

      // Map any display index back to the original option
      const actualIndex = displayIndex % originalLength;
      return options[actualIndex];
    };

    return (
      <ScrollView
        ref={scrollViewRef}
        style={styles.timeScrollView}
        showsVerticalScrollIndicator={false}
        snapToInterval={54} // Updated to match itemHeight
        decelerationRate="fast"
        onMomentumScrollEnd={handleScroll}
        onScrollEndDrag={handleScroll}
      >
        {displayOptions.map((option, index) => {
          const actualValue = getActualValue(index);
          return (
            <ThemedPickerButton
              key={`${option}-${index}`}
              label={formatter(option)}
              onPress={() => onSelect(actualValue)}
              selected={selectedValue === actualValue}
            />
          );
        })}
      </ScrollView>
    );
  }
);

// Main Custom Time Picker Component
const VibeTimePicker = ({
  visible,
  onClose,
  onConfirm,
  initialTime = null,
  cancelText = 'Cancel',
  confirmText = 'Done',
}) => {
  // Get safe area insets (fallback for devices without safe area context)
  const getBottomPadding = () => {
    const { height } = Dimensions.get('window');
    // For iPhone X and newer (height >= 812), add extra bottom padding
    if (Platform.OS === 'ios' && height >= 812) {
      return 25;
    }
    return 15;
  };
  // If no initial time provided, use 12:00 PM
  const getDefaultTime = () => {
    const defaultTime = new Date();
    defaultTime.setHours(12, 0, 0, 0); // 12:00 PM
    return defaultTime;
  };

  const timeToUse = initialTime || getDefaultTime();
  const initialSelection = parseTimeToSelection(timeToUse);

  const [selectedHour, setSelectedHour] = useState(initialSelection.hour);
  const [selectedMinute, setSelectedMinute] = useState(initialSelection.minute);
  const [selectedPeriod, setSelectedPeriod] = useState(initialSelection.period);
  const [isFirstMount, setIsFirstMount] = useState(false);

  const handleClose = useCallback(() => {
    // Keep the current selection and confirm it
    const newTime = createTimeFromSelection(
      selectedHour,
      selectedMinute,
      selectedPeriod
    );
    Keyboard.dismiss(); // Dismiss keyboard if open
    onConfirm(newTime);
  }, [selectedHour, selectedMinute, selectedPeriod, onConfirm]);

  const handleCancel = useCallback(() => {
    // Reset to initial values when explicitly cancelled
    setSelectedHour(initialSelection.hour);
    setSelectedMinute(initialSelection.minute);
    setSelectedPeriod(initialSelection.period);
    Keyboard.dismiss(); // Dismiss keyboard if open
    onClose();
  }, [initialSelection, onClose]);

  // Handle background tap to keep selection and close
  const handleBackgroundPress = useCallback(() => {
    Keyboard.dismiss(); // Dismiss keyboard
    handleClose(); // Keep selection and close
  }, [handleClose]);

  // Handle Android back button
  React.useEffect(() => {
    if (!visible) return;

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        handleClose(); // Keep selection and close instead of canceling
        return true; // Prevent default behavior
      }
    );

    return () => backHandler.remove();
  }, [visible, handleClose]);

  // Update selection when initialTime changes and modal is visible
  React.useEffect(() => {
    if (visible) {
      const timeToUse = initialTime || getDefaultTime();
      const selection = parseTimeToSelection(timeToUse);
      setSelectedHour(selection.hour);
      setSelectedMinute(selection.minute);
      setSelectedPeriod(selection.period);
      setIsFirstMount(true);
    } else {
      setIsFirstMount(false);
    }
  }, [visible, initialTime]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose} // Keep selection when using back button
    >
      <Pressable
        style={styles.overlay}
        onPress={handleBackgroundPress}
        activeOpacity={1} // Prevents opacity change when pressed
      >
        <Pressable
          style={[styles.modal, { paddingBottom: getBottomPadding() }]}
          onPress={(e) => e.stopPropagation()} // Prevent event bubbling
        >
          {/* Header with labels and Done button */}
          <View style={styles.headerContainer}>
            <Text style={styles.columnLabel}>Hour</Text>
            <Text style={styles.columnLabel}>Min</Text>
            <DoneButton onPress={handleClose} label={confirmText} />
          </View>

          {/* Time Selection */}
          <View style={styles.timeContainer}>
            {/* Hour Column - Circular */}
            <View style={styles.timeColumn}>
              <TimeColumn
                options={TIME_CONFIG.HOURS}
                selectedValue={selectedHour}
                onSelect={setSelectedHour}
                circular={true}
                isInitialMount={isFirstMount}
              />
            </View>

            {/* Minute Column - Circular */}
            <View style={styles.timeColumn}>
              <TimeColumn
                options={TIME_CONFIG.MINUTES}
                selectedValue={selectedMinute}
                onSelect={setSelectedMinute}
                formatter={(value) => value.toString().padStart(2, '0')}
                circular={true}
                isInitialMount={isFirstMount}
              />
            </View>

            {/* Period Column */}
            <View style={styles.timeColumn}>
              <View style={styles.periodSelection}>
                {TIME_CONFIG.PERIODS.map((period) => (
                  <ThemedPickerButton
                    key={period}
                    label={period}
                    onPress={() => setSelectedPeriod(period)}
                    selected={selectedPeriod === period}
                  />
                ))}
              </View>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)', // Reduced opacity for less fade
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    // paddingBottom removed from here, now handled dynamically
  },
  headerContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 30,
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 15,
  },
  timeContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 20,
    justifyContent: 'space-around',
  },
  timeColumn: {
    flex: 1,
    alignItems: 'center',
  },
  columnLabel: {
    color: theme.colors.textSecondary,
    fontSize: 16, // Slightly larger
    fontWeight: '600', // Bolder
    fontFamily: theme.fonts.main,
    flex: 1,
    textAlign: 'center',
  },
  timeScrollView: {
    height: 250, // Updated to match your change
    width: 70, // Slightly wider
  },
  pickerButton: {
    height: 50,
    width: 70, // Fixed width for consistent sizing
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.sizes.borderRadius,
    marginVertical: 3, // Total height with margin = 56px
  },
  selectedPickerGradient: {
    height: '100%',
    width: '100%',
    borderRadius: theme.sizes.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedPickerText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '600',
    fontFamily: theme.fonts.main,
  },
  unselectedPickerButton: {
    backgroundColor: theme.colors.inputBackground,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  unselectedPickerContent: {
    height: '100%',
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: theme.sizes.borderRadius,
  },
  unselectedPickerText: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '500',
    fontFamily: theme.fonts.main,
  },
  periodSelection: {
    alignItems: 'center',
    gap: 6, // Space between AM/PM buttons
    paddingTop: 20, // Add some space from top
  },
  doneButton: {
    height: 40,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.sizes.borderRadius,
  },
  doneButtonGradient: {
    height: 50,
    width: '100%',
    borderRadius: theme.sizes.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 15,
  },
  doneButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: theme.fonts.main,
  },
});

export default VibeTimePicker;
