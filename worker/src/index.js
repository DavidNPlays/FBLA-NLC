/*
  worker/src/index.js — Cloudflare Worker that proxies the BizWiz Assistant
  chatbot to the Anthropic Claude API.
  Responsibility: keep the Anthropic API key secret (it is stored as a Worker
  secret, never sent to the browser), validate and bound incoming chat requests,
  call Claude (claude-sonnet-4-6) with a BizWiz system prompt, and return the
  reply with CORS headers. The static site talks to this Worker; this Worker is
  the only place the API key exists.
*/

import Anthropic from "@anthropic-ai/sdk";

/** The Claude model used for the assistant (requested by the project owner). */
var MODEL_ID = "claude-sonnet-4-6";

/** Maximum tokens for a single assistant reply (keeps replies fast and cheap). */
var MAX_TOKENS = 1024;

/** Maximum number of conversation turns accepted from the client. */
var MAX_MESSAGES = 20;

/** Maximum characters accepted in a single message (longer ones are rejected). */
var MAX_MESSAGE_LENGTH = 2000;

/** Origins allowed to call this Worker from a browser. */
var ALLOWED_ORIGINS = [
  "https://byte-sized-business-lfa.web.app",
  "https://byte-sized-business-lfa.firebaseapp.com",
  "http://localhost:5000",
  "http://localhost:8000",
  "http://127.0.0.1:5000",
];

/** Base system prompt describing BizWiz and how the assistant should behave. */
var SYSTEM_PROMPT = [
  "You are the BizWiz Assistant, a friendly guide embedded in BizWiz — a local",
  "business directory web app for Lake Forest, Illinois (an FBLA Coding &",
  "Programming project). Your job is to help visitors use the website.",
  "",
  "What users can do on BizWiz:",
  "- Browse and SEARCH businesses (the search box at the top filters as they type).",
  "- FILTER by category using the category pill buttons; SORT by Featured, Top rated, or Name (A–Z).",
  "- Open any business's \"View details\" to see hours, address, phone, its deal, and reviews.",
  "- SIGN IN with Google (top-right). Signing in is required before writing anything; Google's 2-step verification keeps out bots.",
  "- Leave REVIEWS and star ratings (must be signed in).",
  "- BOOKMARK favorites with the ☆ on a card; saved businesses appear under \"Favorites\".",
  "- CLAIM a deal inside a business's details to reveal its coupon code (must be signed in).",
  "- EXPORT or PRINT a report of their favorites from the Favorites panel.",
  "",
  "Guidelines:",
  "- Be concise, warm, and practical. Prefer short answers and clear step-by-step instructions.",
  "- You can guide users, but you cannot click buttons for them — tell them where to go.",
  "- Only help with BizWiz and finding or using local businesses in Lake Forest. If asked",
  "  something off-topic, briefly redirect to how you can help with BizWiz.",
  "- Never invent businesses, deals, or details. If a list of businesses is provided below,",
  "  use it; otherwise suggest the user browse or search.",
  "- Never ask for or store passwords or sensitive personal information.",
].join("\n");

/**
 * Whether an origin may call this Worker. An empty origin (non-browser clients
 * such as curl, where CORS does not apply) is permitted.
 * @param {string} origin The Origin header from the incoming request.
 * @returns {boolean} True if the origin is allowed.
 */
function isAllowedOrigin(origin) {
  return origin === "" || ALLOWED_ORIGINS.indexOf(origin) !== -1;
}

/**
 * Build the CORS headers for a given request origin. The Allow-Origin header is
 * only set for allow-listed browser origins (never spoofed to a different one).
 * @param {string} origin The Origin header from the incoming request.
 * @returns {Object} A headers object.
 */
function buildCorsHeaders(origin) {
  var headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.indexOf(origin) !== -1) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

/**
 * Build a JSON Response with CORS headers.
 * @param {Object} payload The object to serialize as the response body.
 * @param {number} status The HTTP status code.
 * @param {string} origin The request origin (for CORS).
 * @returns {Response} The JSON response.
 */
function jsonResponse(payload, status, origin) {
  var headers = buildCorsHeaders(origin);
  headers["Content-Type"] = "application/json";
  return new Response(JSON.stringify(payload), { status: status, headers: headers });
}

/**
 * Validate and trim the conversation messages sent by the client.
 * @param {*} rawMessages The untrusted messages value from the request body.
 * @returns {Array<Object>|null} Cleaned messages, or null if invalid/empty.
 */
function sanitizeMessages(rawMessages) {
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return null;
  }
  var trimmed = rawMessages.slice(-MAX_MESSAGES);
  var cleaned = [];
  for (var index = 0; index < trimmed.length; index++) {
    var message = trimmed[index];
    var role = message && message.role;
    var content = message && message.content;
    if (role !== "user" && role !== "assistant") {
      return null;
    }
    if (typeof content !== "string" || content.trim().length === 0) {
      return null;
    }
    if (content.length > MAX_MESSAGE_LENGTH) {
      return null;
    }
    cleaned.push({ role: role, content: content });
  }
  // A valid conversation must end with a user turn for the model to answer.
  if (cleaned[cleaned.length - 1].role !== "user") {
    return null;
  }
  return cleaned;
}

/**
 * Cloudflare Worker entry point.
 * @param {Request} request The incoming HTTP request.
 * @param {Object} env The Worker environment (holds ANTHROPIC_API_KEY secret).
 * @returns {Promise<Response>} The HTTP response.
 */
async function handleRequest(request, env) {
  var origin = request.headers.get("Origin") || "";

  if (!isAllowedOrigin(origin)) {
    return jsonResponse({ error: "Origin not allowed." }, 403, origin);
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: buildCorsHeaders(origin) });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, origin);
  }
  if (!env.ANTHROPIC_API_KEY) {
    return jsonResponse({ error: "The assistant is not configured." }, 500, origin);
  }

  var body;
  try {
    body = await request.json();
  } catch (parseError) {
    return jsonResponse({ error: "Invalid request body." }, 400, origin);
  }

  var messages = sanitizeMessages(body.messages);
  if (!messages) {
    return jsonResponse({ error: "Invalid messages." }, 400, origin);
  }

  // Optionally fold a compact catalog (sent by the client) into the system prompt
  // so the assistant knows the real businesses without duplicating the data here.
  var systemPrompt = SYSTEM_PROMPT;
  if (typeof body.catalog === "string" && body.catalog.trim().length > 0) {
    systemPrompt += "\n\nBusinesses currently listed in BizWiz:\n" + body.catalog.slice(0, 4000);
  }

  try {
    var client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    var response = await client.messages.create({
      model: MODEL_ID,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: messages,
    });
    var reply = response.content
      .filter(function (block) {
        return block.type === "text";
      })
      .map(function (block) {
        return block.text;
      })
      .join("\n")
      .trim();
    return jsonResponse({ reply: reply || "Sorry, I didn't catch that — could you rephrase?" }, 200, origin);
  } catch (apiError) {
    return jsonResponse({ error: "The assistant is unavailable right now. Please try again." }, 502, origin);
  }
}

export default {
  fetch: handleRequest,
};
