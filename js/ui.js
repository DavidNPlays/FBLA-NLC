/*
  ui.js — All DOM manipulation and rendering.
  Responsibility: build and update the page from data, switch between the home,
  business-detail, and favorites views, and translate user interactions into
  calls on a set of handler callbacks provided by app.js. This module never
  touches Firestore or Firebase Auth directly; it only renders and emits intent,
  keeping presentation separate from data and auth logic.
*/

(function defineUiModule() {
  "use strict";

  /**
   * Handler callbacks supplied by the controller (app.js). Populated by init().
   * @type {Object<string, Function>}
   */
  var handlers = {};

  /** The business currently shown on the detail page, or null. */
  var activeBusiness = null;

  /** The currently selected category filter ("all" or a category name). */
  var activeCategory = "all";

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
   * Attach an error fallback to each photo in a container so a broken image is
   * replaced by a gradient tile (and, where present, a category emoji).
   * @param {HTMLElement} root The element whose images should get fallbacks.
   * @returns {void}
   */
  function bindImageFallbacks(root) {
    root.querySelectorAll("img[data-photo]").forEach(function (image) {
      image.addEventListener("error", function () {
        image.style.display = "none";
        var parent = image.parentElement;
        if (!parent) {
          return;
        }
        var fallbackClass = image.getAttribute("data-fallback-class");
        if (fallbackClass) {
          parent.classList.add(fallbackClass);
        }
        var emoji = parent.querySelector("[data-emoji]");
        if (emoji) {
          emoji.hidden = false;
        }
      });
    });
  }

  /**
   * Read the current values of the search, category, rating, and sort controls.
   * @returns {{searchTerm: string, category: string, sortBy: string, minRating: number}} Query options.
   */
  function getControlValues() {
    return {
      searchTerm: elements.searchInput.value,
      category: activeCategory,
      sortBy: elements.sortSelect.value,
      minRating: parseFloat(elements.ratingSelect.value) || 0,
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
   * Switch which top-level view is visible and scroll to the top.
   * @param {string} name One of "home", "business", or "favorites".
   * @returns {void}
   */
  function showView(name) {
    var views = {
      home: elements.viewHome,
      business: elements.viewBusiness,
      favorites: elements.viewFavorites,
    };
    Object.keys(views).forEach(function (key) {
      if (views[key]) {
        views[key].hidden = key !== name;
      }
    });
    window.scrollTo(0, 0);
  }

  /**
   * Render the category filter as a row of pill buttons (with an "All" pill).
   * @param {Array<string>} categories Category names to add as pills.
   * @returns {void}
   */
  function populateCategories(categories) {
    var pills = ['<button class="filter-pill is-active" type="button" data-category="all" aria-pressed="true">All</button>'];
    categories.forEach(function (category) {
      pills.push(
        '<button class="filter-pill" type="button" data-category="' +
          escapeHtml(category) +
          '" aria-pressed="false">' +
          escapeHtml(category) +
          "</button>"
      );
    });
    elements.categoryFilters.innerHTML = pills.join("");
  }

  /**
   * Build the media (photo or gradient+emoji fallback) for a business card.
   * @param {Object} business The business to render media for.
   * @param {boolean} isBookmarked Whether the business is bookmarked.
   * @returns {string} The media HTML.
   */
  function buildCardMedia(business, isBookmarked) {
    var bookmarkButton =
      '<button class="card__bookmark' +
      (isBookmarked ? " is-active" : "") +
      '" type="button" data-action="bookmark" data-business-id="' +
      escapeHtml(business.id) +
      '" aria-label="' +
      (isBookmarked ? "Remove bookmark" : "Add bookmark") +
      '" title="Save to favorites">' +
      (isBookmarked ? "★" : "☆") +
      "</button>";

    if (business.image) {
      return (
        '<div class="card__media">' +
        '<img class="card__photo" data-photo data-fallback-class="card__media--fallback" ' +
        'src="' +
        escapeHtml(business.image) +
        '" alt="' +
        escapeHtml(business.name) +
        '" loading="lazy" />' +
        '<span class="card__emoji" data-emoji aria-hidden="true" hidden>' +
        escapeHtml(business.icon || "🏪") +
        "</span>" +
        bookmarkButton +
        "</div>"
      );
    }
    return (
      '<div class="card__media card__media--fallback">' +
      '<span class="card__emoji" aria-hidden="true">' +
      escapeHtml(business.icon || "🏪") +
      "</span>" +
      bookmarkButton +
      "</div>"
    );
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
      '">' +
      buildCardMedia(business, isBookmarked) +
      '<div class="card__body">' +
      '<h3 class="card__name">' +
      escapeHtml(business.name) +
      "</h3>" +
      '<div class="card__meta">' +
      '<span class="badge">' +
      escapeHtml(business.category) +
      "</span>" +
      '<span class="price-level">' +
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
      '<button class="button button--primary card__view" type="button" data-action="open" data-business-id="' +
      escapeHtml(business.id) +
      '">View details</button>' +
      "</div>" +
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
    bindImageFallbacks(elements.businessGrid);
  }

  /**
   * Update every bookmark toggle for a business (grid card and detail page).
   * @param {string} businessId The business whose buttons should change.
   * @param {boolean} isBookmarked The new bookmark state.
   * @returns {void}
   */
  function setBookmarkState(businessId, isBookmarked) {
    var selector = '[data-action="bookmark"][data-business-id="' + businessId + '"]';
    document.querySelectorAll(selector).forEach(function (button) {
      button.classList.toggle("is-active", isBookmarked);
      var icon = button.querySelector("[data-bookmark-icon]");
      var label = button.querySelector("[data-bookmark-label]");
      if (icon) {
        icon.textContent = isBookmarked ? "★" : "☆";
      } else {
        button.textContent = isBookmarked ? "★" : "☆";
      }
      if (label) {
        label.textContent = isBookmarked ? "Saved" : "Save";
      }
      button.setAttribute("aria-label", isBookmarked ? "Remove bookmark" : "Add bookmark");
    });
  }

  /**
   * Build the HTML for the list of review cards shown on the detail page.
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
          '<div class="review-card">' +
          '<div class="review-card__head">' +
          '<span class="review-card__author">' +
          escapeHtml(review.userName || "Anonymous") +
          "</span>" +
          '<span class="review-card__date">' +
          escapeHtml(formatDate(review.createdAt)) +
          "</span>" +
          "</div>" +
          buildStars(review.rating) +
          '<p class="review-card__text">' +
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
            " star" +
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
   * Build the photo hero (or gradient+emoji fallback) for the detail page.
   * @param {Object} business The business being shown.
   * @param {number} average The average rating.
   * @param {number} count The number of ratings.
   * @returns {string} The hero HTML.
   */
  function buildDetailHero(business, average, count) {
    var ratingText =
      count > 0 ? average.toFixed(1) + " out of 5 (" + count + ")" : "No ratings yet";
    var scrim =
      '<div class="detail-hero__scrim">' +
      '<span class="detail-hero__badge">' +
      escapeHtml(business.category) +
      "</span>" +
      '<h1 class="detail-hero__title" id="business-detail-name">' +
      escapeHtml(business.name) +
      "</h1>" +
      '<div class="detail-hero__rating">' +
      buildStars(average) +
      "<span>" +
      escapeHtml(ratingText) +
      "</span></div>" +
      "</div>";

    if (business.image) {
      return (
        '<div class="detail-hero">' +
        '<img class="detail-hero__photo" data-photo data-fallback-class="detail-hero--fallback" ' +
        'src="' +
        escapeHtml(business.image) +
        '" alt="' +
        escapeHtml(business.name) +
        '" />' +
        '<span class="detail-hero__emoji" data-emoji aria-hidden="true" hidden>' +
        escapeHtml(business.icon || "🏪") +
        "</span>" +
        scrim +
        "</div>"
      );
    }
    return (
      '<div class="detail-hero detail-hero--fallback">' +
      '<span class="detail-hero__emoji" aria-hidden="true">' +
      escapeHtml(business.icon || "🏪") +
      "</span>" +
      scrim +
      "</div>"
    );
  }

  /**
   * Build the "Save to favorites" toggle shown on the detail page.
   * @param {Object} business The business being shown.
   * @param {boolean} isBookmarked Whether the business is already saved.
   * @returns {string} The button HTML.
   */
  function buildDetailBookmark(business, isBookmarked) {
    return (
      '<button class="button button--secondary detail-bookmark' +
      (isBookmarked ? " is-active" : "") +
      '" type="button" data-action="bookmark" data-business-id="' +
      escapeHtml(business.id) +
      '" aria-label="' +
      (isBookmarked ? "Remove bookmark" : "Add bookmark") +
      '"><span data-bookmark-icon aria-hidden="true">' +
      (isBookmarked ? "★" : "☆") +
      '</span><span data-bookmark-label>' +
      (isBookmarked ? "Saved" : "Save") +
      "</span></button>"
    );
  }

  /**
   * Build an embedded Google Map and an "open in Maps" link for a business.
   * @param {Object} business The business to map (uses its name and address).
   * @returns {string} The map section HTML.
   */
  function buildMapSection(business) {
    // Use "Name, Address" so Google resolves the exact business, zoom in close
    // (z=16) on the embed, and open the place itself (selected) from the link.
    var place = encodeURIComponent(business.name + ", " + (business.address || ""));
    var embedSrc = "https://maps.google.com/maps?q=" + place + "&z=16&iwloc=&output=embed";
    var linkHref = "https://www.google.com/maps/search/?api=1&query=" + place;
    return (
      '<div class="detail-section">' +
      '<div class="section-title">Location</div>' +
      '<div class="detail-map">' +
      '<iframe class="detail-map__frame" title="Map of ' +
      escapeHtml(business.name) +
      '" src="' +
      embedSrc +
      '" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>' +
      "</div>" +
      '<a class="detail-map__link" href="' +
      linkHref +
      '" target="_blank" rel="noopener">Open in Google Maps ↗</a>' +
      "</div>"
    );
  }

  /**
   * Render the full business detail page and switch to it.
   * @param {Object} business The business to display.
   * @param {Object} state View state.
   * @param {Array<Object>} state.reviews Reviews for this business (seed + live).
   * @param {boolean} state.isSignedIn Whether the user is signed in.
   * @param {boolean} state.isDealClaimed Whether the user already claimed the deal.
   * @param {boolean} state.isBookmarked Whether the business is in the user's favorites.
   * @returns {void}
   */
  function renderBusinessPage(business, state) {
    activeBusiness = business;
    var average = window.AppData.getAverageRating(business);
    var count = window.AppData.getRatingCount(business);

    var dealHtml = business.deal
      ? '<div class="detail-section">' +
        '<div class="detail-deal">' +
        '<div class="detail-deal__title">🎟️ ' +
        escapeHtml(business.deal.title) +
        "</div>" +
        '<div class="detail-deal__desc">' +
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
        "</div>" +
        "</div>"
      : "";

    elements.businessPage.innerHTML =
      buildDetailHero(business, average, count) +
      '<div class="detail-actions">' +
      buildDetailBookmark(business, !!state.isBookmarked) +
      "</div>" +
      '<div class="detail-section">' +
      '<div class="info-card">' +
      '<div class="section-title">About</div>' +
      '<p class="info-card__text">' +
      escapeHtml(business.description) +
      "</p>" +
      '<div class="visit-info">' +
      '<div class="visit-info__row"><span aria-hidden="true">📍</span><span>' +
      escapeHtml(business.address) +
      "</span></div>" +
      '<div class="visit-info__row"><span aria-hidden="true">📞</span><span>' +
      escapeHtml(business.phone) +
      "</span></div>" +
      '<div class="visit-info__row"><span aria-hidden="true">🕑</span><span>' +
      escapeHtml(business.hours) +
      "</span></div>" +
      "</div>" +
      "</div>" +
      "</div>" +
      buildMapSection(business) +
      dealHtml +
      '<div class="detail-section">' +
      '<div class="section-title">Reviews</div>' +
      '<div id="reviews-list">' +
      buildReviewsHtml(state.reviews) +
      "</div>" +
      buildReviewForm(state.isSignedIn) +
      "</div>";

    bindImageFallbacks(elements.businessPage);
    bindDetailDynamicEvents(business);
    showView("business");
  }

  /**
   * Wire up the claim-deal button and review form on the open detail page.
   * @param {Object} business The business shown on the page.
   * @returns {void}
   */
  function bindDetailDynamicEvents(business) {
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
   * Replace the reviews list on the detail page (after a new review posts).
   * @param {Array<Object>} reviews The updated list of reviews.
   * @returns {void}
   */
  function renderBusinessReviews(reviews) {
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
   * Reveal the deal code and remove the claim button on the detail page.
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
   * Build one favorite row (thumbnail, name link, meta, remove button).
   * @param {Object} business The favorited business.
   * @returns {string} The row HTML.
   */
  function buildFavoriteRow(business) {
    var average = window.AppData.getAverageRating(business);
    var thumb = business.image
      ? '<img class="favorite-row__thumb" data-photo src="' +
        escapeHtml(business.image) +
        '" alt="" loading="lazy" />'
      : '<div class="favorite-row__thumb favorite-row__thumb--fallback"><span aria-hidden="true">' +
        escapeHtml(business.icon || "🏪") +
        "</span></div>";
    return (
      '<div class="favorite-row">' +
      thumb +
      '<div class="favorite-row__body">' +
      '<a class="favorite-row__name" href="#/business/' +
      encodeURIComponent(business.id) +
      '">' +
      escapeHtml(business.name) +
      "</a>" +
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
  }

  /**
   * Build a recommendation: a "Because you like…" caption above the full
   * business card (name, rating, description, deal, View details).
   * @param {Object} business The recommended business.
   * @param {number} index The card's position (used to stagger the animation).
   * @param {Object<string, boolean>} favoriteCategories Categories the user favorites.
   * @returns {string} The recommendation HTML.
   */
  function buildRecommendationCard(business, index, favoriteCategories) {
    var why = favoriteCategories[business.category]
      ? "Because you like " + business.category
      : "Highly rated near you";
    return (
      '<div class="rec-item">' +
      '<span class="rec-item__why"><span aria-hidden="true">✨</span> ' +
      escapeHtml(why) +
      "</span>" +
      buildCard(business, index, false) +
      "</div>"
    );
  }

  /**
   * Build the "Recommended for you" block, or a prompt to favorite more.
   * @param {Array<Object>} favorites The user's favorites.
   * @param {Array<Object>} recommendations The suggested businesses.
   * @returns {string} The recommendations section HTML.
   */
  function buildRecommendationsSection(favorites, recommendations) {
    if (!favorites || favorites.length < 2) {
      return (
        '<section class="recommendations">' +
        '<h2 class="recommendations__title">Recommended for you</h2>' +
        '<p class="recommendations__empty">Favorite at least 2 businesses and we’ll ' +
        "suggest more spots you’ll love here.</p>" +
        "</section>"
      );
    }
    var favoriteCategories = {};
    favorites.forEach(function (favorite) {
      favoriteCategories[favorite.category] = true;
    });
    var cards = recommendations
      .map(function (business, index) {
        return buildRecommendationCard(business, index, favoriteCategories);
      })
      .join("");
    return (
      '<section class="recommendations">' +
      '<h2 class="recommendations__title">Recommended for you</h2>' +
      '<p class="recommendations__sub">Picked from the businesses you’ve favorited.</p>' +
      '<div class="rec-grid">' +
      cards +
      "</div>" +
      "</section>"
    );
  }

  /**
   * Render the favorites page (saved businesses plus recommendations).
   * @param {Array<Object>} favorites The bookmarked businesses.
   * @param {Array<Object>} recommendations Suggested businesses (may be empty).
   * @returns {void}
   */
  function renderFavoritesPage(favorites, recommendations) {
    var listHtml;
    if (!favorites || favorites.length === 0) {
      listHtml =
        '<p class="favorites-empty">You have no favorites yet. Tap the ☆ on any ' +
        "business to save it here.</p>";
    } else {
      listHtml =
        '<div class="favorites-list">' +
        favorites
          .map(function (business) {
            return buildFavoriteRow(business);
          })
          .join("") +
        "</div>";
    }

    elements.favoritesPage.innerHTML =
      '<div class="favorites-header">' +
      '<div class="favorites-header__heading">' +
      '<h1 class="page-title">Your favorites</h1>' +
      '<p class="page-subtitle">Saved spots and tailored recommendations.</p>' +
      "</div>" +
      '<div class="favorites-header__actions">' +
      '<button class="button button--secondary button--small" type="button" data-action="print-report">Print</button>' +
      '<button class="button button--secondary button--small" type="button" data-action="export-report">Export</button>' +
      '<button class="button button--primary button--small" type="button" data-action="pdf-report"><span aria-hidden="true">📄</span><span>PDF Report</span></button>' +
      "</div>" +
      "</div>" +
      listHtml +
      buildRecommendationsSection(favorites, recommendations);

    bindImageFallbacks(elements.favoritesPage);
    showView("favorites");
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
  }

  /**
   * Handle a click on the category filter pills.
   * @param {Event} event The click event.
   * @returns {void}
   */
  function handleCategoryClick(event) {
    var pill = event.target.closest(".filter-pill");
    if (!pill) {
      return;
    }
    activeCategory = pill.getAttribute("data-category");
    elements.categoryFilters.querySelectorAll(".filter-pill").forEach(function (button) {
      var isActive = button === pill;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    emitQueryChange();
  }

  /**
   * Cache DOM references and bind all static event listeners.
   * @param {Object<string, Function>} providedHandlers Controller callbacks.
   * @returns {void}
   */
  function init(providedHandlers) {
    handlers = providedHandlers || {};

    elements = {
      viewHome: document.getElementById("view-home"),
      viewBusiness: document.getElementById("view-business"),
      viewFavorites: document.getElementById("view-favorites"),
      searchInput: document.getElementById("search-input"),
      searchForm: document.getElementById("search-form"),
      categoryFilters: document.getElementById("category-filters"),
      ratingSelect: document.getElementById("rating-select"),
      sortSelect: document.getElementById("sort-select"),
      resultsSummary: document.getElementById("results-summary"),
      businessGrid: document.getElementById("business-grid"),
      emptyState: document.getElementById("empty-state"),
      businessPage: document.getElementById("business-page"),
      favoritesPage: document.getElementById("favorites-page"),
      favoritesButton: document.getElementById("favorites-button"),
      favoritesCount: document.getElementById("favorites-count"),
      pdfReportButton: document.getElementById("pdf-report-button"),
      helpButton: document.getElementById("help-button"),
      helpModal: document.getElementById("help-modal"),
      signInButton: document.getElementById("sign-in-button"),
      signOutButton: document.getElementById("sign-out-button"),
      userChip: document.getElementById("user-chip"),
      userName: document.getElementById("user-name"),
      userAvatar: document.getElementById("user-avatar"),
      toast: document.getElementById("toast"),
    };

    // Real-time search (updates as the user types).
    elements.searchInput.addEventListener("input", emitQueryChange);
    // The hero search form has no button; just keep Enter from reloading.
    elements.searchForm.addEventListener("submit", function (event) {
      event.preventDefault();
      emitQueryChange();
    });
    elements.ratingSelect.addEventListener("change", emitQueryChange);
    elements.sortSelect.addEventListener("change", emitQueryChange);

    // Category pill filters (delegated).
    elements.categoryFilters.addEventListener("click", handleCategoryClick);

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

    // Favorites nav button navigates to the favorites page.
    elements.favoritesButton.addEventListener("click", function () {
      window.location.hash = "#/favorites";
    });

    // PDF Report nav button generates the printable report.
    elements.pdfReportButton.addEventListener("click", function () {
      if (handlers.onPdfReport) {
        handlers.onPdfReport();
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
      if (action === "open") {
        window.location.hash = "#/business/" + encodeURIComponent(businessId);
      } else if (action === "bookmark" && handlers.onToggleBookmark) {
        handlers.onToggleBookmark(businessId);
      }
    });

    // Delegated clicks on the detail page (toggle bookmark).
    elements.businessPage.addEventListener("click", function (event) {
      var trigger = event.target.closest('[data-action="bookmark"]');
      if (trigger && handlers.onToggleBookmark) {
        handlers.onToggleBookmark(trigger.getAttribute("data-business-id"));
      }
    });

    // Delegated clicks on the favorites page (remove favorite, report actions).
    elements.favoritesPage.addEventListener("click", function (event) {
      var trigger = event.target.closest("[data-action]");
      if (!trigger) {
        return;
      }
      var action = trigger.getAttribute("data-action");
      if (action === "open") {
        window.location.hash = "#/business/" + encodeURIComponent(trigger.getAttribute("data-business-id"));
      } else if (action === "bookmark" && handlers.onToggleBookmark) {
        handlers.onToggleBookmark(trigger.getAttribute("data-business-id"));
      } else if (action === "remove-favorite" && handlers.onRemoveFavorite) {
        handlers.onRemoveFavorite(trigger.getAttribute("data-business-id"));
      } else if (action === "export-report" && handlers.onExportFavorites) {
        handlers.onExportFavorites();
      } else if (action === "print-report" && handlers.onPrintFavorites) {
        handlers.onPrintFavorites();
      } else if (action === "pdf-report" && handlers.onPdfReport) {
        handlers.onPdfReport();
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
    setBookmarkState: setBookmarkState,
    showView: showView,
    renderBusinessPage: renderBusinessPage,
    renderBusinessReviews: renderBusinessReviews,
    revealDealCode: revealDealCode,
    renderFavoritesPage: renderFavoritesPage,
    updateFavoritesCount: updateFavoritesCount,
    updateAuthState: updateAuthState,
    showToast: showToast,
    closeModals: closeModals,
  };
})();
