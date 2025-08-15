import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../store/AuthContext';
import { formatTimestamp } from '../../lib/commentUtils';
import theme from '../../theme/themes';

const CommentItem = ({ comment, onDelete }) => {
  const { currentUserId } = useAuth();
  const isOwner = currentUserId === comment.userId;

  // Border + glow spec per role
  const getGradientSpec = () => {
    if (isOwner) {
      return {
        colors: ['#99ff33', '#00cc11'],
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
        glowColor: '#6aff2e',
      };
    } else if (comment.userRole === 'admin') {
      return {
        colors: ['#bb8adbff', '#581488ff', '#54128d', '#bb8adbff'],
        locations: [0, 0.35, 0.65, 1],
        start: { x: 0, y: 0.5 },
        end: { x: 1, y: 0.5 },
        glowColor: '#a86bff',
      };
    } else if (comment.userRole === 'host') {
      return {
        colors: ['#ffff00', '#ff9900'],
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
        glowColor: '#ffd34d',
      };
    } else {
      return {
        colors: ['#00f2fe', '#4facfe'],
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
        glowColor: '#62d3ff',
      };
    }
  };

  const { colors, locations, start, end, glowColor } = getGradientSpec();

  const handleDelete = () => {
    Alert.alert(
      'Delete Comment',
      'Are you sure you want to delete this comment?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete(comment.id, comment.userId),
        },
      ]
    );
  };

  return (
    <View style={styles.wrapper}>
      {/* Outer glow layer */}
      <View
        pointerEvents="none"
        style={[
          styles.glow,
          Platform.select({
            ios: {
              shadowColor: glowColor,
            },
            android: {},
          }),
        ]}
      />

      {/* Gradient border */}
      <LinearGradient
        colors={colors}
        {...(locations ? { locations } : {})}
        start={start}
        end={end}
        style={styles.gradient}
      >
        {/* Inner card */}
        <View style={styles.card}>
          <LinearGradient
            colors={['#0c1426', '#1a1f3a']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardBackground}
          >
            <View style={styles.header}>
              <View style={styles.leftHeader}>
                <Text style={styles.userName}>{comment.userName}</Text>
                <Text style={styles.timestamp}>
                  {formatTimestamp(comment.timestamp)}
                </Text>
              </View>

              {isOwner && (
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={handleDelete}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.deleteButtonText}>×</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.content}>{comment.content}</Text>
          </LinearGradient>
        </View>
      </LinearGradient>
    </View>
  );
};

const RADIUS = 14;
const BORDER_THICKNESS = 2;

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    paddingHorizontal: 4,
    marginBottom: 8,
    alignSelf: 'center',
    // Android glow helper (directional)
    ...Platform.select({
      android: { elevation: 8 },
    }),
  },
  // iOS true glow; Android gets elevation above
  glow: {
    position: 'absolute',
    top: -6,
    bottom: -6,
    left: -6,
    right: -6,
    borderRadius: RADIUS + 22,
    ...Platform.select({
      ios: {
        shadowOpacity: 0.9,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 0 },
      },
    }),
  },
  gradient: {
    borderRadius: RADIUS + BORDER_THICKNESS,
    padding: BORDER_THICKNESS,
  },
  card: {
    borderRadius: RADIUS,
    overflow: 'hidden',
  },
  cardBackground: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  leftHeader: {
    flex: 1,
  },
  userName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  timestamp: {
    color: '#ddd',
    fontSize: 12,
    fontWeight: '400',
  },
  deleteButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    lineHeight: 18,
  },
  content: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  },
});

export default CommentItem;
