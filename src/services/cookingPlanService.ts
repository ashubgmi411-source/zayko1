/**
 * cookingPlanService.ts
 *
 * Server-side AI brain for predicting food demand.
 * 1. Aggregates past 30 days of orders
 * 2. Feeds data + menu + inventory into Gemini AI
 * 3. Saves predictions to Firestore
 */

import { adminDb } from "@/lib/firebase-admin";
import { runTextAI } from "@/lib/aiRouter";
import type { DailyCookingPlan, MenuItem } from "@/types";
import type { InventoryItem } from "@/types/inventory";

export const COOKING_PLAN_COLLECTION = "daily_cooking_plan";

/**
 * Interface mapping order aggregation
 */
interface OrderStats {
    totalQuantity: number;
    recent7DaysQuantity: number;
    daysOrdered: Set<string>;
}

/**
 * Generate a new cooking plan for tomorrow
 */
export async function generateCookingPlan(forceDate?: string): Promise<DailyCookingPlan> {
    const now = new Date();
    // Default to tomorrow
    const targetDate = new Date(now);
    if (!forceDate) {
        targetDate.setDate(targetDate.getDate() + 1);
    } else {
        targetDate.setTime(new Date(forceDate).getTime());
    }
    
    const targetDateStr = targetDate.toISOString().split("T")[0];
    const dayOfWeek = targetDate.toLocaleDateString("en-US", { weekday: "long" });

    console.log(`[Jarvis 2.0] Generating plan for ${targetDateStr} (${dayOfWeek})`);

    // 1. Fetch Menu
    const menuSnap = await adminDb.collection("menuItems").where("available", "==", true).get();
    const menuItems = menuSnap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<MenuItem, "id">) }));
    
    // 2. Fetch Inventory
    const invSnap = await adminDb.collection("inventory_items").get();
    const inventory = invSnap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<InventoryItem, "id">) }));

    // 3. Fetch past 30 days orders
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    
    const ordersSnap = await adminDb.collection("orders")
        .where("createdAt", ">=", thirtyDaysAgo.toISOString())
        .get();

    // 4. Aggregate Order Data
    const itemStats: Record<string, OrderStats> = {};
    
    ordersSnap.forEach(doc => {
        const order = doc.data();
        if (order.status === "cancelled" || order.status === "failed") return;

        const orderDate = new Date(order.createdAt);
        const dayStr = orderDate.toISOString().split("T")[0];
        const isRecent = (now.getTime() - orderDate.getTime()) <= (7 * 24 * 60 * 60 * 1000);

        const items: Array<{ id: string; name: string; quantity: number }> = order.items || [];
        
        items.forEach(item => {
            if (!itemStats[item.name]) {
                itemStats[item.name] = { totalQuantity: 0, recent7DaysQuantity: 0, daysOrdered: new Set() };
            }
            itemStats[item.name].totalQuantity += item.quantity;
            if (isRecent) itemStats[item.name].recent7DaysQuantity += item.quantity;
            itemStats[item.name].daysOrdered.add(dayStr);
        });
    });

    // 5. Provide structure to AI
    const systemPrompt = `You are Jarvis 2.0, the AI Brain for a college canteen. 
Your goal is to predict food demand for tomorrow and manage inventory.
Return a STRICT JSON object representing tomorrow's cooking plan.
DO NOT use markdown formatting like \`\`\`json. Return only the raw JSON.
Ensure you use the exact keys required by the JSON schema.`;

    const prompt = `
Context:
- Target Date: ${targetDateStr}
- Day of Week: ${dayOfWeek}

Order Stats (Last 30 Days):
${Object.entries(itemStats).map(([name, stats]) => 
  `- ${name}: 30-day Volume=${stats.totalQuantity}, 7-day Volume=${stats.recent7DaysQuantity}, Days Ordered=${stats.daysOrdered.size}/30`
).join("\n")}

Active Menu:
${menuItems.map(m => `- ${m.name} (ID: ${m.id})`).join("\n")}

Current Inventory:
${inventory.map(i => `- ${i.name}: ${i.currentStock} ${i.unit} (Reorder level: ${i.reorderLevel})`).join("\n")}

JSON STRUCTURE REQUIRED:
{
  "items": [
    { "itemId": "id_from_menu", "name": "Exact Menu Name", "predictedQuantity": number, "confidence": "high|medium|low" }
  ],
  "trendingItems": ["String name 1", "String name 2"],
  "lowStockAlerts": [
    { "itemName": "Inventory Item Name", "currentStock": number, "unit": "String" }
  ],
  "purchaseRecommendations": [
    { "itemName": "Inventory Item Name", "suggestedQty": number, "unit": "String", "reason": "Short reason" }
  ]
}

Make intelligent predictions. If an item is ordered frequently, predict a realistic amount for one day.
Only include items from the "Active Menu". Include inventory alerts if currentStock <= reorderLevel.
`;

    // 6. Call AI
    const aiResponse = await runTextAI(prompt, systemPrompt);
    
    if (!aiResponse.success) {
        throw new Error(`AI generation failed: ${aiResponse.error}`);
    }

    // 7. Parse & Save
    let parsedPlan;
    try {
        let text = aiResponse.data.trim();
        // Sometimes the LLM ignores instructions and returns markdown
        if (text.startsWith("\`\`\`json")) text = text.replace(/^\`\`\`json/m, "");
        if (text.startsWith("\`\`\`")) text = text.replace(/^\`\`\`/m, "");
        if (text.endsWith("\`\`\`")) text = text.replace(/\`\`\`$/m, "");
        
        parsedPlan = JSON.parse(text);
    } catch (e) {
        console.error("Failed to parse AI response:", aiResponse.data);
        throw new Error("AI returned invalid JSON structure.");
    }

    const plan: DailyCookingPlan = {
        date: targetDateStr,
        items: parsedPlan.items || [],
        trendingItems: parsedPlan.trendingItems || [],
        lowStockAlerts: parsedPlan.lowStockAlerts || [],
        purchaseRecommendations: parsedPlan.purchaseRecommendations || [],
        generatedAt: new Date().toISOString(),
        provider: aiResponse.provider
    };

    // Save to Firestore
    const query = await adminDb.collection(COOKING_PLAN_COLLECTION).where("date", "==", targetDateStr).get();
    if (!query.empty) {
        // Update existing plan for that date
        await query.docs[0].ref.update({ ...plan });
        plan.id = query.docs[0].id;
    } else {
        // Create new
        const docRef = await adminDb.collection(COOKING_PLAN_COLLECTION).add(plan);
        plan.id = docRef.id;
    }

    console.log(`[Jarvis 2.0] Cooking plan for ${targetDateStr} generated via ${aiResponse.provider}`);
    return plan;
}

/**
 * Retrieve a cooking plan for a specific date
 */
export async function getCookingPlan(dateStr: string): Promise<DailyCookingPlan | null> {
    const query = await adminDb.collection(COOKING_PLAN_COLLECTION).where("date", "==", dateStr).get();
    if (query.empty) return null;
    
    const doc = query.docs[0];
    return { id: doc.id, ...doc.data() } as DailyCookingPlan;
}
