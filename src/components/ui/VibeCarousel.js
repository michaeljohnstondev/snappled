import React, { useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Carousel from 'react-native-reanimated-carousel';

const { width, height } = Dimensions.get('window');

export default function VibeCarousel({ data, renderItem }) {
  const [isScrolling, setIsScrolling] = useState(false);

  return (
    <View style={styles.container}>
      <Carousel
        width={width * 0.95}
        height={160}
        autoPlay={false}
        data={data}
        scrollAnimationDuration={600}
        loop={false}
        renderItem={({ item }) => renderItem(item, isScrolling)}
        sliderWidth={Dimensions.get('window').width}
        itemWidth={Dimensions.get('window').width * 0.9}
        contentContainerCustomStyle={{ paddingBottom: 30 }}
        // Add these props to improve gesture recognition
        panGestureHandlerProps={{
          activeOffsetX: [-15, 15], // Horizontal swipe threshold
          failOffsetY: [-100, 100], // Prevent accidental vertical scrolls
          shouldCancelWhenOutside: true,
        }}
        onScrollBegin={() => setIsScrolling(true)}
        onScrollEnd={() => {
          // Small delay to ensure scroll has fully ended
          setTimeout(() => setIsScrolling(false), 100);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 0,
    alignItems: 'center',
    overflow: 'visible',
  },
});
