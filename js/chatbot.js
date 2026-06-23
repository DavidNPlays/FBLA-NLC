/*
  chatbot.js — Local Lift Assistant: an AI help chatbot powered by Cloudflare
  Workers AI (Meta Llama 3.3 70B) through a Cloudflare Worker proxy.
  Responsibility: own the chat widget. It sends the conversation to the Worker
  (which runs the model) and renders the AI's replies. If the proxy is not
  configured or is unreachable, it falls back to canned answers for common
  questions so the widget still helps. This module holds no business, Firestore,
  or Firebase Auth logic.

  SETUP: after deploying the Worker (see worker/README.md), set CHATBOT_PROXY_URL
  below to your Worker URL, e.g. "https://bizwiz-assistant.<sub>.workers.dev".
*/

(function defineChatbotModule() {
  "use strict";

  /**
   * URL of the Cloudflare Worker proxy. Replace the placeholder after deploying
   * the Worker. While it stays a placeholder, the widget runs in fallback mode.
   * @type {string}
   */
  var CHATBOT_PROXY_URL = "https://bizwiz-assistant.locallift.workers.dev";

  /**
   * Suggested starter questions. Each also provides keywords and a canned answer
   * used as a fallback when the AI proxy is unavailable.
   * @type {Array<{question: string, answer: string, keywords: Array<string>}>}
   */
  var STARTERS = [
    {
      question: "How can I leave a review?",
      answer:
        "Sign in with Google, open any business with “View details”, then pick a " +
        "star rating and write your review in the form at the bottom.",
      keywords: ["review", "rating", "rate", "star"],
    },
    {
      question: "How do I save a favorite?",
      answer:
        "Tap the ☆ star on any business card to save it. Your saved spots appear " +
        "under “Favorites” in the top bar. (Sign in first so we can save them.)",
      keywords: ["favorite", "bookmark", "save", "saved"],
    },
    {
      question: "How do I claim a deal?",
      answer:
        "Open a business with “View details”, then click “Claim deal” to reveal " +
        "its coupon code. You’ll need to be signed in first.",
      keywords: ["deal", "coupon", "claim", "code", "discount"],
    },
    {
      question: "How do I search or filter?",
      answer:
        "Type in the search bar up top to filter as you type, tap a category pill " +
        "to narrow by type, or use the Sort dropdown to sort by rating or name.",
      keywords: ["search", "filter", "category", "sort", "find"],
    },
    {
      question: "Why do I need to sign in?",
      answer:
        "Signing in with Google (and its 2-step verification) keeps bots out, so " +
        "only real people can post reviews, save favorites, and claim deals.",
      keywords: ["sign in", "signin", "log in", "login", "google", "account"],
    },
    {
      question: "How do I export my favorites?",
      answer:
        "Open “Favorites” in the top bar, then click “Export report” to download " +
        "them or “Print” to print the list.",
      keywords: ["export", "print", "report", "download"],
    },
  ];

  /** Cached DOM elements, populated in init(). */
  var elements = {};

  /** The running conversation sent to the model: [{role, content}, ...]. */
  var conversationMessages = [];

  /** Whether a request to the assistant is currently in flight. */
  var isAwaiting = false;

  /** Whether the conversation has been started (greeting shown). */
  var hasStarted = false;

  /** How many messages the user has sent in this conversation. */
  var userMessageCount = 0;

  /** Whether the user ended the chat (the assistant stops replying). */
  var chatEnded = false;

  /** The star rating the user selected (1–5), or 0 if not yet rated. */
  var selectedRating = 0;

  /** Number of stars shown in the rating widget. */
  var STAR_COUNT = 5;

  /**
   * Whether the Worker proxy URL has been configured.
   * @returns {boolean} True if a real proxy URL is set.
   */
  function isProxyConfigured() {
    return CHATBOT_PROXY_URL.indexOf("REPLACE_WITH") === -1 && CHATBOT_PROXY_URL.indexOf("http") === 0;
  }

  /**
   * Build a compact catalog string of current businesses for the assistant.
   * @returns {string} One line per business, or "" if the catalog is unavailable.
   */
  function buildCatalog() {
    if (!window.AppData || !window.AppData.getAllBusinesses) {
      return "";
    }
    return window.AppData
      .getAllBusinesses()
      .map(function (business) {
        var deal = business.deal ? " — Deal: " + business.deal.title : "";
        return "- " + business.name + " (" + business.category + ")" + deal;
      })
      .join("\n");
  }

  /**
   * Append a chat bubble and scroll to the newest message.
   * @param {string} text The message text.
   * @param {string} sender Either "bot" or "user".
   * @returns {void}
   */
  function addMessage(text, sender) {
    var bubble = document.createElement("div");
    bubble.className = "chat-bubble chat-bubble--" + sender;
    bubble.textContent = text;
    elements.messages.appendChild(bubble);
    elements.messages.scrollTop = elements.messages.scrollHeight;
  }

  /**
   * Show an animated "assistant is typing" indicator.
   * @returns {void}
   */
  function showTyping() {
    var typing = document.createElement("div");
    typing.className = "chat-bubble chat-bubble--bot chat-typing";
    typing.id = "chat-typing";
    typing.innerHTML = "<span></span><span></span><span></span>";
    elements.messages.appendChild(typing);
    elements.messages.scrollTop = elements.messages.scrollHeight;
  }

  /**
   * Remove the typing indicator if present.
   * @returns {void}
   */
  function hideTyping() {
    var typing = document.getElementById("chat-typing");
    if (typing) {
      typing.remove();
    }
  }

  /**
   * Render the starter-question chips in the options area.
   * @returns {void}
   */
  function renderStarters() {
    elements.options.innerHTML = "";
    STARTERS.forEach(function (item) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "chatbot-option";
      button.textContent = item.question;
      button.addEventListener("click", function () {
        handleSend(item.question);
      });
      elements.options.appendChild(button);
    });
  }

  /**
   * Clear the starter-question chips.
   * @returns {void}
   */
  function clearStarters() {
    elements.options.innerHTML = "";
  }

  /**
   * Find a canned fallback answer for a message (used when the AI is unavailable).
   * @param {string} text The user's message.
   * @returns {string|null} A canned answer, or null if none matches.
   */
  function fallbackAnswer(text) {
    var lower = text.toLowerCase();
    var index;
    for (index = 0; index < STARTERS.length; index++) {
      if (lower === STARTERS[index].question.toLowerCase()) {
        return STARTERS[index].answer;
      }
    }
    for (index = 0; index < STARTERS.length; index++) {
      var matched = STARTERS[index].keywords.some(function (keyword) {
        return lower.indexOf(keyword) !== -1;
      });
      if (matched) {
        return STARTERS[index].answer;
      }
    }
    return null;
  }

  /**
   * Send the current conversation to the Worker proxy and get the AI reply.
   * @param {Array<Object>} history The conversation messages.
   * @returns {Promise<string>} Resolves with the assistant's reply text.
   */
  function sendToAssistant(history) {
    if (!isProxyConfigured()) {
      return Promise.reject(new Error("not-configured"));
    }
    var payload = { messages: history };
    var catalog = buildCatalog();
    if (catalog) {
      payload.catalog = catalog;
    }
    return fetch(CHATBOT_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("bad-status");
        }
        return response.json();
      })
      .then(function (data) {
        if (!data || data.error || !data.reply) {
          throw new Error("no-reply");
        }
        return data.reply;
      });
  }

  /**
   * Enable or disable the composer while a request is in flight.
   * @param {boolean} busy Whether a request is awaiting a reply.
   * @returns {void}
   */
  function setBusy(busy) {
    isAwaiting = busy;
    elements.input.disabled = busy;
    elements.send.disabled = busy;
  }

  /**
   * Handle a user message (typed or from a starter chip).
   * @param {string} text The message text.
   * @returns {void}
   */
  function handleSend(text) {
    var trimmed = (text || "").trim();
    if (!trimmed || isAwaiting || chatEnded) {
      return;
    }
    clearStarters();
    hideEndPrompt();
    addMessage(trimmed, "user");
    conversationMessages.push({ role: "user", content: trimmed });
    userMessageCount += 1;
    elements.input.value = "";
    setBusy(true);
    showTyping();
    maybeShowEndPrompt();

    sendToAssistant(conversationMessages)
      .then(function (reply) {
        hideTyping();
        addMessage(reply, "bot");
        conversationMessages.push({ role: "assistant", content: reply });
      })
      .catch(function (error) {
        hideTyping();
        var fallback = fallbackAnswer(trimmed);
        if (fallback) {
          addMessage(fallback, "bot");
          conversationMessages.push({ role: "assistant", content: fallback });
        } else if (error.message === "not-configured") {
          addMessage(
            "The live assistant isn’t connected yet. In the meantime, pick one of the suggested questions below.",
            "bot"
          );
          renderStarters();
        } else {
          addMessage(
            "Sorry, I’m having trouble reaching the assistant right now. Please try again in a moment.",
            "bot"
          );
        }
      })
      .then(function () {
        if (chatEnded) {
          return;
        }
        setBusy(false);
        elements.input.focus();
        maybeShowEndPrompt();
      });
  }

  /**
   * Reveal the small "end chat" popup once the user has sent a message.
   * Does nothing if the chat has already ended.
   * @returns {void}
   */
  function maybeShowEndPrompt() {
    if (chatEnded || userMessageCount < 1 || !elements.endPrompt) {
      return;
    }
    elements.endPrompt.hidden = false;
    elements.messages.scrollTop = elements.messages.scrollHeight;
  }

  /**
   * Hide the small "end chat" popup.
   * @returns {void}
   */
  function hideEndPrompt() {
    if (elements.endPrompt) {
      elements.endPrompt.hidden = true;
    }
  }

  /**
   * End the conversation: stop the assistant from replying, lock the composer,
   * and show the star-rating overlay.
   * @returns {void}
   */
  function endChat() {
    if (chatEnded) {
      return;
    }
    chatEnded = true;
    hideEndPrompt();
    clearStarters();
    setBusy(true);
    renderStars();
    if (elements.rating) {
      elements.rating.hidden = false;
    }
  }

  /**
   * Paint the rating stars filled up to (and including) the given level.
   * @param {number} level How many stars to show as filled (0–5).
   * @returns {void}
   */
  function paintStars(level) {
    var starButtons = elements.stars.querySelectorAll(".chatbot__star");
    starButtons.forEach(function (starButton, index) {
      var isFilled = index < level;
      starButton.classList.toggle("is-filled", isFilled);
      starButton.textContent = isFilled ? "★" : "☆";
    });
  }

  /**
   * Save the chosen rating to the database (best-effort). Saving requires a
   * signed-in user, so when no one is signed in or the database is unavailable
   * this quietly does nothing — the on-screen thank-you note still appears.
   * @param {number} rating The selected rating (1–5).
   * @returns {void}
   */
  function persistRating(rating) {
    var isSignedIn = window.AppAuth && window.AppAuth.getCurrentUser();
    if (!window.AppStorage || !isSignedIn) {
      return;
    }
    window.AppStorage.addChatRating(rating).catch(function () {
      // Feedback is non-critical; ignore any write failure.
    });
  }

  /**
   * Record the chosen rating, lock the stars, and show a thank-you note.
   * @param {number} rating The selected rating (1–5).
   * @returns {void}
   */
  function submitRating(rating) {
    selectedRating = rating;
    paintStars(rating);
    persistRating(rating);
    var starButtons = elements.stars.querySelectorAll(".chatbot__star");
    starButtons.forEach(function (starButton) {
      starButton.disabled = true;
      starButton.setAttribute("aria-checked", "false");
    });
    starButtons[rating - 1].setAttribute("aria-checked", "true");
    if (elements.ratingThanks) {
      elements.ratingThanks.hidden = false;
    }
    // Briefly show the thank-you note, then close and wipe the chat so the next
    // time the launcher is opened a brand-new conversation appears.
    window.setTimeout(function () {
      closeChat();
      resetConversation();
    }, 1500);
  }

  /**
   * Wipe the conversation and all chat state back to a fresh start. After this
   * runs, opening the chat again shows a new greeting with no prior history.
   * @returns {void}
   */
  function resetConversation() {
    conversationMessages = [];
    userMessageCount = 0;
    chatEnded = false;
    selectedRating = 0;
    hasStarted = false;
    isAwaiting = false;
    elements.messages.innerHTML = "";
    clearStarters();
    hideEndPrompt();
    elements.stars.innerHTML = "";
    if (elements.rating) {
      elements.rating.hidden = true;
    }
    if (elements.ratingThanks) {
      elements.ratingThanks.hidden = true;
    }
    elements.input.value = "";
    elements.input.disabled = false;
    elements.send.disabled = false;
  }

  /**
   * Build the five interactive rating stars with hover and click behavior.
   * @returns {void}
   */
  function renderStars() {
    elements.stars.innerHTML = "";
    var starIndex;
    for (starIndex = 1; starIndex <= STAR_COUNT; starIndex++) {
      var starButton = document.createElement("button");
      starButton.type = "button";
      starButton.className = "chatbot__star";
      starButton.textContent = "☆";
      starButton.setAttribute("role", "radio");
      starButton.setAttribute("aria-checked", "false");
      starButton.setAttribute("aria-label", starIndex + " star" + (starIndex > 1 ? "s" : ""));
      bindStarEvents(starButton, starIndex);
      elements.stars.appendChild(starButton);
    }
  }

  /**
   * Attach hover and click handlers to a single rating star.
   * @param {HTMLElement} starButton The star button element.
   * @param {number} value The star's rating value (1–5).
   * @returns {void}
   */
  function bindStarEvents(starButton, value) {
    starButton.addEventListener("mouseenter", function () {
      if (selectedRating === 0) {
        paintStars(value);
      }
    });
    starButton.addEventListener("mouseleave", function () {
      if (selectedRating === 0) {
        paintStars(0);
      }
    });
    starButton.addEventListener("click", function () {
      if (selectedRating === 0) {
        submitRating(value);
      }
    });
  }

  /**
   * Start a fresh conversation with a greeting and the starter chips.
   * @returns {void}
   */
  function startConversation() {
    hasStarted = true;
    conversationMessages = [];
    addMessage(
      "Hi! I’m the Local Lift Assistant. 👋 Ask me anything about using Local Lift, or pick a question below.",
      "bot"
    );
    renderStarters();
  }

  /**
   * Open the chat window, starting the conversation on first open.
   * @returns {void}
   */
  function openChat() {
    if (!hasStarted) {
      startConversation();
    }
    elements.window.hidden = false;
    elements.launcher.setAttribute("aria-expanded", "true");
    elements.input.focus();
  }

  /**
   * Close (hide) the chat window.
   * @returns {void}
   */
  function closeChat() {
    elements.window.hidden = true;
    elements.launcher.setAttribute("aria-expanded", "false");
  }

  /**
   * Toggle the chat window open or closed.
   * @returns {void}
   */
  function toggleChat() {
    if (elements.window.hidden) {
      openChat();
    } else {
      closeChat();
    }
  }

  /**
   * Cache DOM references and bind events. Safe to call even if the chatbot
   * markup is absent (it simply does nothing).
   * @returns {void}
   */
  function init() {
    elements = {
      launcher: document.getElementById("chatbot-launcher"),
      window: document.getElementById("chatbot-window"),
      messages: document.getElementById("chatbot-messages"),
      options: document.getElementById("chatbot-options"),
      form: document.getElementById("chatbot-form"),
      input: document.getElementById("chatbot-input"),
      send: document.getElementById("chatbot-send"),
      endPrompt: document.getElementById("chatbot-endprompt"),
      endChat: document.getElementById("chatbot-endchat"),
      rating: document.getElementById("chatbot-rating"),
      stars: document.getElementById("chatbot-stars"),
      ratingThanks: document.getElementById("chatbot-rating-thanks"),
    };

    if (!elements.launcher || !elements.window || !elements.form) {
      return;
    }

    elements.launcher.setAttribute("aria-expanded", "false");
    elements.launcher.addEventListener("click", toggleChat);

    var closeButton = elements.window.querySelector("[data-chatbot-close]");
    if (closeButton) {
      closeButton.addEventListener("click", closeChat);
    }

    if (elements.endChat) {
      elements.endChat.addEventListener("click", endChat);
    }

    elements.form.addEventListener("submit", function (event) {
      event.preventDefault();
      handleSend(elements.input.value);
    });
  }

  /**
   * Public chatbot module surface.
   * @namespace AppChatbot
   */
  window.AppChatbot = {
    init: init,
  };
})();
