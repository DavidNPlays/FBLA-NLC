/*
  app.js — Main controller. Initializes the app and wires the modules together.
  Responsibility: hold UI state (current bookmarks, claimed deals), route between
  the home, business-detail, and favorites views from the URL hash, respond to
  user intent emitted by ui.js, and coordinate data.js (catalog), storage.js
  (Firestore), and auth.js (sign-in). This file contains no direct DOM,
  Firestore, or Firebase Auth calls — it delegates to the dedicated modules.
*/

(function defineAppController() {
  "use strict";

  /** Map of bookmarked business ids for the signed-in user, e.g. { id: true }. */
  var bookmarkedIds = {};

  /** Map of claimed-deal business ids for the signed-in user. */
  var claimedDealIds = {};

  /** The latest search/filter/sort values from the controls. */
  var currentQuery = { searchTerm: "", category: "all", sortBy: "featured", minRating: 0 };

  /**
   * Count the keys in a map object.
   * @param {Object} map The map to count.
   * @returns {number} Number of own keys.
   */
  function countKeys(map) {
    return Object.keys(map).length;
  }

  /**
   * Re-run the current query and render the business grid.
   * @returns {void}
   */
  function refreshResults() {
    var results = window.AppData.query(currentQuery);
    window.AppUI.renderBusinesses(results, bookmarkedIds);
  }

  /**
   * Refresh per-business review aggregates from Firestore so averages reflect
   * user-submitted reviews on top of the preloaded seed reviews.
   * @returns {Promise<void>} Resolves once aggregates are applied.
   */
  function refreshReviewStats() {
    return window.AppStorage.getReviewStats().then(function (stats) {
      window.AppData.getAllBusinesses().forEach(function (business) {
        window.AppData.setReviewStats(business.id, stats[business.id] || { sum: 0, count: 0 });
      });
    });
  }

  /**
   * Update the favorites count badge from the current bookmark state.
   * @returns {void}
   */
  function updateFavoritesCount() {
    window.AppUI.updateFavoritesCount(countKeys(bookmarkedIds));
  }

  /**
   * Build the list of bookmarked business objects.
   * @returns {Array<Object>} The user's favorite businesses.
   */
  function getFavoriteBusinesses() {
    return Object.keys(bookmarkedIds)
      .map(function (id) {
        return window.AppData.getBusinessById(id);
      })
      .filter(function (business) {
        return business !== null;
      });
  }

  /**
   * Merge a business's preloaded seed reviews with its live Firestore reviews,
   * newest first.
   * @param {Object} business The business being viewed.
   * @param {Array<Object>} liveReviews Reviews loaded from Firestore.
   * @returns {Array<Object>} The combined, date-sorted reviews.
   */
  function buildCombinedReviews(business, liveReviews) {
    var combined = (liveReviews || []).concat(window.AppData.getSeedReviews(business));
    combined.sort(function (first, second) {
      var firstTime = first.createdAt ? first.createdAt.getTime() : 0;
      var secondTime = second.createdAt ? second.createdAt.getTime() : 0;
      return secondTime - firstTime;
    });
    return combined;
  }

  /* ===================== Report (interactive page + PDF export) ===================== */

  /**
   * Escape text for safe inclusion in generated report HTML. Delegates to the
   * shared UI escaper so the escaping logic lives in one place.
   * @param {string} value Raw text.
   * @returns {string} HTML-escaped text.
   */
  function escapeForReport(value) {
    return window.AppUI.escapeHtml(value);
  }

  /**
   * Build each business's average-rating trend over time: every review (seed +
   * live) in chronological order, paired with the running average up to and
   * including that review. Powers the date-based "Compare Businesses" line
   * chart, where x is the review date and y is the running average rating.
   * @param {Array<Object>} liveReviews All live reviews ({businessId, rating, createdAt}).
   * @returns {Object<string, {name: string, points: Array<{time: number, average: number}>}>}
   *   A trend record per business id.
   */
  function buildRatingTrends(liveReviews) {
    var liveReviewsByBusiness = {};
    (liveReviews || []).forEach(function (review) {
      if (!liveReviewsByBusiness[review.businessId]) {
        liveReviewsByBusiness[review.businessId] = [];
      }
      liveReviewsByBusiness[review.businessId].push(review);
    });

    var trends = {};
    window.AppData.getAllBusinesses().forEach(function (business) {
      var combined = window.AppData
        .getSeedReviews(business)
        .concat(liveReviewsByBusiness[business.id] || []);
      // Oldest review first so the running average builds up left to right.
      combined.sort(function (first, second) {
        var firstTime = first.createdAt ? first.createdAt.getTime() : 0;
        var secondTime = second.createdAt ? second.createdAt.getTime() : 0;
        return firstTime - secondTime;
      });
      var runningSum = 0;
      var points = combined.map(function (review, index) {
        runningSum += review.rating;
        var time = review.createdAt ? review.createdAt.getTime() : Date.now();
        return { time: time, average: runningSum / (index + 1) };
      });
      trends[business.id] = { name: business.name, points: points };
    });
    return trends;
  }

  /**
   * Build a 5-star rating display (with partial fill) for a report card.
   * @param {number} rating Average rating from 0 to 5.
   * @returns {string} The star markup.
   */
  function buildReportStars(rating) {
    var percent = Math.max(0, Math.min(100, (rating / 5) * 100));
    return (
      '<span class="pstars" aria-hidden="true">' +
      '<span class="pstars__track">★★★★★</span>' +
      '<span class="pstars__fill" style="width:' + percent + '%">★★★★★</span>' +
      "</span>"
    );
  }

  /**
   * Build the Local Lift masthead (vector building logo + wordmark) shown at the
   * top of both the report page and the exported PDF, so the two always match.
   * @returns {string} The masthead HTML.
   */
  function buildReportMasthead() {
    return (
      '<div class="masthead"><span class="brandmark">' +
      '<svg class="brandmark__icon" viewBox="0 0 64 58" role="img" aria-label="Local Lift logo">' +
      '<g fill="none" stroke="#333333" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="4" y1="53" x2="60" y2="53"></line>' +
      '<path d="M10 53 V12 q0-3 3-3 h8 q3 0 3 3 V53"></path>' +
      '<line x1="13.5" y1="17" x2="20.5" y2="17" stroke-width="1.9"></line>' +
      '<line x1="13.5" y1="24" x2="20.5" y2="24" stroke-width="1.9"></line>' +
      '<line x1="13.5" y1="31" x2="20.5" y2="31" stroke-width="1.9"></line>' +
      '<path d="M24 53 V24 h26 q3 0 3 3 V53"></path>' +
      '<line x1="30" y1="32" x2="48" y2="32" stroke-width="1.7"></line>' +
      '<line x1="30" y1="40" x2="48" y2="40" stroke-width="1.7"></line>' +
      '<line x1="36" y1="29" x2="36" y2="48" stroke-width="1.7"></line>' +
      '<line x1="42" y1="29" x2="42" y2="48" stroke-width="1.7"></line>' +
      '<path d="M14.5 53 V46 h6 V53"></path>' +
      "</g></svg>" +
      '<span class="brandmark__word"><i>Local</i> Lift</span>' +
      "</span></div>"
    );
  }

  /**
   * Build a section heading (icon chip + title + divider rule) for the report.
   * @param {string} icon An emoji icon for the section.
   * @param {string} title The section title.
   * @returns {string} The heading HTML.
   */
  function buildReportSectionHead(icon, title) {
    return (
      '<div class="section-head">' +
      '<span class="section-head__icon" aria-hidden="true">' + icon + "</span>" +
      '<h2 class="section-head__title">' + escapeForReport(title) + "</h2>" +
      '<span class="section-head__rule"></span>' +
      "</div>"
    );
  }

  /**
   * Build a business card for the report/PDF. Mirrors the main-page card but
   * drops the bookmark heart and "View details" button, and shows the deal's
   * redeemable code beneath the business description.
   * @param {Object} business The business to render.
   * @returns {string} The card HTML.
   */
  function buildReportCard(business) {
    var average = window.AppData.getAverageRating(business);
    var count = window.AppData.getRatingCount(business);
    var ratingLabel =
      count > 0 ? average.toFixed(1) + " (" + count + ")" : "No ratings yet";

    var media = business.image
      ? '<div class="pcard__media"><img src="' + escapeForReport(business.image) +
        '" alt="' + escapeForReport(business.name) + '"></div>'
      : '<div class="pcard__media pcard__media--fallback"><span class="pcard__emoji">' +
        escapeForReport(business.icon || "🏪") + "</span></div>";

    var deal =
      business.deal && business.deal.code
        ? '<div class="pcard__deal"><span class="ticket" aria-hidden="true">🎟️</span> Deal code: ' +
          '<span class="pcard__code">' + escapeForReport(business.deal.code) + "</span></div>"
        : "";

    return (
      '<article class="pcard">' +
      media +
      '<div class="pcard__body">' +
      '<h3 class="pcard__name">' + escapeForReport(business.name) + "</h3>" +
      '<div class="pcard__meta"><span class="pbadge">' + escapeForReport(business.category) +
      '</span><span class="pprice">' + escapeForReport(business.priceLevel || "") + "</span></div>" +
      '<div class="pcard__rating">' + buildReportStars(average) +
      "<span>" + escapeForReport(ratingLabel) + "</span></div>" +
      '<p class="pcard__desc">' + escapeForReport(business.description) + "</p>" +
      deal +
      "</div></article>"
    );
  }

  /**
   * Build a recommendation entry: a "why" caption above a full business card.
   * @param {Object} business The recommended business.
   * @param {string} whyLabel The reason caption (e.g. "Because you like Cafe").
   * @returns {string} The recommendation HTML.
   */
  function buildReportRecommendation(business, whyLabel) {
    return (
      '<div class="prec">' +
      '<span class="prec__why"><span aria-hidden="true">✨</span> ' +
      escapeForReport(whyLabel) + "</span>" +
      buildReportCard(business) +
      "</div>"
    );
  }

  /**
   * Build the "Favorited Businesses" section: a grid of report cards.
   * @param {Array<Object>} favorites The user's favorite businesses.
   * @returns {string} The section HTML.
   */
  function buildReportFavoritesSection(favorites) {
    var cards = favorites
      .map(function (business) {
        return buildReportCard(business);
      })
      .join("");
    return (
      '<section class="section">' +
      buildReportSectionHead("📌", "Favorited Businesses") +
      '<div class="pgrid">' + cards + "</div>" +
      "</section>"
    );
  }

  /**
   * Build the "Recommended for You" section: a grid of recommendation cards, or
   * a prompt to favorite more businesses when there are none.
   * @param {Array<Object>} favorites The user's favorites (for "why" captions).
   * @param {Array<Object>} recommendations The recommended businesses.
   * @returns {string} The section HTML.
   */
  function buildReportRecommendationsSection(favorites, recommendations) {
    var inner;
    if (!recommendations || recommendations.length === 0) {
      inner =
        '<p class="report-empty">Favorite at least two businesses to unlock ' +
        "personalized recommendations.</p>";
    } else {
      var favoriteCategories = {};
      favorites.forEach(function (favorite) {
        favoriteCategories[favorite.category] = true;
      });
      var cards = recommendations
        .map(function (business) {
          var why = favoriteCategories[business.category]
            ? "Because you like " + business.category
            : "Highly rated near you";
          return buildReportRecommendation(business, why);
        })
        .join("");
      inner = '<div class="pgrid">' + cards + "</div>";
    }
    // With more than 6 favorites the favorites grid is long enough that the
    // recommendations should start on their own printed page; at 6 or fewer
    // both sections flow together so the page fills without a gap.
    var breakClass = favorites.length > 6 ? " section--page-break" : "";
    return (
      '<section class="section' + breakClass + '">' +
      buildReportSectionHead("✨", "Recommended for You") +
      inner +
      "</section>"
    );
  }

  /**
   * Build the "Compare Your Favorites" section: a horizontal bar chart of each
   * favorite's current average rating, scaled to five stars.
   * @param {Array<Object>} favorites The user's favorite businesses.
   * @returns {string} The section HTML.
   */
  function buildReportCompareBarSection(favorites) {
    var rows = favorites
      .map(function (business) {
        var average = window.AppData.getAverageRating(business);
        var percent = Math.max(0, Math.min(100, (average / 5) * 100));
        var value = average > 0 ? average.toFixed(1) : "—";
        return (
          '<div class="bar-row">' +
          '<div class="bar-label">' + escapeForReport(business.name) + "</div>" +
          '<div class="bar-track"><div class="bar-fill" style="width:' +
          percent.toFixed(1) + '%"></div></div>' +
          '<div class="bar-val">' + escapeForReport(value) + "</div>" +
          "</div>"
        );
      })
      .join("");
    return (
      '<section class="section">' +
      buildReportSectionHead("📊", "Compare Your Favorites") +
      '<div class="panel">' + rows +
      '<div class="panel__cap">Average rating — bars are scaled to 5 stars.</div>' +
      "</div></section>"
    );
  }

  /**
   * Build the inner HTML of the My Report view: the masthead, a "Download PDF
   * Report" button, a reminder of what the printout contains, the favorited and
   * recommended businesses, the Compare-Your-Favorites bar chart, and the
   * interactive rating-trends section (its controls are screen-only; the chart
   * itself prints). The chart is populated by ui.js once reviews load.
   * @param {Array<Object>} favorites The user's favorite businesses.
   * @param {Array<Object>} recommendations The recommended businesses.
   * @returns {string} The report view's inner HTML.
   */
  function buildReportInnerHtml(favorites, recommendations) {
    return (
      '<div class="report-sheet"><div class="report-sheet__inner">' +
      buildReportMasthead() +
      '<div class="report-topbar">' +
      '<h1 class="report-title">My Report</h1>' +
      '<button type="button" id="report-download" class="report-download no-print">' +
      '<span aria-hidden="true">📄</span> Download PDF Report</button>' +
      "</div>" +
      '<div class="report-reminder no-print">' +
      '<span class="report-reminder__icon" aria-hidden="true">✅</span>' +
      "<div>This report includes your <b>Favorited Businesses</b>, <b>Recommended for You</b> " +
      "picks, the <b>Compare Your Favorites</b> chart, and the rating-trend comparison below. " +
      "Press <strong>Download PDF Report</strong> to save or print it as a PDF.</div></div>" +
      buildReportFavoritesSection(favorites) +
      buildReportRecommendationsSection(favorites, recommendations) +
      buildReportCompareBarSection(favorites) +
      '<section class="section">' +
      buildReportSectionHead("📈", "Rating Trends Over Time") +
      '<p class="cmp-intro no-print">Add businesses to compare how their average rating has ' +
      "changed over time. Your favorites are plotted to start.</p>" +
      '<div class="cmp-controls no-print">' +
      '<label for="cmp-select">Add business:</label>' +
      '<select id="cmp-select"></select>' +
      '<button type="button" id="cmp-add" class="cmp-add">Add to Chart</button>' +
      "</div>" +
      '<div id="cmp-chips" class="cmp-chips no-print"></div>' +
      '<div class="panel"><div id="cmp-legend" class="legend"></div>' +
      '<div id="cmp-chart"><p class="cmp-empty">Loading rating trends…</p></div></div>' +
      "</section>" +
      '<footer class="report-footer"><span>Generated by <strong>Local Lift</strong></span>' +
      "<span>FBLA Coding &amp; Programming · 2025–2026</span></footer>" +
      "</div></div>"
    );
  }

  /**
   * Open the My Report view (route "#/report"). Renders the report immediately,
   * then loads every review to populate the interactive rating-trends chart.
   * @returns {void}
   */
  function openReportPage() {
    var favorites = getFavoriteBusinesses();
    if (favorites.length === 0) {
      window.AppUI.showToast("Add some favorites to build your report.", "error");
      window.location.hash = "#/favorites";
      return;
    }
    var recommendations = window.AppData.recommendBusinesses(favorites, 4);
    window.AppUI.renderReportPage(buildReportInnerHtml(favorites, recommendations));

    window.AppStorage.getAllReviews()
      .catch(function () {
        return [];
      })
      .then(function (allReviews) {
        var trends = buildRatingTrends(allReviews);
        var options = window.AppData.getAllBusinesses().map(function (business) {
          return { id: business.id, name: business.name };
        });
        var selected = favorites.map(function (business) {
          return business.id;
        });
        window.AppUI.initReportTrends({
          trends: trends,
          options: options,
          selected: selected,
        });
      });
  }

  /* ===================== Routing ===================== */

  /**
   * Render the detail page for a business, loading its reviews first.
   * @param {string} businessId The business to show.
   * @returns {void}
   */
  function openBusinessPage(businessId) {
    var business = window.AppData.getBusinessById(businessId);
    if (!business) {
      window.location.hash = "#/";
      return;
    }

    /**
     * Render the page with whatever reviews were available.
     * @param {Array<Object>} liveReviews Reviews loaded from Firestore.
     * @returns {void}
     */
    function show(liveReviews) {
      window.AppUI.renderBusinessPage(business, {
        reviews: buildCombinedReviews(business, liveReviews),
        isSignedIn: !!window.AppAuth.getCurrentUser(),
        isDealClaimed: !!claimedDealIds[business.id],
        isBookmarked: !!bookmarkedIds[business.id],
      });
    }

    window.AppStorage.getReviewsForBusiness(businessId)
      .then(show)
      .catch(function () {
        show([]);
      });
  }

  /**
   * Render the favorites page with the user's saved businesses and suggestions.
   * @returns {void}
   */
  function openFavoritesPage() {
    var favorites = getFavoriteBusinesses();
    var recommendations = window.AppData.recommendBusinesses(favorites, 3);
    window.AppUI.renderFavoritesPage(favorites, recommendations);
  }

  /**
   * Render the view that matches the current URL hash.
   * @returns {void}
   */
  function handleRoute() {
    var hash = window.location.hash || "#/";
    if (hash.indexOf("#/business/") === 0) {
      openBusinessPage(decodeURIComponent(hash.slice("#/business/".length)));
    } else if (hash === "#/favorites") {
      openFavoritesPage();
    } else if (hash === "#/report") {
      openReportPage();
    } else {
      window.AppUI.showView("home");
      refreshResults();
    }
  }

  /* ===================== Intent handlers (called by ui.js) ===================== */

  /**
   * Handle a change to the search/filter/sort controls.
   * @param {{searchTerm: string, category: string, sortBy: string, minRating: number}} values New values.
   * @returns {void}
   */
  function handleQueryChange(values) {
    currentQuery = values;
    refreshResults();
  }

  /**
   * Toggle a bookmark for the signed-in user.
   * @param {string} businessId The business to bookmark/un-bookmark.
   * @returns {void}
   */
  function handleToggleBookmark(businessId) {
    if (!window.AppAuth.getCurrentUser()) {
      window.AppUI.showToast("Sign in to save favorites.", "error");
      return;
    }
    var wasBookmarked = !!bookmarkedIds[businessId];
    var operation = wasBookmarked
      ? window.AppStorage.removeBookmark(businessId)
      : window.AppStorage.addBookmark(businessId);

    operation
      .then(function () {
        if (wasBookmarked) {
          delete bookmarkedIds[businessId];
        } else {
          bookmarkedIds[businessId] = true;
        }
        window.AppUI.setBookmarkState(businessId, !wasBookmarked);
        updateFavoritesCount();
        if (window.location.hash === "#/favorites") {
          openFavoritesPage();
        }
        window.AppUI.showToast(
          wasBookmarked ? "Removed from favorites." : "Saved to favorites."
        );
      })
      .catch(function (error) {
        window.AppUI.showToast(error.message, "error");
      });
  }

  /**
   * Claim a business's deal for the signed-in user, then reveal the code.
   * @param {Object} business The business whose deal is being claimed.
   * @returns {void}
   */
  function handleClaimDeal(business) {
    if (!window.AppAuth.getCurrentUser()) {
      window.AppUI.showToast("Sign in to claim deals.", "error");
      return;
    }
    window.AppStorage.claimDeal(business.id, business.deal.code)
      .then(function () {
        claimedDealIds[business.id] = true;
        window.AppUI.revealDealCode();
        window.AppUI.showToast("Deal claimed! Show the code in-store.");
      })
      .catch(function (error) {
        window.AppUI.showToast(error.message, "error");
      });
  }

  /**
   * Submit a new review, then refresh the detail-page reviews and grid ratings.
   * @param {Object} business The business being reviewed.
   * @param {number} rating Star rating from 1 to 5.
   * @param {string} text The review text.
   * @returns {void}
   */
  function handleSubmitReview(business, rating, text) {
    if (!window.AppAuth.getCurrentUser()) {
      window.AppUI.showToast("Sign in to leave a review.", "error");
      return;
    }
    window.AppStorage.addReview(business.id, rating, text)
      .then(function () {
        return window.AppStorage.getReviewsForBusiness(business.id);
      })
      .then(function (liveReviews) {
        window.AppUI.renderBusinessReviews(buildCombinedReviews(business, liveReviews));
        return refreshReviewStats();
      })
      .then(function () {
        refreshResults();
        window.AppUI.showToast("Review posted. Thanks!");
      })
      .catch(function (error) {
        window.AppUI.showToast(error.message, "error");
      });
  }

  /**
   * Start the Google sign-in flow.
   * @returns {void}
   */
  function handleSignIn() {
    if (!window.AppFirebase.isConfigured) {
      window.AppUI.showToast("Firebase is not connected yet. See setup steps.", "error");
      return;
    }
    window.AppAuth.signInWithGoogle().catch(function (error) {
      window.AppUI.showToast(error.message || "Sign-in failed.", "error");
    });
  }

  /**
   * Sign the current user out, then reload the page so all signed-in state
   * (favorites/bookmarks, claimed deals, the review form) is cleared cleanly.
   * @returns {void}
   */
  function handleSignOut() {
    window.AppAuth.signOutUser().then(function () {
      window.location.hash = "#/";
      window.location.reload();
    });
  }

  /**
   * Remove a favorite from the favorites page.
   * @param {string} businessId The business to remove.
   * @returns {void}
   */
  function handleRemoveFavorite(businessId) {
    if (!window.AppAuth.getCurrentUser()) {
      window.AppUI.showToast("Sign in to manage favorites.", "error");
      return;
    }
    window.AppStorage.removeBookmark(businessId)
      .then(function () {
        delete bookmarkedIds[businessId];
        updateFavoritesCount();
        window.AppUI.setBookmarkState(businessId, false);
        openFavoritesPage();
        refreshResults();
      })
      .catch(function (error) {
        window.AppUI.showToast(error.message, "error");
      });
  }

  /**
   * Navigate to the My Report view (route "#/report").
   * @returns {void}
   */
  function handlePdfReport() {
    window.location.hash = "#/report";
  }

  /**
   * React to auth state changes: update the header and reload user data, then
   * re-render whichever view is active so it reflects the new sign-in state.
   * @param {Object|null} user The signed-in user, or null.
   * @returns {void}
   */
  function handleAuthChange(user) {
    window.AppUI.updateAuthState(user);
    Promise.all([
      window.AppStorage.getBookmarkIds(),
      window.AppStorage.getClaimedDealIds(),
    ]).then(function (results) {
      var bookmarkIdList = results[0];
      var claimedDealIdList = results[1];
      bookmarkedIds = {};
      bookmarkIdList.forEach(function (id) {
        bookmarkedIds[id] = true;
      });
      claimedDealIds = {};
      claimedDealIdList.forEach(function (id) {
        claimedDealIds[id] = true;
      });
      updateFavoritesCount();
      handleRoute();
    });
  }

  /**
   * Initialize the application: wire UI handlers, load data, and start routing.
   * @returns {void}
   */
  function startApp() {
    window.AppUI.init({
      onQueryChange: handleQueryChange,
      onToggleBookmark: handleToggleBookmark,
      onClaimDeal: handleClaimDeal,
      onSubmitReview: handleSubmitReview,
      onSignIn: handleSignIn,
      onSignOut: handleSignOut,
      onRemoveFavorite: handleRemoveFavorite,
      onPdfReport: handlePdfReport,
    });

    // Build the guided chatbot assistant (independent of catalog data).
    if (window.AppChatbot) {
      window.AppChatbot.init();
    }

    window.AppData.loadBusinesses()
      .then(function () {
        window.AppUI.populateCategories(window.AppData.getCategories());
        return refreshReviewStats();
      })
      .then(function () {
        // Render the current route, then react to hash changes and auth changes.
        window.addEventListener("hashchange", handleRoute);
        handleRoute();
        window.AppAuth.onAuthChange(handleAuthChange);
      })
      .catch(function () {
        window.AppUI.showToast(
          "Could not load businesses. If opened from a file, run via the hosted URL.",
          "error"
        );
      });
  }

  // Scripts load at the end of <body>, but guard against early execution anyway.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startApp);
  } else {
    startApp();
  }
})();
