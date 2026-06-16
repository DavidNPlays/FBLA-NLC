/*
  ui.js — All DOM manipulation and rendering.
  Responsibility: build and update the page from data, and translate user
  interactions into calls on a set of handler callbacks provided by app.js.
  This module never touches Firestore or Firebase Auth directly; it only renders
  and emits intent, keeping presentation separate from data and auth logic.
*/

(function defineUiModule() {
  "use strict";

  /**
   * Handler callbacks supplied by the controller (app.js). Populated by init().
   * @type {Object<string, Function>}
   */
  var handlers = {};

  /** The business currently shown in the detail modal, or null. */
  var activeBusiness = null;

  /** Cached DOM elements, populated in init(). */
  var elements = {};

  /** Timer id used to auto-hide the toast. */
  var toastTimer = null;

  /**
   * Escape a string so it can be safely inserted as HTML text.
   * @param {string} value Raw, possibly user-supplied text.
   * @returns {string} HTML-escaped text.
   */
  function escapeHtml(value) {
    var text = value == null ? "" : String(value);
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Format a JavaScript Date as a short, human-readable date.
   * @param {Date} date The date to format.
   * @returns {string} e.g. "Jun 16, 2026".
   */
  function formatDate(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  /**
   * Build the HTML for a 5-star rating display with partial fill.
   * @param {number} rating Average rating from 0 to 5.
   * @returns {string} HTML markup for the star display.
   */
  function buildStars(rating) {
    var percent = Math.max(0, Math.min(100, (rating / 5) * 100));
    return (
      '<span class="stars" aria-hidden="true">' +
      '<span class="stars__track">★★★★★</span>' +
      '<span class="stars__fill" style="width:' +
      percent +
      '%">★★★★★</span>' +
      "</span>"
    );
  }

  /**
   * Read the current values of the search, category, and sort controls.
   * @returns {{searchTerm: string, category: string, sortBy: string}} Query options.
   */
  function getControlValues() {
    return {
      searchTerm: elements.searchInput.value,
      category: elements.categoryFilter.value,
      sortBy: elements.sortSelect.value,
    };
  }

  /**
   * Notify the controller that the query controls changed.
   * @returns {void}
   */
  function emitQueryChange() {
    if (handlers.onQueryChange) {
      handlers.onQueryChange(getControlValues());
    }
  }

  /**
   * Populate the category filter dropdown.
   * @param {Array<string>} categories Category names to add as options.
   * @returns {void}
   */
  function populateCategories(categories) {
    categories.forEach(function (category) {
      var option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      elements.categoryFilter.appendChild(option);
    });
  }

  /**
   * Build the HTML for a single business card.
   * @param {Object} business The business to render.
   * @param {number} index The card's position (used to stagger the animation).
   * @param {boolean} isBookmarked Whether the business is in the user's favorites.
   * @returns {string} The card's HTML.
   */
  function buildCard(business, index, isBookmarked) {
    var average = window.AppData.getAverageRating(business);
    var count = window.AppData.getRatingCount(business);
    var ratingLabel = count > 0 ? average.toFixed(1) + " (" + count + ")" : "No ratings yet";

    return (
      '<article class="card" style="--card-index:' +
      index +
      '" data-business-id="' +
      escapeHtml(business.id) +
      '">' +
      '<div class="card__top">' +
      '<div class="card__icon" aria-hidden="true">' +
      escapeHtml(business.icon || "🏪") +
      "</div>" +
      '<button class="card__bookmark' +
      (isBookmarked ? " is-active" : "") +
      '" type="button" data-action="bookmark" data-business-id="' +
      escapeHtml(business.id) +
      '" aria-label="' +
      (isBookmarked ? "Remove bookmark" : "Add bookmark") +
      '" title="Save to favorites">' +
      (isBookmarked ? "★" : "☆") +
      "</button>" +
      "</div>" +
      '<h3 class="card__name">' +
      escapeHtml(business.name) +
      "</h3>" +
      '<div class="card__meta">' +
      '<span class="badge">' +
      escapeHtml(business.category) +
      "</span>" +
      "<span>" +
      escapeHtml(business.priceLevel || "") +
      "</span>" +
      "</div>" +
      '<div class="card__rating">' +
      buildStars(average) +
      "<span>" +
      escapeHtml(ratingLabel) +
      "</span>" +
      "</div>" +
      '<p class="card__description">' +
      escapeHtml(business.description) +
      "</p>" +
      (business.deal
        ? '<div class="card__deal"><span aria-hidden="true">🎟️</span><span>' +
          escapeHtml(business.deal.title) +
          "</span></div>"
        : "") +
      '<div class="card__footer">' +
      '<button class="button button--ghost card__view" type="button" data-action="open" data-business-id="' +
      escapeHtml(business.id) +
      '">View details</button>' +
      "</div>" +
      "</article>"
    );
  }

  /**
   * Render the grid of businesses and the results summary.
   * @param {Array<Object>} businesses The filtered/sorted businesses to show.
   * @param {Object<string, boolean>} bookmarkedIds Map of bookmarked business ids.
   * @returns {void}
   */
  function renderBusinesses(businesses, bookmarkedIds) {
    var marks = bookmarkedIds || {};
    elements.resultsSummary.textContent =
      businesses.length === 1
        ? "1 business found"
        : businesses.length + " businesses found";

    if (businesses.length === 0) {
      elements.businessGrid.innerHTML = "";
      elements.emptyState.hidden = false;
      return;
    }

    elements.emptyState.hidden = true;
    elements.businessGrid.innerHTML = businesses
      .map(function (business, index) {
        return buildCard(business, index, !!marks[business.id]);
      })
      .join("");
  }

  /**
   * Update a single card's bookmark button without re-rendering the grid.
   * @param {string} businessId The business whose button should change.
   * @param {boolean} isBookmarked The new bookmark state.
   * @returns {void}
   */
  function setCardBookmarkState(businessId, isBookmarked) {
    var selector = '.card__bookmark[data-business-id="' + businessId + '"]';
    var button = elements.businessGrid.querySelector(selector);
    if (button) {
      button.classList.toggle("is-active", isBookmarked);
      button.textContent = isBookmarked ? "★" : "☆";
      button.setAttribute("aria-label", isBookmarked ? "Remove bookmark" : "Add bookmark");
    }
  }

  /**
   * Build the HTML for the list of reviews shown in the detail modal.
   * @param {Array<Object>} reviews Review records ({userName, rating, text, createdAt}).
   * @returns {string} The reviews HTML, or an empty-state message.
   */
  function buildReviewsHtml(reviews) {
    if (!reviews || reviews.length === 0) {
      return '<p class="review-empty">No reviews yet. Be the first to leave one!</p>';
    }
    return reviews
      .map(function (review) {
        return (
          '<div class="review">' +
          '<div class="review__head">' +
          '<span class="review__author">' +
          escapeHtml(review.userName || "Anonymous") +
          "</span>" +
          '<span class="review__date">' +
          escapeHtml(formatDate(review.createdAt)) +
          "</span>" +
          "</div>" +
          buildStars(review.rating) +
          '<p class="review__text">' +
          escapeHtml(review.text) +
          "</p>" +
          "</div>"
        );
      })
      .join("");
  }

  /**
   * Build the review submission form (signed in) or a sign-in prompt (signed out).
   * @param {boolean} isSignedIn Whether a user is currently signed in.
   * @returns {string} The form or prompt HTML.
   */
  function buildReviewForm(isSignedIn) {
    if (!isSignedIn) {
      return (
        '<div class="sign-in-prompt">Sign in with Google to leave a review, ' +
        "save favorites, and claim deals.</div>"
      );
    }
    return (
      '<form class="review-form" id="review-form">' +
      '<div class="star-picker" role="radiogroup" aria-label="Your rating">' +
      [5, 4, 3, 2, 1]
        .map(function (value) {
          return (
            '<input type="radio" name="rating" id="star-' +
            value +
            '" value="' +
            value +
            '" />' +
            '<label for="star-' +
            value +
            '" title="' +
            value +
            ' star' +
            (value > 1 ? "s" : "") +
            '">★</label>'
          );
        })
        .join("") +
      "</div>" +
      '<textarea class="review-form__textarea" id="review-text" ' +
      'placeholder="Share your experience…" maxlength="500"></textarea>' +
      '<div class="review-form__actions">' +
      '<button class="button button--primary button--small" type="submit">Post review</button>' +
      "</div>" +
      "</form>"
    );
  }

  /**
   * Render the full business detail modal and open it.
   * @param {Object} business The business to display.
   * @param {Object} state View state.
   * @param {Array<Object>} state.reviews Reviews for this business.
   * @param {boolean} state.isSignedIn Whether the user is signed in.
   * @param {boolean} state.isDealClaimed Whether the user already claimed the deal.
   * @returns {void}
   */
  function openBusinessModal(business, state) {
    activeBusiness = business;
    var average = window.AppData.getAverageRating(business);
    var count = window.AppData.getRatingCount(business);
    var ratingLabel =
      count > 0 ? average.toFixed(1) + " out of 5 (" + count + ")" : "No ratings yet";

    var dealHtml = business.deal
      ? '<div class="detail__deal">' +
        '<div class="detail__deal-title">🎟️ ' +
        escapeHtml(business.deal.title) +
        "</div>" +
        '<div class="detail__deal-desc">' +
        escapeHtml(business.deal.description) +
        "</div>" +
        '<div class="deal-code' +
        (state.isDealClaimed ? " is-visible" : "") +
        '" id="deal-code">Code: ' +
        escapeHtml(business.deal.code) +
        "</div>" +
        (state.isDealClaimed
          ? ""
          : '<button class="button button--primary button--small" type="button" ' +
            'id="claim-deal" style="margin-top:12px;">Claim deal</button>') +
        "</div>"
      : "";

    elements.modalBody.innerHTML =
      '<div class="detail__header">' +
      '<div class="detail__icon" aria-hidden="true">' +
      escapeHtml(business.icon || "🏪") +
      "</div>" +
      "<div>" +
      '<h2 class="detail__name" id="modal-business-name">' +
      escapeHtml(business.name) +
      "</h2>" +
      '<div class="card__meta"><span class="badge">' +
      escapeHtml(business.category) +
      "</span><span>" +
      escapeHtml(business.priceLevel || "") +
      "</span></div>" +
      "</div>" +
      "</div>" +
      '<div class="card__rating">' +
      buildStars(average) +
      "<span>" +
      escapeHtml(ratingLabel) +
      "</span></div>" +
      '<div class="detail__info">' +
      '<div class="detail__info-row"><span aria-hidden="true">📍</span><span>' +
      escapeHtml(business.address) +
      "</span></div>" +
      '<div class="detail__info-row"><span aria-hidden="true">📞</span><span>' +
      escapeHtml(business.phone) +
      "</span></div>" +
      '<div class="detail__info-row"><span aria-hidden="true">🕑</span><span>' +
      escapeHtml(business.hours) +
      "</span></div>" +
      "</div>" +
      "<p style=\"margin-top:16px;color:var(--color-text-soft);\">" +
      escapeHtml(business.description) +
      "</p>" +
      dealHtml +
      '<h3 class="section-title">Reviews</h3>' +
      '<div id="reviews-list">' +
      buildReviewsHtml(state.reviews) +
      "</div>" +
      buildReviewForm(state.isSignedIn);

    openModal(elements.businessModal);
    bindModalDynamicEvents(business);
  }

  /**
   * Wire up the claim-deal button and review form inside the open modal.
   * @param {Object} business The business shown in the modal.
   * @returns {void}
   */
  function bindModalDynamicEvents(business) {
    var claimButton = document.getElementById("claim-deal");
    if (claimButton) {
      claimButton.addEventListener("click", function () {
        if (handlers.onClaimDeal) {
          handlers.onClaimDeal(business);
        }
      });
    }

    var reviewForm = document.getElementById("review-form");
    if (reviewForm) {
      reviewForm.addEventListener("submit", function (event) {
        event.preventDefault();
        var checked = reviewForm.querySelector('input[name="rating"]:checked');
        var textField = document.getElementById("review-text");
        var rating = checked ? parseInt(checked.value, 10) : 0;
        var text = textField ? textField.value.trim() : "";

        if (!rating) {
          showToast("Please choose a star rating.", "error");
          return;
        }
        if (!text) {
          showToast("Please write a short review.", "error");
          return;
        }
        if (handlers.onSubmitReview) {
          handlers.onSubmitReview(business, rating, text);
        }
      });
    }
  }

  /**
   * Replace the reviews list inside the open modal (after a new review posts).
   * @param {Array<Object>} reviews The updated list of reviews.
   * @returns {void}
   */
  function renderModalReviews(reviews) {
    var list = document.getElementById("reviews-list");
    if (list) {
      list.innerHTML = buildReviewsHtml(reviews);
    }
    var form = document.getElementById("review-form");
    if (form) {
      form.reset();
    }
  }

  /**
   * Reveal the deal code and remove the claim button in the open modal.
   * @returns {void}
   */
  function revealDealCode() {
    var code = document.getElementById("deal-code");
    if (code) {
      code.classList.add("is-visible");
    }
    var claimButton = document.getElementById("claim-deal");
    if (claimButton) {
      claimButton.remove();
    }
  }

  /**
   * Render the favorites modal with the user's bookmarked businesses.
   * @param {Array<Object>} favorites The bookmarked businesses.
   * @returns {void}
   */
  function openFavoritesModal(favorites) {
    if (!favorites || favorites.length === 0) {
      elements.favoritesList.innerHTML =
        '<p class="favorites-empty">You have no favorites yet. Tap the ☆ on any ' +
        "business to save it here.</p>";
    } else {
      elements.favoritesList.innerHTML = favorites
        .map(function (business) {
          var average = window.AppData.getAverageRating(business);
          return (
            '<div class="favorite-row">' +
            '<div class="favorite-row__icon" aria-hidden="true">' +
            escapeHtml(business.icon || "🏪") +
            "</div>" +
            '<div class="favorite-row__body">' +
            '<div class="favorite-row__name">' +
            escapeHtml(business.name) +
            "</div>" +
            '<div class="favorite-row__meta">' +
            escapeHtml(business.category) +
            " · " +
            (average > 0 ? average.toFixed(1) + " ★" : "No ratings") +
            "</div>" +
            "</div>" +
            '<button class="favorite-row__remove" type="button" data-action="remove-favorite" ' +
            'data-business-id="' +
            escapeHtml(business.id) +
            '">Remove</button>' +
            "</div>"
          );
        })
        .join("");
    }
    openModal(elements.favoritesModal);
  }

  /**
   * Update the favorites count badge in the header.
   * @param {number} count Number of bookmarked businesses.
   * @returns {void}
   */
  function updateFavoritesCount(count) {
    elements.favoritesCount.textContent = String(count);
    elements.favoritesCount.hidden = count === 0;
  }

  /**
   * Reflect the current auth state in the header (sign-in button vs user chip).
   * @param {Object|null} user The signed-in user, or null when signed out.
   * @returns {void}
   */
  function updateAuthState(user) {
    if (user) {
      elements.signInButton.hidden = true;
      elements.userChip.hidden = false;
      elements.userName.textContent = user.displayName || user.email || "Signed in";
      if (user.photoURL) {
        elements.userAvatar.src = user.photoURL;
      }
    } else {
      elements.signInButton.hidden = false;
      elements.userChip.hidden = true;
    }
  }

  /**
   * Show a transient toast notification.
   * @param {string} message The message to display.
   * @param {string} [type] Optional "error" to style the toast as an error.
   * @returns {void}
   */
  function showToast(message, type) {
    elements.toast.textContent = message;
    elements.toast.className = "toast is-visible" + (type === "error" ? " toast--error" : "");
    elements.toast.hidden = false;
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(function () {
      elements.toast.classList.remove("is-visible");
    }, 2800);
  }

  /**
   * Open a modal element.
   * @param {HTMLElement} modal The modal to open.
   * @returns {void}
   */
  function openModal(modal) {
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  /**
   * Close every open modal and restore page scrolling.
   * @returns {void}
   */
  function closeModals() {
    document.querySelectorAll(".modal").forEach(function (modal) {
      modal.hidden = true;
    });
    document.body.style.overflow = "";
    activeBusiness = null;
  }

  /**
   * Cache DOM references and bind all static event listeners.
   * @param {Object<string, Function>} providedHandlers Controller callbacks.
   * @returns {void}
   */
  function init(providedHandlers) {
    handlers = providedHandlers || {};

    elements = {
      searchInput: document.getElementById("search-input"),
      categoryFilter: document.getElementById("category-filter"),
      sortSelect: document.getElementById("sort-select"),
      resultsSummary: document.getElementById("results-summary"),
      businessGrid: document.getElementById("business-grid"),
      emptyState: document.getElementById("empty-state"),
      businessModal: document.getElementById("business-modal"),
      modalBody: document.getElementById("modal-body"),
      favoritesModal: document.getElementById("favorites-modal"),
      favoritesList: document.getElementById("favorites-list"),
      favoritesButton: document.getElementById("favorites-button"),
      favoritesCount: document.getElementById("favorites-count"),
      helpButton: document.getElementById("help-button"),
      helpModal: document.getElementById("help-modal"),
      signInButton: document.getElementById("sign-in-button"),
      signOutButton: document.getElementById("sign-out-button"),
      userChip: document.getElementById("user-chip"),
      userName: document.getElementById("user-name"),
      userAvatar: document.getElementById("user-avatar"),
      printFavorites: document.getElementById("print-favorites"),
      exportFavorites: document.getElementById("export-favorites"),
      toast: document.getElementById("toast"),
    };

    // Real-time search + filter + sort controls.
    elements.searchInput.addEventListener("input", emitQueryChange);
    elements.categoryFilter.addEventListener("change", emitQueryChange);
    elements.sortSelect.addEventListener("change", emitQueryChange);

    // Auth buttons.
    elements.signInButton.addEventListener("click", function () {
      if (handlers.onSignIn) {
        handlers.onSignIn();
      }
    });
    elements.signOutButton.addEventListener("click", function () {
      if (handlers.onSignOut) {
        handlers.onSignOut();
      }
    });

    // Help button opens the how-to modal.
    elements.helpButton.addEventListener("click", function () {
      openModal(elements.helpModal);
    });

    // Favorites button + export/print.
    elements.favoritesButton.addEventListener("click", function () {
      if (handlers.onOpenFavorites) {
        handlers.onOpenFavorites();
      }
    });
    elements.exportFavorites.addEventListener("click", function () {
      if (handlers.onExportFavorites) {
        handlers.onExportFavorites();
      }
    });
    elements.printFavorites.addEventListener("click", function () {
      if (handlers.onPrintFavorites) {
        handlers.onPrintFavorites();
      }
    });

    // Delegated clicks inside the grid (open detail, toggle bookmark).
    elements.businessGrid.addEventListener("click", function (event) {
      var trigger = event.target.closest("[data-action]");
      if (!trigger) {
        return;
      }
      var businessId = trigger.getAttribute("data-business-id");
      var action = trigger.getAttribute("data-action");
      if (action === "open" && handlers.onOpenBusiness) {
        handlers.onOpenBusiness(businessId);
      } else if (action === "bookmark" && handlers.onToggleBookmark) {
        handlers.onToggleBookmark(businessId);
      }
    });

    // Delegated clicks inside the favorites list (remove favorite).
    elements.favoritesList.addEventListener("click", function (event) {
      var trigger = event.target.closest('[data-action="remove-favorite"]');
      if (trigger && handlers.onRemoveFavorite) {
        handlers.onRemoveFavorite(trigger.getAttribute("data-business-id"));
      }
    });

    // Close modals via overlay, close button, or Escape key.
    document.querySelectorAll("[data-close-modal]").forEach(function (node) {
      node.addEventListener("click", closeModals);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeModals();
      }
    });
  }

  /**
   * Public UI module surface.
   * @namespace AppUI
   */
  window.AppUI = {
    init: init,
    populateCategories: populateCategories,
    renderBusinesses: renderBusinesses,
    setCardBookmarkState: setCardBookmarkState,
    openBusinessModal: openBusinessModal,
    renderModalReviews: renderModalReviews,
    revealDealCode: revealDealCode,
    openFavoritesModal: openFavoritesModal,
    updateFavoritesCount: updateFavoritesCount,
    updateAuthState: updateAuthState,
    showToast: showToast,
    closeModals: closeModals,
  };
})();
