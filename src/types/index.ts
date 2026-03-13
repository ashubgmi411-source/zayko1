/**
 * Shared TypeScript interfaces for the Zayko application.
 * Single source of truth for all data models used across client/server.
 */

// ─── User ───────────────────────────────────────

export interface UserProfile {
    uid: string;
    email: string;
    phone: string;
    pinHash: string; // BCrypt hash of 4-digit PIN
    name: string;
    rollNumber?: string;
    walletBalance: number;
    uniqueCode: string;
    role: "user" | "admin";
    createdAt: string;
}

// ─── Menu ───────────────────────────────────────

export interface MenuItemOption {
    id: string;
    name: string;
    price: number;
}

export interface MenuItemCustomization {
    id: string;
    title: string;
    type: "single" | "multiple";
    required: boolean;
    options: MenuItemOption[];
}

export interface MenuItem {
    id: string;
    name: string;
    price: number;
    category: string;
    available: boolean;
    quantity: number;
    preparationTime: number; // minutes
    description?: string;
    image?: string;
    customizations?: MenuItemCustomization[];
    createdAt?: string;
    updatedAt?: string;
}

// ─── Categories ─────────────────────────────────

export interface Category {
    id: string;
    name: string;       // Display name: "North Indian"
    slug: string;       // URL-safe key: "north-indian" (stored in menuItems.category)
    order: number;      // Sort position
    createdAt: string;
    updatedAt: string;
}

export interface CategoryDoc {
    id: string;
    name: string;
    slug: string;
    order: number;
}

// ─── Orders ─────────────────────────────────────

export interface SelectedOption {
    customizationId: string;
    customizationTitle: string;
    optionId: string;
    optionName: string;
    price: number;
}

export interface CartItem {
    id: string;
    name: string;
    price: number;
    quantity: number;
    maxQuantity: number;
    category: string;
    image?: string;
    selectedOptions?: SelectedOption[];
}

export interface OrderItem {
    id: string;
    name: string;
    price: number; // base price + options
    quantity: number;
    selectedOptions?: SelectedOption[];
}
export interface Order {
    id: string;
    orderId: string;
    userId: string;
    userName: string;
    userEmail: string;
    userRollNumber?: string;
    items: OrderItem[];
    total: number;
    paymentMode?: string;
    status: "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled";
    prepTime?: number;
    estimatedReadyAt?: string;
    readyAt?: string; // canonical countdown target (ISO string)
    createdAt: string;
    updatedAt?: string;
}

// ─── Wallet ─────────────────────────────────────

export interface WalletTransaction {
    id: string;
    fromUserId: string;
    toUserId: string;
    userId: string; // owner of this transaction record
    amount: number;
    type: "topup" | "transfer" | "payment" | "refund";
    description: string;
    referenceId?: string;
    razorpayPaymentId?: string;
    razorpayOrderId?: string;
    createdAt: string;
}

// ─── Payments (Razorpay dedup) ──────────────────

export interface Payment {
    razorpayPaymentId: string;
    userId: string;
    amount: number;
    verified: boolean;
    createdAt: string;
}

// ─── Canteen Settings ───────────────────────────

export interface CanteenConfig {
    startTime: string; // "HH:MM" format, e.g. "09:00"
    endTime: string;   // "HH:MM" format, e.g. "17:00"
    isOpen: boolean;
}

// ─── Chat ───────────────────────────────────────

export interface ChatMessage {
    role: "user" | "assistant" | "system";
    content: string;
}

// ─── Auto Recurring Orders ──────────────────────

export type DayOfWeek = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
export type AutoOrderFrequency = "daily" | "weekdays" | "custom";
export type AutoOrderStatus = "active" | "paused";

export interface AutoOrder {
    id: string;
    userId: string;
    itemId: string;
    itemName: string;
    itemPrice: number;
    quantity: number;
    time: string;                  // "HH:MM" 24-hour format
    frequency: AutoOrderFrequency;
    customDays?: DayOfWeek[];      // only when frequency === "custom"
    status: AutoOrderStatus;
    lastExecutedAt?: string;       // ISO string — duplicate guard
    lastFailedAt?: string;
    lastFailureReason?: string;
    totalExecutions: number;
    totalFailures: number;
    createdAt: string;
    updatedAt: string;
}

export interface AutoOrderExecution {
    id: string;
    autoOrderId: string;
    userId: string;
    orderId?: string;
    success: boolean;
    failureReason?: string;
    amountDeducted?: number;
    executedAt: string;
}

// ─── Feedback ───────────────────────────────────

export interface Feedback {
    id?: string;
    orderId: string;
    userId: string;
    userName: string;
    rating: number; // 1-5
    comment: string;
    createdAt: string;
}

// ─── User Demand Plans (Stock Forecasting) ──────

export interface DemandPlan {
    id: string;
    userId: string;
    userName: string;
    itemId: string;
    itemName: string;
    quantity: number;
    days: string[];          // ["Monday", "Tuesday", …]
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

// ─── Item Suggestions (Demand Discovery) ────────

export interface ItemSuggestion {
    id: string;
    itemName: string;
    normalizedName: string;      // lowercase trimmed for dedup
    category?: string;
    description?: string;
    expectedPrice?: number;
    totalRequests: number;
    requestedBy: string[];       // array of userIds
    status: "pending" | "approved" | "rejected";
    createdAt: string;
    updatedAt: string;
}

// ─── Scheduled Orders (One-time Future Orders) ──

export type ScheduledOrderStatus = "scheduled" | "completed" | "failed" | "cancelled";

export interface ScheduledOrderItem {
    itemId: string;
    name: string;
    quantity: number;
    price: number;
}

export interface ScheduledOrder {
    id: string;
    userId: string;
    items: ScheduledOrderItem[];
    scheduledDateTime: string;          // ISO 8601
    paymentMethod: "wallet" | "razorpay";
    status: ScheduledOrderStatus;
    failureReason?: string;
    resultOrderId?: string;             // orderId in "orders" collection after execution
    createdAt: string;
    updatedAt: string;
}

// ─── AI Canteen Brain (Jarvis 2.0) ──────────────

export interface CookingPlanItem {
    itemId: string;
    name: string;
    predictedQuantity: number;
    confidence?: "high" | "medium" | "low";
}

export interface DailyCookingPlan {
    id?: string;
    date: string;           // YYYY-MM-DD
    items: CookingPlanItem[];
    trendingItems: string[];
    lowStockAlerts: { itemName: string; currentStock: number; unit: string }[];
    purchaseRecommendations: { itemName: string; suggestedQty: number; unit: string; reason: string }[];
    generatedAt: string;
    provider: string;       // which AI provider generated this
}
