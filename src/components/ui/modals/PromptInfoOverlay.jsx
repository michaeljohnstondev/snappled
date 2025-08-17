import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import VibeButton from "../VibeButton";
import PromptMetrics from "../PromptMetrics";
import ButtonContainer from "../navigation/ButtonContainer";
import NavButton from "../navigation/NavButton";
import { useAuth } from "../../../store/AuthContext";
import { userService } from "../../../services/userService";
import theme from "../../../theme/themes";

export default function PromptInfoOverlay({
  visible,
  prompt,
  onClose,
  onLike,
  onDislike,
  onReport,
  onCreateSnapple,
  onCreatePrompt,
  onView,
  onVisitProfile,
  onFollowUser,
  navigation,
  onRefresh,
}) {
  const { user } = useAuth();
  const [userInteraction, setUserInteraction] = useState({
    hasLiked: false,
    hasDisliked: false,
    isFollowing: false,
  });
  const [localCounts, setLocalCounts] = useState({
    likeCount: 0,
    dislikeCount: 0,
    reportCount: 0,
    totalViews: 0,
    followerCount: 0,
  });
  // Track viewed prompts across the entire session (outside component state)
  const viewedPromptsRef = useRef(new Set());

  // Check user's existing interactions when prompt changes
  useEffect(() => {
    if (prompt && user?.uid) {
      console.log("[PromptInfoOverlay] Prompt data:", {
        id: prompt.id,
        likeCount: prompt.likeCount,
        dislikeCount: prompt.dislikeCount,
        likes: prompt.likes,
        dislikes: prompt.dislikes,
        creatorUsername: prompt.creatorUsername,
      });

      const hasLiked = prompt.likes?.includes(user.uid) || false;
      const hasDisliked = prompt.dislikes?.includes(user.uid) || false;
      
      // Check follow status from user service
      const checkFollowStatus = async () => {
        if (prompt.createdBy && user.uid) {
          const isFollowing = await userService.isFollowing(user.uid, prompt.createdBy);
          setUserInteraction({ hasLiked, hasDisliked, isFollowing });
        } else {
          setUserInteraction({ hasLiked, hasDisliked, isFollowing: false });
        }
      };
      
      checkFollowStatus();

      // Initialize local counts from prompt data and get creator's follower count
      const initializeCounts = async () => {
        let followerCount = 0;
        if (prompt.createdBy) {
          try {
            const followData = await userService.getFollowData(prompt.createdBy);
            if (followData.success) {
              followerCount = followData.followerCount || 0;
            }
          } catch (error) {
            console.error('[PromptInfoOverlay] Error getting follower count:', error);
          }
        }
        
        setLocalCounts({
          likeCount: prompt.likeCount || 0,
          dislikeCount: prompt.dislikeCount || 0,
          reportCount: prompt.reportCount || 0,
          totalViews: prompt.totalViews || 0,
          followerCount: followerCount,
        });
      };
      
      initializeCounts();
    }
  }, [prompt, user?.uid]);

  // Track view when overlay becomes visible
  useEffect(() => {
    if (visible && prompt && !viewedPromptsRef.current.has(prompt.id)) {
      // Mark this prompt as viewed for this session
      viewedPromptsRef.current.add(prompt.id);

      // Increment view count optimistically
      setLocalCounts((prev) => ({
        ...prev,
        totalViews: prev.totalViews + 1,
      }));

      // Call the onView callback to update database
      onView?.(prompt.id);
    }
  }, [visible, prompt]);

  const handleLike = async () => {
    if (userInteraction.hasLiked) return;

    // Optimistic UI update
    const wasDisliked = userInteraction.hasDisliked;
    setUserInteraction((prev) => ({
      ...prev,
      hasLiked: true,
      hasDisliked: false,
    }));
    setLocalCounts((prev) => ({
      ...prev,
      likeCount: prev.likeCount + 1,
      dislikeCount: wasDisliked ? prev.dislikeCount - 1 : prev.dislikeCount,
    }));

    try {
      const result = await onLike?.(prompt.id);
      if (!result?.success) {
        // Revert optimistic update on failure
        setUserInteraction((prev) => ({
          ...prev,
          hasLiked: false,
          hasDisliked: wasDisliked,
        }));
        setLocalCounts((prev) => ({
          ...prev,
          likeCount: prev.likeCount - 1,
          dislikeCount: wasDisliked ? prev.dislikeCount + 1 : prev.dislikeCount,
        }));
        Alert.alert("Error", "Failed to like prompt");
      }
    } catch (error) {
      console.error("[PromptInfoOverlay] Error liking prompt:", error);
      Alert.alert("Error", "Failed to like prompt");
    }
  };

  const handleDislike = async () => {
    if (userInteraction.hasDisliked) return;

    // Optimistic UI update
    const wasLiked = userInteraction.hasLiked;
    setUserInteraction((prev) => ({
      ...prev,
      hasDisliked: true,
      hasLiked: false,
    }));
    setLocalCounts((prev) => ({
      ...prev,
      dislikeCount: prev.dislikeCount + 1,
      likeCount: wasLiked ? prev.likeCount - 1 : prev.likeCount,
    }));

    try {
      const result = await onDislike?.(prompt.id);
      if (!result?.success) {
        // Revert optimistic update on failure
        setUserInteraction((prev) => ({
          ...prev,
          hasDisliked: false,
          hasLiked: wasLiked,
        }));
        setLocalCounts((prev) => ({
          ...prev,
          dislikeCount: prev.dislikeCount - 1,
          likeCount: wasLiked ? prev.likeCount + 1 : prev.likeCount,
        }));
        Alert.alert("Error", "Failed to dislike prompt");
      }
    } catch (error) {
      console.error("[PromptInfoOverlay] Error disliking prompt:", error);
      Alert.alert("Error", "Failed to dislike prompt");
    }
  };

  const handleReport = () => {
    Alert.alert("Report Prompt", "Why are you reporting this prompt?", [
      { text: "Cancel", style: "cancel" },
      { text: "Inappropriate", onPress: () => submitReport("inappropriate") },
      { text: "Spam", onPress: () => submitReport("spam") },
      { text: "Offensive", onPress: () => submitReport("offensive") },
      { text: "Other", onPress: () => submitReport("other") },
    ]);
  };

  const submitReport = async (reason) => {
    // Optimistic UI update
    setLocalCounts((prev) => ({
      ...prev,
      reportCount: prev.reportCount + 1,
    }));

    try {
      const result = await onReport?.(prompt.id, reason);
      if (result?.success) {
        Alert.alert(
          "Reported",
          "Thank you for your report. We'll review this prompt."
        );
      } else {
        // Revert optimistic update on failure
        setLocalCounts((prev) => ({
          ...prev,
          reportCount: prev.reportCount - 1,
        }));
        Alert.alert("Error", "Failed to submit report");
      }
    } catch (error) {
      // Revert optimistic update on failure
      setLocalCounts((prev) => ({
        ...prev,
        reportCount: prev.reportCount - 1,
      }));
      Alert.alert("Error", "Failed to submit report");
    }
  };

  const handleFollow = async () => {
    console.log('[PromptInfoOverlay] Follow button clicked', {
      currentUser: user?.uid,
      targetUser: prompt.createdBy,
      currentFollowState: userInteraction.isFollowing
    });
    
    // Optimistic UI update
    const newFollowState = !userInteraction.isFollowing;
    setUserInteraction(prev => ({
      ...prev,
      isFollowing: newFollowState
    }));
    
    try {
      const result = await onFollowUser?.(prompt.createdBy);
      console.log('[PromptInfoOverlay] Follow result:', result);
      
      if (!result?.success) {
        console.error('[PromptInfoOverlay] Follow failed:', result.error);
        // Revert optimistic update on failure
        setUserInteraction(prev => ({
          ...prev,
          isFollowing: !newFollowState
        }));
        Alert.alert('Error', result.error || 'Failed to update follow status');
      } else {
        console.log('[PromptInfoOverlay] Follow successful');
        // Update follower count optimistically
        setLocalCounts(prev => ({
          ...prev,
          followerCount: result.isFollowing ? prev.followerCount + 1 : prev.followerCount - 1
        }));
      }
    } catch (error) {
      console.error('[PromptInfoOverlay] Error following user:', error);
      // Revert optimistic update on failure
      setUserInteraction(prev => ({
        ...prev,
        isFollowing: !newFollowState
      }));
      Alert.alert('Error', 'Failed to update follow status');
    }
  };

  const formatCount = (count) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count?.toString() || "0";
  };

  const getPromptGradient = () => {
    return [theme.colors.vibeBlue, theme.colors.vibeGreen];
  };

  if (!visible || !prompt) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <LinearGradient
        colors={theme.colors.backgroundGradient}
        style={styles.overlay}
      >
        <ScrollView
          style={styles.container}
          showsVerticalScrollIndicator={false}
        >

          {/* Prompt Card */}
          <View style={styles.promptCard}>
            <LinearGradient
              colors={getPromptGradient()}
              style={styles.cardGradient}
            >
              <Text style={styles.promptText}>
                {prompt.text || prompt.prompt || "Create something amazing!"}
              </Text>
            </LinearGradient>
          </View>

          {/* User & Follow Row */}
          <View style={styles.userSection}>
            <View style={styles.userInfoRow}>
              {/* Profile Image Placeholder */}
              <View style={styles.profileImagePlaceholder}>
                <Text style={styles.profileIcon}>👤</Text>
              </View>

              <Pressable onPress={() => onVisitProfile?.(prompt.createdBy)}>
                <Text style={styles.usernameText}>
                  {prompt.creatorUsername || "Anonymous"}
                </Text>
              </Pressable>

              {/* Follow Button */}
              {prompt.createdBy && prompt.createdBy !== user?.uid && (
                <Pressable
                  style={[
                    styles.followButton,
                    userInteraction.isFollowing && styles.followButtonActive
                  ]}
                  onPress={handleFollow}
                >
                  <Text style={[
                    styles.followButtonText,
                    userInteraction.isFollowing && styles.followButtonTextActive
                  ]}>
                    {userInteraction.isFollowing ? 'Followed' : 'Follow'}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Interactions Row */}
          <View style={styles.interactionRow}>
            {/* Left Side - Metrics Container */}
            <PromptMetrics
              views={localCounts.totalViews}
              likeCount={localCounts.likeCount}
              dislikeCount={localCounts.dislikeCount}
              reportCount={localCounts.reportCount}
              followerCount={localCounts.followerCount}
            />

            {/* Right Side - Vertical Vote Stack */}
            <View style={styles.rightSideActions}>
              <View style={styles.voteStack}>
                {/* Thumbs Up */}
                <Pressable
                  style={[
                    styles.voteButton,
                    userInteraction.hasLiked && styles.activeVote,
                  ]}
                  onPress={handleLike}
                >
                  <LinearGradient
                    colors={
                      userInteraction.hasLiked
                        ? [theme.colors.vibeBlue, theme.colors.vibePurple]
                        : ["rgba(255,255,255,0.1)", "rgba(255,255,255,0.05)"]
                    }
                    style={styles.voteGradient}
                  >
                    <Text style={styles.thumbsIcon}>👍</Text>
                    <Text
                      style={[
                        styles.voteCountHorizontal,
                        {
                          color: userInteraction.hasLiked
                            ? "white"
                            : theme.colors.textPrimary,
                        },
                      ]}
                    >
                      {formatCount(localCounts.likeCount)}
                    </Text>
                  </LinearGradient>
                </Pressable>

                {/* Thumbs Down */}
                <Pressable
                  style={[
                    styles.voteButton,
                    userInteraction.hasDisliked && styles.activeVote,
                  ]}
                  onPress={handleDislike}
                >
                  <LinearGradient
                    colors={
                      userInteraction.hasDisliked
                        ? [theme.colors.vibeBlue, theme.colors.vibePurple]
                        : ["rgba(255,255,255,0.1)", "rgba(255,255,255,0.05)"]
                    }
                    style={styles.voteGradient}
                  >
                    <Text style={styles.thumbsIcon}>👎</Text>
                    <Text
                      style={[
                        styles.voteCountHorizontal,
                        {
                          color: userInteraction.hasDisliked
                            ? "white"
                            : theme.colors.textPrimary,
                        },
                      ]}
                    >
                      {formatCount(localCounts.dislikeCount)}
                    </Text>
                  </LinearGradient>
                </Pressable>
              </View>

              {/* Report Button - Below vote stack */}
              <Pressable style={styles.reportButton} onPress={handleReport}>
                <View style={styles.reportContent}>
                  <Text style={styles.thumbsIcon}>🚩</Text>
                  <Text style={styles.reportText}>Report</Text>
                </View>
              </Pressable>
            </View>
          </View>

          {/* Main Actions */}
          <View style={styles.actionsSection}>
            {/* Action Buttons */}
            <View style={styles.actionButtonsContainer}>
              <VibeButton
                label="Create Prompt"
                onPress={() => {
                  onCreatePrompt?.();
                  onClose();
                }}
                style={styles.createPromptButton}
                textStyle={styles.createPromptButtonText}
              />

              <VibeButton
                label="Create Snapple"
                onPress={() => {
                  onCreateSnapple?.(prompt);
                  onClose();
                }}
                style={styles.createButton}
                textStyle={styles.createButtonText}
              />
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
      
      <ButtonContainer>
        <NavButton title="Prompts" onPress={() => { 
          onClose(); 
          navigation.navigate('Prompts'); 
        }} />
        <NavButton title="Snapples" onPress={() => { 
          onClose(); 
          onRefresh?.(); 
          navigation.navigate('Home'); 
        }} />
        <NavButton title="Play" />
        <NavButton title="Deck" />
      </ButtonContainer>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  promptCard: {
    height: 160,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 32,
  },
  cardGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  promptText: {
    color: "white",
    fontSize: 18,
    fontWeight: theme.fontWeights.semiBold,
    textAlign: "center",
    lineHeight: 24,
  },
  userSection: {
    marginBottom: 24,
  },
  userInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    gap: 8,
  },
  usernameText: {
    color: theme.colors.vibeBlue,
    fontSize: 16,
    fontWeight: theme.fontWeights.semiBold,
    textDecorationLine: "underline",
  },
  profileImagePlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
  },
  profileIcon: {
    fontSize: 20,
    color: theme.colors.vibeBlue,
  },
  followButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: theme.colors.vibeBlue,
    borderRadius: 16,
    marginLeft: "auto",
  },
  followButtonActive: {
    backgroundColor: theme.colors.vibeBlue,
    borderColor: theme.colors.vibeBlue,
  },
  followButtonText: {
    color: theme.colors.vibeBlue,
    fontSize: 12,
    fontWeight: theme.fontWeights.semiBold,
  },
  followButtonTextActive: {
    color: 'white',
  },
  interactionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 32,
    paddingHorizontal: 16,
    minHeight: 120,
  },
  rightSideActions: {
    alignItems: "center",
    gap: 16,
  },
  voteStack: {
    alignItems: "center",
    gap: 16,
  },
  voteButton: {
    width: 120,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    shadowColor: theme.colors.vibeBlue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  activeVote: {
    transform: [{ scale: 1.05 }],
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 10,
  },
  voteGradient: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  thumbsIcon: {
    fontSize: 20,
  },
  voteCountHorizontal: {
    fontSize: 14,
    fontWeight: theme.fontWeights.bold,
    textAlign: "center",
  },
  reportButton: {
    width: 120,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.1)",
    shadowColor: theme.colors.vibeBlue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  reportContent: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  reportText: {
    fontSize: 14,
    fontWeight: theme.fontWeights.bold,
    textAlign: "center",
    color: theme.colors.textPrimary,
  },
  actionsSection: {
    marginBottom: 60, // Increased margin for scrollview
  },
  createButton: {
    backgroundColor: "rgba(0, 255, 255, 0.1)",
    borderColor: theme.colors.vibeBlue,
    paddingHorizontal: 48,
    paddingVertical: 16,
  },
  createButtonText: {
    color: theme.colors.vibeBlue,
    fontSize: 16,
    fontWeight: theme.fontWeights.semiBold,
  },
  actionButtonsContainer: {
    gap: 16,
  },
  createPromptButton: {
    backgroundColor: "rgba(0, 255, 255, 0.1)",
    borderColor: theme.colors.vibeBlue,
    paddingHorizontal: 48,
    paddingVertical: 16,
  },
  createPromptButtonText: {
    color: theme.colors.vibeBlue,
    fontSize: 16,
    fontWeight: theme.fontWeights.semiBold,
  },
});
