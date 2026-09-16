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
  // purchaseSnapple / purchaseTopicTokens / purchaseTickets lived
  // here: three client-side transactions that read a price, checked a
  // balance and debited it, all on the caller's own document. Their
  // only caller was components/currency/PurchaseModal, which nothing
  // rendered - the live buy flow goes through the purchaseSnapple
  // CALLABLE (see snappleService), and coins and tickets are bought
  // with real money through IAP. Deleted with the modal.

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