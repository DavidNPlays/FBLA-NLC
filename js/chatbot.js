/*
  chatbot.js — Guided help assistant (no AI, no free-text input).
  Responsibility: run a scripted help conversation inside the chat window. The
  user only clicks preloaded questions; the bot replies with canned answers.
  After the first answer an "End chat" button appears; ending the chat prompts a
  1–5 star rating and then shows a thank-you message. This module owns only the
  chatbot widget and holds no business, Firestore, or auth logic.
*/

(function defineChatbotModule() {
  "use strict";

  /**
   * The preloaded questions and their canned answers.
   * @type {Array<{question: string, answer: string}>}
   */
  var SCRIPTED_QUESTIONS = [
    {
      question: "How can I leave a review?",
      answer:
        "Sign in with Google, open any business with the “View details” button, " +
        "then pick a star rating and write your review in the form at the bottom.",
    },
    {
      question: "How do I save a favorite?",
      answer:
        "Tap the ☆ star on any business card to save it. Your saved spots appear " +
        "under “Favorites” in the top bar. (Sign in first so we can save them.)",
    },
    {
      question: "How do I claim a deal?",
      answer:
        "Open a business with “View details”, then click “Claim deal” to reveal " +
        "its coupon code. You’ll need to be signed in first.",
    },
    {
      question: "How do I search or filter?",
      answer:
        "Type in the search bar up top to filter as you type, tap a category pill " +
        "to narrow by type, or use the Sort dropdown to sort by rating or name.",
    },
    {
      question: "Why do I need to sign in?",
      answer:
        "Signing in with Google (and its 2-step verification) keeps bots out, so " +
        "only real people can post reviews, save favorites, and claim deals.",
    },
    {
      question: "How do I export my favorites?",
      answer:
        "Open “Favorites” in the top bar, then click “Export report” to download " +
        "them or “Print” to print the list.",
    },
  ];

  /** Cached DOM elements, populated in init(). */
  var elements = {};

  /** Whether the conversation has been started (greeting shown). */
  var hasStarted = false;

  /** Number of questions the user has had answered this conversation. */
  var answeredCount = 0;

  /** Whether the conversation has finished (rating submitted). */
  var hasEnded = false;

  /**
   * Append a chat bubble to the message list and scroll to the newest message.
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
   * Remove all option buttons from the options area.
   * @returns {void}
   */
  function clearOptions() {
    elements.options.innerHTML = "";
  }

  /**
   * Render the question buttons (and an "End chat" button once a question has
   * been answered) in the options area.
   * @returns {void}
   */
  function renderQuestionOptions() {
    clearOptions();
    SCRIPTED_QUESTIONS.forEach(function (item, index) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "chatbot-option";
      button.textContent = item.question;
      button.addEventListener("click", function () {
        handleQuestionClick(index);
      });
      elements.options.appendChild(button);
    });

    if (answeredCount > 0) {
      var endButton = document.createElement("button");
      endButton.type = "button";
      endButton.className = "chatbot-option chatbot-option--end";
      endButton.textContent = "End chat";
      endButton.addEventListener("click", endConversation);
      elements.options.appendChild(endButton);
    }
  }

  /**
   * Handle a click on one of the preloaded questions.
   * @param {number} index The index of the clicked question.
   * @returns {void}
   */
  function handleQuestionClick(index) {
    var item = SCRIPTED_QUESTIONS[index];
    addMessage(item.question, "user");
    addMessage(item.answer, "bot");
    answeredCount += 1;
    renderQuestionOptions();
  }

  /**
   * End the question phase and prompt the user to rate their experience.
   * @returns {void}
   */
  function endConversation() {
    clearOptions();
    addMessage("Before you go, how would you rate your experience?", "bot");
    renderRating();
  }

  /**
   * Render the 1–5 star rating control in the options area.
   * @returns {void}
   */
  function renderRating() {
    clearOptions();
    var stars = document.createElement("div");
    stars.className = "chatbot-rating";

    var starButtons = [];
    for (var value = 1; value <= 5; value++) {
      var star = document.createElement("button");
      star.type = "button";
      star.className = "chatbot-star";
      star.textContent = "☆";
      star.setAttribute("data-value", String(value));
      star.setAttribute("aria-label", value + (value === 1 ? " star" : " stars"));
      starButtons.push(star);
      stars.appendChild(star);
    }

    /**
     * Visually fill the stars up to a given count.
     * @param {number} count How many stars to fill.
     * @returns {void}
     */
    function fillStars(count) {
      starButtons.forEach(function (star, starIndex) {
        var filled = starIndex < count;
        star.textContent = filled ? "★" : "☆";
        star.classList.toggle("is-filled", filled);
      });
    }

    starButtons.forEach(function (star, starIndex) {
      star.addEventListener("mouseenter", function () {
        fillStars(starIndex + 1);
      });
      star.addEventListener("click", function () {
        handleRating(starIndex + 1);
      });
    });
    stars.addEventListener("mouseleave", function () {
      fillStars(0);
    });

    elements.options.appendChild(stars);
  }

  /**
   * Record the rating and show the thank-you message.
   * @param {number} value The chosen rating from 1 to 5.
   * @returns {void}
   */
  function handleRating(value) {
    addMessage(value + (value === 1 ? " star" : " stars"), "user");
    addMessage("Thank you for your feedback!", "bot");
    clearOptions();
    hasEnded = true;
    hasStarted = false;
  }

  /**
   * Reset the conversation back to its starting state.
   * @returns {void}
   */
  function resetConversation() {
    elements.messages.innerHTML = "";
    clearOptions();
    hasStarted = false;
    answeredCount = 0;
    hasEnded = false;
  }

  /**
   * Start a fresh conversation with a greeting and the question list.
   * @returns {void}
   */
  function startConversation() {
    hasStarted = true;
    answeredCount = 0;
    hasEnded = false;
    addMessage(
      "Hi! I’m the BizWiz assistant. 👋 Pick a question below and I’ll help you out.",
      "bot"
    );
    renderQuestionOptions();
  }

  /**
   * Open the chat window, starting a fresh conversation when needed.
   * @returns {void}
   */
  function openChat() {
    if (hasEnded || !hasStarted) {
      resetConversation();
      startConversation();
    }
    elements.window.hidden = false;
    elements.launcher.setAttribute("aria-expanded", "true");
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
   * Cache DOM references and bind the launcher and close events. Safe to call
   * even if the chatbot markup is absent (it simply does nothing).
   * @returns {void}
   */
  function init() {
    elements = {
      launcher: document.getElementById("chatbot-launcher"),
      window: document.getElementById("chatbot-window"),
      messages: document.getElementById("chatbot-messages"),
      options: document.getElementById("chatbot-options"),
    };

    if (!elements.launcher || !elements.window) {
      return;
    }

    elements.launcher.setAttribute("aria-expanded", "false");
    elements.launcher.addEventListener("click", toggleChat);

    var closeButton = elements.window.querySelector("[data-chatbot-close]");
    if (closeButton) {
      closeButton.addEventListener("click", closeChat);
    }
  }

  /**
   * Public chatbot module surface.
   * @namespace AppChatbot
   */
  window.AppChatbot = {
    init: init,
  };
})();
