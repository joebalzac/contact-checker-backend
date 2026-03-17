/// <reference types="node" />
import type { VercelRequest, VercelResponse } from "@vercel/node";

const HUBSPOT_API_KEY = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "*";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { email } = req.body ?? {};

  if (!email) return res.status(400).json({ error: "Missing email" });
  if (!HUBSPOT_API_KEY)
    return res.status(500).json({ error: "Missing HubSpot token" });

  try {
    const response = await fetch(
      "https://api.hubapi.com/crm/v3/objects/contacts",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HUBSPOT_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: { email },
        }),
      },
    );

    // 409 = contact already exists — not an error for us
    if (response.status === 409) {
      return res.status(200).json({ success: true, existing: true });
    }

    if (!response.ok) {
      const err = await response.json();
      throw new Error(
        err?.message ?? `HubSpot responded with ${response.status}`,
      );
    }

    const data = await response.json();
    return res.status(200).json({ success: true, contactId: data.id });
  } catch (err) {
    console.error("[create-contact]", err);
    return res.status(500).json({ error: "Failed to create contact" });
  }
}
