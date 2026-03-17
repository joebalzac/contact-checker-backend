/// <reference types="node" />
import type { VercelRequest, VercelResponse } from "@vercel/node";

const HUBSPOT_API_KEY = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
const ALLOWED_ORIGIN  = process.env.ALLOWED_ORIGIN ?? "*";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, properties } = req.body ?? {};

  if (!email) return res.status(400).json({ error: "Missing email" });
  if (!properties || Object.keys(properties).length === 0)
    return res.status(400).json({ error: "Missing properties" });
  if (!HUBSPOT_API_KEY) return res.status(500).json({ error: "Missing HubSpot token" });

  try {
    // 1. Find contact by email
    const searchRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUBSPOT_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filterGroups: [{
          filters: [{
            propertyName: "email",
            operator: "EQ",
            value: email,
          }],
        }],
        properties: ["email"],
        limit: 1,
      }),
    });

    if (!searchRes.ok) throw new Error(`Search failed with ${searchRes.status}`);

    const searchData = await searchRes.json();
    const contact    = searchData.results?.[0];

    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    // 2. Patch contact with new properties
    const updateRes = await fetch(
      `https://api.hubapi.com/crm/v3/objects/contacts/${contact.id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${HUBSPOT_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ properties }),
      }
    );

    if (!updateRes.ok) {
      const err = await updateRes.json();
      throw new Error(err?.message ?? `Update failed with ${updateRes.status}`);
    }

    return res.status(200).json({ success: true, contactId: contact.id });

  } catch (err) {
    console.error("[update-contact]", err);
    return res.status(500).json({ error: "Failed to update contact" });
  }
}