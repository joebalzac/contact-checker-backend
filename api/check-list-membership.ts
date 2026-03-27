/// <reference types="node" />
import type { VercelRequest, VercelResponse } from "@vercel/node";

const HUBSPOT_API_KEY = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "*";

// Prospect List + Churned Customers List
const ELIGIBLE_LIST_IDS = ["10377", "10380"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });

  const { utk } = req.query;

  if (!utk || typeof utk !== "string") {
    return res.status(400).json({ error: "Missing utk", isEligible: false });
  }

  if (!HUBSPOT_API_KEY) {
    return res
      .status(500)
      .json({ error: "Missing HubSpot token", isEligible: false });
  }

  try {
    // 1. Look up contact by UTK
    const utkRes = await fetch(
      `https://api.hubapi.com/contacts/v1/contact/utk/${utk}/profile`,
      {
        headers: {
          Authorization: `Bearer ${HUBSPOT_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    // Contact not found — unknown visitor, show incentive
    if (utkRes.status === 404) {
      return res
        .status(200)
        .json({ isEligible: true, reason: "unknown_contact" });
    }

    if (!utkRes.ok) throw new Error(`UTK lookup failed with ${utkRes.status}`);

    const contact = await utkRes.json();
    const contactId = String(contact["canonical-vid"] ?? contact.vid);

    // 2. Check if contact is a member of any eligible list
    //    Uses HubSpot's list membership API — O(1) per list, works at any scale
    const membershipChecks = await Promise.all(
      ELIGIBLE_LIST_IDS.map(async (listId) => {
        const memberRes = await fetch(
          `https://api.hubapi.com/contacts/v1/lists/${listId}/contacts/all?count=1&vidOffset=${contactId}`,
          {
            headers: {
              Authorization: `Bearer ${HUBSPOT_API_KEY}`,
            },
          },
        );

        if (!memberRes.ok) return false;

        // Use the dedicated member check endpoint
        const checkRes = await fetch(
          `https://api.hubapi.com/contacts/v1/contact/vid/${contactId}/lists-memberships`,
          {
            headers: {
              Authorization: `Bearer ${HUBSPOT_API_KEY}`,
            },
          },
        );

        if (!checkRes.ok) return false;
        const data = await checkRes.json();

        // data is an array of list membership objects
        return (
          Array.isArray(data) &&
          data.some(
            (membership: any) => String(membership["list-id"]) === listId,
          )
        );
      }),
    );

    const isEligible = membershipChecks.some(Boolean);

    return res.status(200).json({
      isEligible,
      reason: isEligible ? "list_member" : "known_contact_not_on_list",
    });
  } catch (err) {
    console.error("[check-list-membership]", err);
    // Fail open — show incentive if check fails
    return res
      .status(200)
      .json({ isEligible: true, reason: "error_fail_open" });
  }
}
