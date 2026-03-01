/**
 * AI Ordering Engine — Strict JSON-based order processor
 *
 * Detects order intent from user text, extracts items + quantities
 * using the existing NLP parser, matches against the live menu,
 * and returns structured JSON responses.
 */

import { parseNaturalLanguage, fuzzyMatchItem } from "./jarvis-parser";

// ─── Types ──────────────────────────────────────

export interface MenuItemForEngine {
    id: string;
    name: string;
    price: number;
    available: boolean;
    quantity: number; // stock quantity
}

export interface OrderedItem {
    name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    item_id: string;
}

export interface OrderConfirmedResponse {
    status: "ORDER_CONFIRMED";
    items: OrderedItem[];
    grand_total: number;
    action: "CREATE_ORDER_AND_DECREMENT_STOCK";
}

export interface ItemNotFoundResponse {
    status: "ITEM_NOT_FOUND";
    message: string;
    found_items?: OrderedItem[];
    not_found_items?: string[];
}

export interface ChatModeResponse {
    status: "CHAT_MODE";
    message: string;
}

export interface StockErrorResponse {
    status: "STOCK_ERROR";
    message: string;
    item_name: string;
    requested: number;
    available: number;
}

export type OrderEngineResponse =
    | OrderConfirmedResponse
    | ItemNotFoundResponse
    | ChatModeResponse
    | StockErrorResponse;

// ─── Intent Detection ───────────────────────────

/** Keywords that strongly signal order intent */
const ORDER_KEYWORDS = new Set([
    "order", "chahiye", "chaiye", "manga", "mangao", "mangwa",
    "de", "do", "dedo", "dena", "bhej", "bhejo", "laga", "lagao",
    "add", "karo", "kardo", "kar", "la", "lao", "lana",
    "rakh", "pack", "bana", "banao", "ready",
]);

/**
 * Detects if the user's message has order intent.
 * Returns true if:
 *  - Message contains a number + word combo (e.g., "6 milk", "2 samosa")
 *  - Message contains known order keywords
 *  - Message text can be parsed into items by the NLP parser
 */
export function detectOrderIntent(
    text: string,
    menuItems: MenuItemForEngine[]
): boolean {
    const lower = text.toLowerCase().trim();

    // Very short messages without numbers are unlikely orders
    if (lower.length < 2) return false;

    // Check for number patterns (e.g., "6 milk", "2 samosa and 1 chai")
    if (/\d+\s+\w+/.test(lower)) return true;

    // Check for order keywords
    const words = lower.split(/\s+/);
    if (words.some((w) => ORDER_KEYWORDS.has(w))) return true;

    // Check if user text directly contains a menu item name
    const menuNames = menuItems.map((m) => m.name.toLowerCase());
    if (menuNames.some((name) => lower.includes(name))) return true;

    // Try parsing — if the parser extracts items, it's an order
    const parsed = parseNaturalLanguage(text);
    if (parsed.length > 0) {
        // Verify at least one parsed item fuzzy-matches the menu
        const hasMatch = parsed.some(
            (p) => fuzzyMatchItem(p.rawName, menuItems) !== null
        );
        if (hasMatch) return true;
    }

    return false;
}

// ─── Core Order Processor ───────────────────────

/**
 * Process user text into a structured order response.
 *
 * 1. Parses text for items + quantities (NLP parser)
 * 2. Fuzzy-matches each item against the live menu
 * 3. Validates stock availability
 * 4. Returns structured JSON
 */
export function processOrder(
    text: string,
    menuItems: MenuItemForEngine[]
): OrderEngineResponse {
    // Parse natural language into items
    const parsed = parseNaturalLanguage(text);

    if (parsed.length === 0) {
        return {
            status: "CHAT_MODE",
            message: "No order intent detected",
        };
    }

    const foundItems: OrderedItem[] = [];
    const notFoundItems: string[] = [];

    for (const parsedItem of parsed) {
        const match = fuzzyMatchItem(parsedItem.rawName, menuItems);

        if (!match) {
            notFoundItems.push(parsedItem.rawName);
            continue;
        }

        // Check if item is available
        if (!match.available) {
            notFoundItems.push(`${match.name} (unavailable)`);
            continue;
        }

        // Check stock
        if (match.quantity < parsedItem.quantity) {
            return {
                status: "STOCK_ERROR",
                message: `"${match.name}" ke sirf ${match.quantity} available hain, aapne ${parsedItem.quantity} maange.`,
                item_name: match.name,
                requested: parsedItem.quantity,
                available: match.quantity,
            };
        }

        foundItems.push({
            name: match.name,
            quantity: parsedItem.quantity,
            unit_price: match.price,
            total_price: match.price * parsedItem.quantity,
            item_id: match.id,
        });
    }

    // All items not found
    if (foundItems.length === 0 && notFoundItems.length > 0) {
        return {
            status: "ITEM_NOT_FOUND",
            message: `Ye items menu mein available nahi hain: ${notFoundItems.join(", ")}`,
            not_found_items: notFoundItems,
        };
    }

    // Some found, some not
    if (notFoundItems.length > 0) {
        return {
            status: "ITEM_NOT_FOUND",
            message: `Ye items nahi mile: ${notFoundItems.join(", ")}. Baaki items ready hain.`,
            found_items: foundItems,
            not_found_items: notFoundItems,
        };
    }

    // All items found — order confirmed
    const grandTotal = foundItems.reduce((sum, item) => sum + item.total_price, 0);

    return {
        status: "ORDER_CONFIRMED",
        items: foundItems,
        grand_total: grandTotal,
        action: "CREATE_ORDER_AND_DECREMENT_STOCK",
    };
}
