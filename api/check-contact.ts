import type { VercelRequest, VercelResponse } from "@vercel/node";

const HUBSPOT_API_KEY = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "*";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });

  const { utk } = req.query;

  if (!utk || typeof utk !== "string") {
    return res.status(400).json({ error: "Missing utk param", isKnown: false });
  }

  if (!HUBSPOT_API_KEY) {
    return res
      .status(500)
      .json({ error: "Missing HubSpot token", isKnown: false });
  }

  try {
    const response = await fetch(
      `https://api.hubapi.com/contacts/v1/contact/utk/${utk}/profile`,
      {
        headers: {
          Authorization: `Bearer ${HUBSPOT_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (response.status === 404) {
      // No contact found — net new user
      return res.status(200).json({ isKnown: false });
    }

    if (!response.ok) {
      throw new Error(`HubSpot responded with ${response.status}`);
    }

    // Contact exists — known user
    return res.status(200).json({ isKnown: true });
  } catch (err) {
    console.error("[check-contact]", err);
    // Fail open — if we can't check, show the lightbox anyway
    return res.status(200).json({ isKnown: false });
  }
}
