import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  increment,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit as firestoreLimit,
  runTransaction
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { userService } from './userService';

const TRANSACTIONS_COLLECTION = 'transactions';
const SNAPPLES_COLLECTION = 'snapples';

// Pricing configuration
const PRICING_CONFIG = {
  snapple: {
    basePrice: 10, // Base price in coins
    priceMultiplier: 1.15, // Exponential growth factor
    maxPrice: 1000 // Maximum price cap
  },
  topicToken: {
    price: 25, // Price in coins to buy 1 topic token
    bulkDiscounts: {
      5: 0.1,   // 10% discount for 5 tokens
      10: 0.2,  // 20% discount for 10 tokens
      25: 0.3   // 30% discount for 25 tokens
    }
  },
  ticket: {
    price: 2, // Price in coins to buy 1 ticket (legacy system)
    bulkDiscounts: {
      25: 0.05,  // 5% discount for 25 tickets
      50: 0.1,   // 10% discount for 50 tickets
      100: 0.15  // 15% discount for 100 tickets
    }
  }
};

export const currencyService = {
  async purchaseSnapple(userId, snappleId) {
    try {
      return await runTransaction(db, async (transaction) => {
        // Get user data
        const userRef = doc(db, 'users', userId);
        const userDoc = await transaction.get(userRef);
        
        if (!userDoc.exists()) {
          throw new Error('User not found');
        }
        
        // Get snapple data
        const snappleRef = doc(db, SNAPPLES_COLLECTION, snappleId);
        const snappleDoc = await transaction.get(snappleRef);
        
        if (!snappleDoc.exists()) {
          throw new Error('Snapple not found');
        }
        
        const userData = userDoc.data();
        const snappleData = snappleDoc.data();
        
        // Check if user already owns this snapple
        if (userData.ownedSnapples?.includes(snappleId)) {
          throw new Error('You already own this Snapple');
        }
        
        // Calculate current price
        const currentPrice = this.calculateSnapplePrice(
          snappleData.basePrice || PRICING_CONFIG.snapple.basePrice,
          snappleData.buyCount || 0
        );
        
        // Check if user has enough coins
        if (userData.coins < currentPrice) {
          throw new Error(`Insufficient coins. Need ${currentPrice}, have ${userData.coins}`);
        }
        
        // Calculate new price after purchase
        const newBuyCount = (snappleData.buyCount || 0) + 1;
        const newPrice = this.calculateSnapplePrice(
          snappleData.basePrice || PRICING_CONFIG.snapple.basePrice,
          newBuyCount
        );
        
        // Update user: deduct coins, add snapple to owned
        const updatedOwnedSnapples = [...(userData.ownedSnapples || []), snappleId];
        transaction.update(userRef, {
          coins: increment(-currentPrice),
          ownedSnapples: updatedOwnedSnapples,
          'stats.totalSnapplesPurchased': increment(1),
          'stats.totalCoinsSpent': increment(currentPrice),
          updatedAt: serverTimestamp()
        });
        
        // Update snapple: increment buy count, update price
        transaction.update(snappleRef, {
          buyCount: increment(1),
          currentPrice: newPrice,
          updatedAt: serverTimestamp()
        });
        
        // Create transaction record
        const transactionRef = doc(collection(db, TRANSACTIONS_COLLECTION));
        transaction.set(transactionRef, {
          userId,
          type: 'snapple_purchase',
          itemId: snappleId,
          amount: -currentPrice,
          currency: 'coins',
          metadata: {
            snappleTitle: snappleData.prompt || 'Unknown',
            oldPrice: currentPrice,
            newPrice: newPrice,
            buyCount: newBuyCount
          },
          timestamp: serverTimestamp()
        });
        
        return {
          success: true,
          pricePaid: currentPrice,
          newPrice: newPrice,
          coinsRemaining: userData.coins - currentPrice
        };
      });
    } catch (error) {
      console.error('Error purchasing snapple:', error);
      return {
        success: false,
        error: error.message || 'Failed to purchase Snapple'
      };
    }
  },

  async purchaseTopicTokens(userId, quantity, useTickets = false) {
    try {
      return await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', userId);
        const userDoc = await transaction.get(userRef);
        
        if (!userDoc.exists()) {
          throw new Error('User not found');
        }
        
        const userData = userDoc.data();
        
        // Calculate cost with bulk discounts
        const { totalCost, discount } = this.calculateBulkPrice(
          PRICING_CONFIG.topicToken.price,
          quantity,
          PRICING_CONFIG.topicToken.bulkDiscounts
        );
        
        let updates = {
          topicTokens: increment(quantity),
          'stats.totalTokensSpent': increment(totalCost),
          updatedAt: serverTimestamp()
        };
        
        let currency, currentBalance;
        
        if (useTickets) {
          // Use legacy ticket system
          currency = 'tickets';
          currentBalance = userData.tickets || 0;
          
          if (currentBalance < totalCost) {
            throw new Error(`Insufficient tickets. Need ${totalCost}, have ${currentBalance}`);
          }
          
          updates.tickets = increment(-totalCost);
          updates['stats.totalTicketsSpent'] = increment(totalCost);
        } else {
          // Use coin system
          currency = 'coins';
          currentBalance = userData.coins || 0;
          
          if (currentBalance < totalCost) {
            throw new Error(`Insufficient coins. Need ${totalCost}, have ${currentBalance}`);
          }
          
          updates.coins = increment(-totalCost);
          updates['stats.totalCoinsSpent'] = increment(totalCost);
        }
        
        transaction.update(userRef, updates);
        
        // Create transaction record
        const transactionRef = doc(collection(db, TRANSACTIONS_COLLECTION));
        transaction.set(transactionRef, {
          userId,
          type: 'token_purchase',
          amount: -totalCost,
          currency,
          metadata: {
            quantity,
            unitPrice: PRICING_CONFIG.topicToken.price,
            discount,
            tokensReceived: quantity
          },
          timestamp: serverTimestamp()
        });
        
        return {
          success: true,
          tokensReceived: quantity,
          totalCost,
          discount,
          currency,
          remainingBalance: currentBalance - totalCost
        };
      });
    } catch (error) {
      console.error('Error purchasing topic tokens:', error);
      return {
        success: false,
        error: error.message || 'Failed to purchase topic tokens'
      };
    }
  },

  async purchaseTickets(userId, quantity) {
    try {
      return await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', userId);
        const userDoc = await transaction.get(userRef);
        
        if (!userDoc.exists()) {
          throw new Error('User not found');
        }
        
        const userData = userDoc.data();
        
        // Calculate cost with bulk discounts
        const { totalCost, discount } = this.calculateBulkPrice(
          PRICING_CONFIG.ticket.price,
          quantity,
          PRICING_CONFIG.ticket.bulkDiscounts
        );
        
        // Check if user has enough coins
        if (userData.coins < totalCost) {
          throw new Error(`Insufficient coins. Need ${totalCost}, have ${userData.coins}`);
        }
        
        // Update user
        transaction.update(userRef, {
          coins: increment(-totalCost),
          tickets: increment(quantity),
          'stats.totalCoinsSpent': increment(totalCost),
          updatedAt: serverTimestamp()
        });
        
        // Create transaction record
        const transactionRef = doc(collection(db, TRANSACTIONS_COLLECTION));
        transaction.set(transactionRef, {
          userId,
          type: 'ticket_purchase',
          amount: -totalCost,
          currency: 'coins',
          metadata: {
            quantity,
            unitPrice: PRICING_CONFIG.ticket.price,
            discount,
            ticketsReceived: quantity
          },
          timestamp: serverTimestamp()
        });
        
        return {
          success: true,
          ticketsReceived: quantity,
          totalCost,
          discount,
          coinsRemaining: userData.coins - totalCost
        };
      });
    } catch (error) {
      console.error('Error purchasing tickets:', error);
      return {
        success: false,
        error: error.message || 'Failed to purchase tickets'
      };
    }
  },

  async giftCoins(fromUserId, toUserId, amount, message = '') {
    try {
      return await runTransaction(db, async (transaction) => {
        const fromUserRef = doc(db, 'users', fromUserId);
        const toUserRef = doc(db, 'users', toUserId);
        
        const fromUserDoc = await transaction.get(fromUserRef);
        const toUserDoc = await transaction.get(toUserRef);
        
        if (!fromUserDoc.exists() || !toUserDoc.exists()) {
          throw new Error('One or both users not found');
        }
        
        const fromUserData = fromUserDoc.data();
        
        if (fromUserData.coins < amount) {
          throw new Error(`Insufficient coins to gift. Have ${fromUserData.coins}, trying to gift ${amount}`);
        }
        
        // Update sender
        transaction.update(fromUserRef, {
          coins: increment(-amount),
          'stats.totalCoinsSpent': increment(amount),
          updatedAt: serverTimestamp()
        });
        
        // Update recipient
        transaction.update(toUserRef, {
          receivedCoins: increment(amount),
          updatedAt: serverTimestamp()
        });
        
        // Create transaction records
        const senderTransactionRef = doc(collection(db, TRANSACTIONS_COLLECTION));
        const recipientTransactionRef = doc(collection(db, TRANSACTIONS_COLLECTION));
        
        transaction.set(senderTransactionRef, {
          userId: fromUserId,
          type: 'coin_gift_sent',
          amount: -amount,
          currency: 'coins',
          metadata: {
            recipientId: toUserId,
            message
          },
          timestamp: serverTimestamp()
        });
        
        transaction.set(recipientTransactionRef, {
          userId: toUserId,
          type: 'coin_gift_received',
          amount: amount,
          currency: 'receivedCoins',
          metadata: {
            senderId: fromUserId,
            message
          },
          timestamp: serverTimestamp()
        });
        
        return {
          success: true,
          amountGifted: amount,
          senderCoinsRemaining: fromUserData.coins - amount
        };
      });
    } catch (error) {
      console.error('Error gifting coins:', error);
      return {
        success: false,
        error: error.message || 'Failed to gift coins'
      };
    }
  },

  async getUserTransactions(userId, limit = 20) {
    try {
      const q = query(
        collection(db, TRANSACTIONS_COLLECTION),
        where('userId', '==', userId),
        orderBy('timestamp', 'desc'),
        firestoreLimit(limit)
      );
      
      const querySnapshot = await getDocs(q);
      const transactions = [];
      
      querySnapshot.forEach((doc) => {
        transactions.push({ id: doc.id, ...doc.data() });
      });
      
      return { success: true, transactions };
    } catch (error) {
      console.error('Error fetching transactions:', error);
      return { success: false, error: 'Failed to fetch transactions' };
    }
  },

  // Helper methods
  calculateSnapplePrice(basePrice, buyCount) {
    const price = Math.ceil(basePrice * Math.pow(PRICING_CONFIG.snapple.priceMultiplier, buyCount));
    return Math.min(price, PRICING_CONFIG.snapple.maxPrice);
  },

  calculateBulkPrice(unitPrice, quantity, discounts) {
    let discount = 0;
    
    // Find the highest applicable discount
    Object.keys(discounts)
      .map(Number)
      .sort((a, b) => b - a)
      .forEach(tier => {
        if (quantity >= tier && discounts[tier] > discount) {
          discount = discounts[tier];
        }
      });
    
    const subtotal = unitPrice * quantity;
    const discountAmount = subtotal * discount;
    const totalCost = subtotal - discountAmount;
    
    return {
      totalCost: Math.ceil(totalCost),
      discount,
      discountAmount: Math.ceil(discountAmount),
      subtotal
    };
  },

  async getCurrentPricing() {
    return {
      success: true,
      pricing: PRICING_CONFIG
    };
  }
};

export default currencyService;