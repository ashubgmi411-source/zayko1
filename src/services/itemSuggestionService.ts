/**
 * Item Suggestion Service — Client-side API wrappers.
 */

export interface SuggestionResponse {
    success: boolean;
    suggestions?: any[];
    action?: "created" | "upvoted";
    error?: string;
    alreadyRequested?: boolean;
}

export async function getMySuggestions(token: string): Promise<SuggestionResponse> {
    const res = await fetch("/api/item-suggestions", {
        headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
}

export async function submitSuggestion(
    token: string,
    data: { itemName: string; category?: string; description?: string; expectedPrice?: number }
): Promise<SuggestionResponse> {
    const res = await fetch("/api/item-suggestions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
    });
    return res.json();
}

export async function updateSuggestion(
    token: string,
    id: string,
    data: { itemName?: string; category?: string; description?: string; expectedPrice?: number }
): Promise<SuggestionResponse> {
    const res = await fetch(`/api/item-suggestions?id=${id}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
    });
    return res.json();
}

export async function deleteSuggestion(token: string, id: string): Promise<SuggestionResponse> {
    const res = await fetch(`/api/item-suggestions?id=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
}
