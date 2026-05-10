// Vote-aura card for the voting wait screen. Renders a snapple thumbnail
// wrapped in a segmented multi-color border — one stripe per voter, in
// each voter's assigned color. Chips below show voter names with matching
// colored borders. A one-shot pulse fires on each new vote so the energy
// ramps up as more people pile on.

import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import SnappleThumbnailImg from '../ui/SnappleThumbnail';
import theme from '../../theme/themes';

// voters: [{ uid, name, color, isMe }, ...] in vote-arrival order
// picker (optional): { name, color, isMe, opacity? } — when present,
//   renders the picker's name below the card. Pass an Animated.Value
//   as opacity to fade it in (e.g. when all-voted lands).
const VoteAuraCard = React.memo(function VoteAuraCard({ submission, voters, picker, onPress }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const prevCountRef = useRef(voters?.length || 0);

  useEffect(() => {
    const current = voters?.length || 0;
    if (current > prevCountRef.current) {
      pulse.setValue(0);
      Animated.timing(pulse, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }).start();
    }
    prevCountRef.current = current;
  }, [voters?.length]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.9, 0] });

  const colors = (voters || []).map(v => v.color);
  const hasVoters = colors.length > 0;
  const auraThickness = 3;

  return (
    <Pressable onPress={onPress} style={styles.wrap}>
      {/* One-shot expanding pulse ring on each new vote. Uses the latest
          voter's color so the burst feels personal. */}
      {hasVoters && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pulseRing,
            {
              borderColor: colors[colors.length - 1],
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            },
          ]}
        />
      )}

      {/* Segmented multi-color aura around the video — one stripe per voter
          on each side. Wraps just the video, no extra card chrome. */}
      <View style={styles.videoFrame}>
        <View style={styles.video}>
          {submission?.videoUrl ? <SnappleThumbnailImg videoUrl={submission.videoUrl} /> : null}
        </View>

        {hasVoters && (
          <>
            <View style={[styles.auraStripTop, { height: auraThickness }]}>
              {colors.map((c, i) => (
                <View key={`t-${i}`} style={{ flex: 1, backgroundColor: c }} />
              ))}
            </View>
            <View style={[styles.auraStripBottom, { height: auraThickness }]}>
              {colors.map((c, i) => (
                <View key={`b-${i}`} style={{ flex: 1, backgroundColor: c }} />
              ))}
            </View>
            <View style={[styles.auraStripLeft, { width: auraThickness }]}>
              {colors.map((c, i) => (
                <View key={`l-${i}`} style={{ flex: 1, backgroundColor: c }} />
              ))}
            </View>
            <View style={[styles.auraStripRight, { width: auraThickness }]}>
              {colors.map((c, i) => (
                <View key={`r-${i}`} style={{ flex: 1, backgroundColor: c }} />
              ))}
            </View>
          </>
        )}
      </View>

      {picker && (
        <Animated.Text
          style={[
            styles.pickerName,
            { color: picker.color, opacity: picker.opacity ?? 1 },
            picker.isMe && styles.pickerNameMe,
          ]}
          numberOfLines={1}
        >
          {picker.name}
        </Animated.Text>
      )}
    </Pressable>
  );
});

export default VoteAuraCard;

const styles = StyleSheet.create({
  wrap: {
    width: 100,
    margin: 4,
    alignItems: 'center',
  },
  videoFrame: {
    width: 100,
    aspectRatio: 9 / 16,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  video: {
    flex: 1,
  },
  pulseRing: {
    position: 'absolute',
    top: -8,
    left: -8,
    right: -8,
    height: 178,
    borderRadius: 16,
    borderWidth: 2,
  },
  auraStripTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
  },
  auraStripBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
  },
  auraStripLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
  },
  auraStripRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
  },
  pickerName: {
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '600',
    width: 100,
  },
  pickerNameMe: {
    fontWeight: 'bold',
  },
});
