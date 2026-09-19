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

// Pricing configuration.
//
// Only `snapple` is read (by calculateSnapplePrice). This also held a
// `topicToken` block - coins-per-ticket with bulk discounts - and a
// `ticket` block from an older economy where "ticket" meant what is now
// a trophy. Neither had a caller, and both described prices that do not
// exist: tickets are earned or bought with real money, never with coins.
const PRICING_CONFIG = {
  snapple: {
    basePrice: 10, // Base price in coins
    priceMultiplier: 1.15, // Exponential growth factor
    maxPrice: 1000 // Maximum price cap
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