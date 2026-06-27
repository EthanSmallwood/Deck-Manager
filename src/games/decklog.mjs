export async function fetchDecklogPayload(value) {
  const deckId = decklogDeckId(value);
  if (!deckId) throw new Error("Enter a Decklog URL or deck code.");

  const response = await fetch(`https://decklog-en.bushiroad.com/system/app/api/view/${encodeURIComponent(deckId)}`, {
    method: "POST",
    headers: {
      "user-agent": "Deckmanager/0.1",
      "accept": "application/json, text/plain, */*",
      "origin": "https://decklog-en.bushiroad.com",
      "referer": "https://decklog-en.bushiroad.com/",
    },
    body: "",
  });

  if (!response.ok) throw new Error(`Decklog returned HTTP ${response.status}.`);
  return { deckId, payload: await response.json() };
}

export function detectDecklogGame(payload) {
  if (Number(payload?.game_title_id) === 8) return "Hololive OCG";

  const blob = JSON.stringify(payload || "").toLowerCase();
  if (blob.includes("hbp") || blob.includes("hsd") || blob.includes("hy0") || blob.includes("hpr")) return "Hololive OCG";
  if (blob.includes("/w") || blob.includes("/s") || blob.includes("_en_") || blob.includes("-e")) return "Weiss Schwarz";

  return "Unknown";
}

export function decklogDeckId(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.match(/decklog-en\.bushiroad\.com\/view\/([A-Za-z0-9_-]+)/i)?.[1] || text.match(/^[A-Za-z0-9_-]+$/)?.[0] || "";
}

