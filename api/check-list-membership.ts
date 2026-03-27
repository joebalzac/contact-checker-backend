/// <reference types="node" />
import type { VercelRequest, VercelResponse } from "@vercel/node";

const HUBSPOT_API_KEY = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "*";

// Prospect List + Churned Customers List + Test List
const ELIGIBLE_LIST_IDS = ["10377", "10380", "10503"];

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
    // 1. Look up contact by UTK — response includes list-memberships
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
    const contactId = String(contact["canonical-vid"] || contact.vid);
    console.log("[check-list-membership] contactId:", contactId);

    // 2. Extract list memberships from the profile response
    const listMemberships: any[] = contact["list-memberships"] ?? [];
    console.log(
      "[check-list-membership] list-memberships count:",
      listMemberships.length,
    );

    const memberListIds = listMemberships.map((m: any) =>
      String(m["static-list-id"] ?? m["list-id"] ?? ""),
    );
    console.log("[check-list-membership] member list IDs:", memberListIds);
    console.log("[check-list-membership] checking against:", ELIGIBLE_LIST_IDS);

    // 3. Check if any eligible list ID matches
    const isEligible = ELIGIBLE_LIST_IDS.some((id) =>
      memberListIds.includes(id),
    );
    console.log("[check-list-membership] isEligible:", isEligible);

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
