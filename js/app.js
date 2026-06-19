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

  /* ===================== Report (export / print / PDF) ===================== */

  /**
   * Escape text for safe inclusion in the generated report HTML.
   * @param {string} value Raw text.
   * @returns {string} HTML-escaped text.
   */
  function escapeForReport(value) {
    var text = value == null ? "" : String(value);
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /**
   * Format a business's average rating for the report.
   * @param {Object} business The business to rate.
   * @returns {string} e.g. "4.3 / 5" or "No ratings yet".
   */
  function reportRating(business) {
    var average = window.AppData.getAverageRating(business);
    return average > 0 ? average.toFixed(1) + " / 5" : "No ratings yet";
  }

  /**
   * Build a self-contained, print-ready HTML report of the user's favorites and
   * their personalized recommendations. Used by export, print, and PDF actions.
   * @param {Array<Object>} favorites The favorite businesses.
   * @param {Array<Object>} recommendations The recommended businesses.
   * @returns {string} A complete HTML document as a string.
   */
  function buildFavoritesReportHtml(favorites, recommendations) {
    var user = window.AppAuth.getCurrentUser();
    var owner = user && user.displayName ? user.displayName : "Guest";
    var generated = new Date().toLocaleString("en-US");

    var rows = favorites
      .map(function (business) {
        var deal = business.deal ? business.deal.title : "—";
        return (
          "<tr>" +
          "<td>" + escapeForReport(business.name) + "</td>" +
          "<td>" + escapeForReport(business.category) + "</td>" +
          "<td>" + escapeForReport(reportRating(business)) + "</td>" +
          "<td>" + escapeForReport(business.address) + "</td>" +
          "<td>" + escapeForReport(business.phone) + "</td>" +
          "<td>" + escapeForReport(deal) + "</td>" +
          "</tr>"
        );
      })
      .join("");

    var recommendationItems =
      recommendations.length > 0
        ? "<ol class='recs'>" +
          recommendations
            .map(function (business) {
              return (
                "<li><strong>" + escapeForReport(business.name) + "</strong> — " +
                escapeForReport(business.category) + " · " +
                escapeForReport(reportRating(business)) + "</li>"
              );
            })
            .join("") +
          "</ol>"
        : "<p class='recs-note'>Favorite at least two businesses to unlock recommendations.</p>";

    var backgroundUrl = window.location.origin + "/assets/report-bg.png";

    return (
      "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'>" +
      "<title>My Favorite Local Businesses — Lake Forest, IL</title>" +
      "<style>" +
      "*{box-sizing:border-box;}" +
      "@page{size:letter;margin:0;}" +
      "html,body{margin:0;padding:0;}" +
      "body{font-family:Arial,Helvetica,sans-serif;color:#2c3e50;" +
      "-webkit-print-color-adjust:exact;print-color-adjust:exact;}" +
      ".bg{position:fixed;inset:0;z-index:-1;background:url('" + backgroundUrl + "') no-repeat;" +
      "background-size:100% 100%;}" +
      ".mark{position:fixed;top:74px;left:142px;font-size:30px;font-weight:800;" +
      "letter-spacing:-0.01em;color:#3a5d80;}" +
      ".mark i{font-style:italic;color:#79a6cf;}" +
      ".sheet{padding:176px 60px 64px;}" +
      ".report-title{font-size:23px;font-weight:800;color:#2c3e50;margin:0 0 2px;}" +
      ".report-meta{font-size:13px;color:#5d7187;margin:0 0 18px;}" +
      "h2{font-size:16px;margin:26px 0 8px;color:#33597d;}" +
      "table{border-collapse:separate;border-spacing:0;width:100%;background:rgba(255,255,255,0.93);" +
      "border-radius:12px;overflow:hidden;box-shadow:0 10px 26px rgba(40,70,110,0.14);}" +
      "th,td{border-bottom:1px solid #e2e9f1;padding:10px 12px;text-align:left;font-size:13px;}" +
      "th{background:#dbe8f5;color:#2c4a66;}" +
      "tr:last-child td{border-bottom:none;}" +
      "ol.recs{margin:8px 0 0;font-size:14px;line-height:1.8;background:rgba(255,255,255,0.93);" +
      "border-radius:12px;padding:14px 16px 14px 36px;box-shadow:0 10px 26px rgba(40,70,110,0.14);}" +
      "p.recs-note{color:#5d7187;font-size:13px;background:rgba(255,255,255,0.85);" +
      "padding:12px 14px;border-radius:10px;}" +
      "footer{margin-top:26px;color:#6c8298;font-size:12px;}" +
      "</style></head><body>" +
      "<div class='bg'></div>" +
      "<div class='mark'><i>Local</i> Lift</div>" +
      "<div class='sheet'>" +
      "<div class='report-title'>My Favorite Local Businesses</div>" +
      "<div class='report-meta'>Lake Forest, Illinois · Prepared for " + escapeForReport(owner) +
      " · " + escapeForReport(generated) + "</div>" +
      "<table><thead><tr>" +
      "<th>Business</th><th>Category</th><th>Rating</th><th>Address</th>" +
      "<th>Phone</th><th>Deal</th>" +
      "</tr></thead><tbody>" +
      rows +
      "</tbody></table>" +
      "<h2>Recommended Businesses For You:</h2>" +
      recommendationItems +
      "<footer>Generated by Local Lift · FBLA Coding &amp; Programming 2025–2026</footer>" +
      "</div>" +
      "</body></html>"
    );
  }

  /**
   * Open the print dialog with the favorites report (the path to "Save as PDF").
   * @returns {void}
   */
  function printFavoritesReport() {
    var favorites = getFavoriteBusinesses();
    if (favorites.length === 0) {
      window.AppUI.showToast("Add some favorites first.", "error");
      return;
    }
    var recommendations = window.AppData.recommendBusinesses(favorites, 3);
    var printWindow = window.open("", "_blank");
    if (!printWindow) {
      window.AppUI.showToast("Allow pop-ups to generate the report.", "error");
      return;
    }
    printWindow.document.write(buildFavoritesReportHtml(favorites, recommendations));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
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
   * Export the favorites report as a downloadable HTML file.
   * @returns {void}
   */
  function handleExportFavorites() {
    var favorites = getFavoriteBusinesses();
    if (favorites.length === 0) {
      window.AppUI.showToast("Add some favorites first.", "error");
      return;
    }
    var recommendations = window.AppData.recommendBusinesses(favorites, 3);
    var html = buildFavoritesReportHtml(favorites, recommendations);
    var blob = new Blob([html], { type: "text/html" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "my-favorite-businesses.html";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    window.AppUI.showToast("Favorites exported.");
  }

  /**
   * Print the favorites report using the browser's print dialog.
   * @returns {void}
   */
  function handlePrintFavorites() {
    printFavoritesReport();
  }

  /**
   * Generate the PDF report (opens the print dialog, where the user can choose
   * "Save as PDF").
   * @returns {void}
   */
  function handlePdfReport() {
    printFavoritesReport();
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
      onExportFavorites: handleExportFavorites,
      onPrintFavorites: handlePrintFavorites,
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
