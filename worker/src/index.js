/*
  worker/src/index.js — Cloudflare Worker that powers the Local Lift Assistant
  chatbot using Cloudflare Workers AI (Meta Llama 3.3 70B).
  Responsibility: validate and bound incoming chat requests, run the Llama model
  via the Workers AI binding (env.AI) with a Local Lift system prompt, and return the
  reply with CORS headers. The static site talks to this Worker; inference runs
  on Cloudflare's network, so there is no external API key to manage.
*/

/** The Workers AI model used for the assistant (Meta Llama 3.3 70B). */
var MODEL_ID = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

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

/** Base system prompt describing Local Lift and how the assistant should behave. */
var SYSTEM_PROMPT = [
  "You are the Local Lift Assistant, a friendly guide embedded in Local Lift — a local",
  "business directory web app for Lake Forest, Illinois (an FBLA Coding &",
  "Programming project). Your job is to help visitors use the website.",
  "",
  "What users can do on Local Lift:",
  "- Browse and SEARCH businesses (the search box at the top filters as they type).",
  "- FILTER by category using the category pill buttons; FILTER or SORT by rating (Top rated, or 3★/4★/4.5★ and up).",
  "- Open any business's \"View details\" page to see hours, address, phone, an embedded map, its deal, and reviews.",
  "- SIGN IN with Google (top-right). Signing in is required before writing anything; Google's 2-step verification keeps out bots.",
  "- Leave REVIEWS and star ratings (must be signed in).",
  "- BOOKMARK favorites with the ☆ on a card; saved businesses appear on the \"Favorites\" page.",
  "- See RECOMMENDED businesses on the Favorites page after favoriting at least two spots.",
  "- CLAIM a deal inside a business's details to reveal its coupon code (must be signed in).",
  "- Generate a PDF REPORT of their favorites (and recommendations) from the top bar, or export/print it.",
  "",
  "Guidelines:",
  "- Be concise, warm, and practical. Prefer short answers and clear step-by-step instructions.",
  "- You can guide users, but you cannot click buttons for them — tell them where to go.",
  "- Only help with Local Lift and finding or using local businesses in Lake Forest. If asked",
  "  something off-topic, briefly redirect to how you can help with Local Lift.",
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
 * @param {Object} env The Worker environment (provides the Workers AI binding env.AI).
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
  if (!env.AI) {
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
    systemPrompt += "\n\nBusinesses currently listed in Local Lift:\n" + body.catalog.slice(0, 4000);
  }

  try {
    // Workers AI chat models take the system prompt as the first message.
    var aiMessages = [{ role: "system", content: systemPrompt }].concat(messages);
    var result = await env.AI.run(MODEL_ID, {
      messages: aiMessages,
      max_tokens: MAX_TOKENS,
    });
    var reply = result && typeof result.response === "string" ? result.response.trim() : "";
    return jsonResponse({ reply: reply || "Sorry, I didn't catch that — could you rephrase?" }, 200, origin);
  } catch (apiError) {
    return jsonResponse({ error: "The assistant is unavailable right now. Please try again." }, 502, origin);
  }
}

export default {
  fetch: handleRequest,
};
