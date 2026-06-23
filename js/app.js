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
   * Escape text for safe inclusion in generated report/PDF HTML, including
   * attribute values.
   * @param {string} value Raw text.
   * @returns {string} HTML-escaped text.
   */
  function escapeForReport(value) {
    var text = value == null ? "" : String(value);
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
      '<g fill="none" stroke="#2f4d6e" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' +
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
    return (
      '<section class="section">' +
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
   * Build the shared stylesheet used by both the interactive report page and the
   * exported PDF, so the two always look identical.
   * @param {string} backgroundUrl Absolute URL of the watercolor letterhead image.
   * @returns {string} A complete <style> element.
   */
  function reportStyles(backgroundUrl) {
    return (
      "<style>" +
      [
        "*{box-sizing:border-box;}",
        "@page{size:letter;margin:0;}",
        "html,body{margin:0;padding:0;}",
        "body{font-family:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;",
        "color:#2c3e50;background:#dfeaf4;-webkit-print-color-adjust:exact;print-color-adjust:exact;",
        "display:flex;justify-content:center;padding:28px 16px;}",
        ".sheet{position:relative;width:816px;max-width:100%;background:#eaf2fa url('" + backgroundUrl + "') center / cover no-repeat;",
        "box-shadow:0 24px 60px rgba(40,70,110,0.22);overflow:hidden;}",
        ".sheet__inner{padding:52px 56px 40px;}",
        ".masthead{display:flex;align-items:center;gap:14px;margin:0 0 22px;}",
        ".brandmark{display:inline-flex;align-items:center;gap:13px;background:rgba(255,255,255,0.62);",
        "border:1px solid rgba(255,255,255,0.8);padding:10px 18px 10px 14px;border-radius:18px;",
        "box-shadow:0 8px 22px rgba(40,70,110,0.10);}",
        ".brandmark__icon{width:42px;height:40px;flex:none;}",
        ".brandmark__word{font-size:26px;font-weight:800;letter-spacing:-0.01em;line-height:1;color:#2f4d6e;}",
        ".brandmark__word i{font-style:italic;color:#79a6cf;}",
        ".report-title{font-size:46px;font-weight:800;letter-spacing:-0.015em;color:#26384a;margin:6px 0 24px;}",
        ".section{margin:0 0 30px;}",
        ".section-head{display:flex;align-items:center;gap:12px;margin:0 0 16px;}",
        ".section-head__icon{display:inline-grid;place-items:center;width:38px;height:38px;flex:none;",
        "font-size:19px;border-radius:11px;background:linear-gradient(140deg,#e3f0fb,#cfe2f4);",
        "box-shadow:0 4px 12px rgba(40,70,110,0.12);}",
        ".section-head__title{font-size:21px;font-weight:800;color:#2f4d6e;margin:0;letter-spacing:-0.01em;}",
        ".section-head__rule{flex:1;height:2px;border-radius:2px;",
        "background:linear-gradient(90deg,rgba(122,166,207,0.55),rgba(122,166,207,0));}",
        ".pgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:20px;}",
        ".prec{display:flex;flex-direction:column;gap:8px;}",
        ".prec__why{display:inline-flex;align-items:center;gap:5px;align-self:flex-start;",
        "font-size:11px;font-weight:700;color:#5a76b8;background:#eef2fd;border-radius:20px;padding:5px 12px;}",
        ".pcard{display:flex;flex-direction:column;background:#fff;border-radius:14px;overflow:hidden;",
        "box-shadow:0 10px 26px rgba(40,70,110,0.13);border:1px solid #eaf1f8;}",
        ".pcard__media{position:relative;height:138px;background:linear-gradient(135deg,#81a2ff,#e9edf9);}",
        ".pcard__media img{width:100%;height:100%;object-fit:cover;display:block;}",
        ".pcard__media--fallback{display:grid;place-items:center;}",
        ".pcard__emoji{font-size:3rem;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.15));}",
        ".pcard__body{display:flex;flex-direction:column;flex:1;padding:13px 16px 16px;}",
        ".pcard__name{font-size:17px;font-weight:800;color:#2c3e50;margin:0;}",
        ".pcard__meta{margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}",
        ".pbadge{display:inline-flex;align-items:center;padding:4px 11px;border-radius:20px;",
        "background:#d1d9f7;color:#46506e;font-size:11px;font-weight:700;}",
        ".pprice{color:#9aa6b4;font-size:12.5px;font-weight:700;}",
        ".pcard__rating{display:flex;align-items:center;gap:8px;margin-top:11px;font-size:12.5px;color:#5a6b7d;font-weight:700;}",
        ".pstars{position:relative;display:inline-block;font-size:15px;line-height:1;letter-spacing:1px;font-family:sans-serif;}",
        ".pstars__track{color:#dcdce4;}",
        ".pstars__fill{position:absolute;top:0;left:0;overflow:hidden;white-space:nowrap;color:#ffb400;}",
        ".pcard__desc{margin:11px 0 0;font-size:13px;line-height:1.5;color:#5f6c79;",
        "display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}",
        ".pcard__deal{margin-top:auto;padding-top:13px;display:flex;align-items:center;gap:8px;font-size:12.5px;color:#5d7187;}",
        ".pcard__deal .ticket{font-size:14px;}",
        ".pcard__code{font-family:'SFMono-Regular',ui-monospace,Menlo,Consolas,monospace;font-weight:800;",
        "letter-spacing:0.04em;color:#2f6f4f;background:#e4f5ec;border:1px dashed #9bd3b4;border-radius:7px;padding:3px 9px;font-size:12px;}",
        ".report-empty{font-size:13.5px;color:#5d7187;background:rgba(255,255,255,0.86);border-radius:12px;padding:14px 16px;}",
        ".panel{background:#fff;border-radius:14px;padding:18px 20px;border:1px solid #eaf1f8;box-shadow:0 10px 26px rgba(40,70,110,0.13);}",
        ".bar-row{display:grid;grid-template-columns:160px 1fr 46px;align-items:center;gap:14px;margin:11px 0;}",
        ".bar-label{font-size:12.5px;font-weight:700;color:#2c3e50;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
        ".bar-track{height:20px;background:#e7eef6;border-radius:10px;overflow:hidden;}",
        ".bar-fill{height:100%;min-width:3px;border-radius:10px;background:linear-gradient(90deg,#9cc1e2,#3a5d80);}",
        ".bar-val{font-size:12.5px;font-weight:800;color:#33597d;text-align:right;}",
        ".panel__cap{font-size:11px;color:#7c8ea0;margin-top:12px;}",
        ".legend{display:flex;flex-wrap:wrap;gap:16px;justify-content:center;margin:0 0 6px;}",
        ".legend__item{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#2c3e50;}",
        ".legend__swatch{width:16px;height:10px;border-radius:3px;display:inline-block;}",
        ".cmp-empty{font-size:13px;color:#7c8ea0;text-align:center;padding:28px 0;}",
        ".reminder{display:flex;gap:13px;align-items:flex-start;background:rgba(255,255,255,0.88);",
        "border:1px solid #d8e6f4;border-left:4px solid #4a86c5;border-radius:14px;padding:15px 18px;margin:0 0 26px;",
        "box-shadow:0 8px 22px rgba(40,70,110,0.10);font-size:13.5px;line-height:1.55;color:#41566a;}",
        ".reminder__icon{font-size:18px;line-height:1.4;flex:none;}",
        ".reminder strong{color:#2f4d6e;}",
        ".reminder b{color:#33597d;}",
        ".cmp-intro{font-size:13.5px;color:#4f6072;margin:0 0 14px;}",
        ".cmp-controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 14px;}",
        ".cmp-controls label{font-size:13px;font-weight:700;color:#33597d;}",
        ".cmp-controls select{font:inherit;font-size:13px;padding:9px 12px;border:1.5px solid #bcd0e6;",
        "border-radius:10px;background:#fff;color:#2c3e50;min-width:220px;}",
        "#cmp-add{font:inherit;font-size:13px;font-weight:700;color:#fff;cursor:pointer;background:#4a86c5;",
        "border:none;border-radius:10px;padding:10px 16px;}",
        "#cmp-add:hover{background:#3a73b0;}",
        ".cmp-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px;}",
        ".cmp-chip{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:700;background:#fff;",
        "border:2px solid #ccc;border-radius:22px;padding:6px 12px;}",
        ".cmp-chip button{font:inherit;font-size:15px;line-height:1;color:inherit;cursor:pointer;background:none;border:none;padding:0;}",
        "footer{margin-top:28px;padding-top:16px;border-top:1px solid #e2e9f1;color:#7c8ea0;font-size:11.5px;",
        "display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;}",
        ".fab{position:fixed;top:22px;right:26px;font:inherit;font-size:14px;font-weight:800;color:#fff;cursor:pointer;",
        "background:linear-gradient(90deg,#4a86c5,#33597d);border:none;border-radius:26px;padding:13px 22px;",
        "box-shadow:0 12px 26px rgba(40,70,110,0.32);z-index:50;}",
        ".fab:hover{filter:brightness(1.05);}",
        "@media print{.no-print{display:none !important;}body{padding:0;background:#fff;}",
        ".sheet{box-shadow:none;width:auto;max-width:none;}}",
      ].join("") +
      "</style>"
    );
  }

  /**
   * Build the self-contained script that runs inside the report page: it powers
   * the Compare Businesses tool (dropdown, chips, and a date-based line chart)
   * and the "Download PDF Report" button, which assembles the print-ready PDF
   * page in a new tab. Reads its data from window.__REPORT__.
   * @returns {string} The report page's inline script body.
   */
  function buildReportScript() {
    // The body below is shipped as source text into the report window, where it
    // powers the Compare Businesses tool and the Download PDF Report button.
    return `
(function () {
  var reportData = window.__REPORT__ || {};
  var trends = reportData.trends || {};
  var businessOptions = reportData.options || [];
  var pdfBundle = reportData.pdf || {};
  var LINE_COLORS = ['#1ec8e0', '#ec4899', '#7c5cff', '#f5a623', '#34d399', '#ef4444', '#3a5d80', '#b07cff'];
  var MILLISECONDS_PER_DAY = 86400000;

  /** Escape text for safe inclusion in generated HTML (text or attribute). */
  function escapeText(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Whether a business has at least one rating-trend point to plot. */
  function hasTrendPoints(businessId) {
    return trends[businessId] && trends[businessId].points && trends[businessId].points.length;
  }

  /** Stable line color for the nth plotted business. */
  function colorForIndex(index) {
    return LINE_COLORS[index % LINE_COLORS.length];
  }

  /** Format a timestamp as a short "M/D" axis label. */
  function formatDate(timestamp) {
    var date = new Date(timestamp);
    return (date.getMonth() + 1) + '/' + date.getDate();
  }

  // Businesses currently plotted on the comparison chart (favorites to start).
  var activeBusinessIds = (reportData.selected || []).filter(hasTrendPoints);

  /**
   * Build the date-based rating-trend line chart (inline SVG) and its legend
   * for the currently active businesses.
   * @returns {{svg: string, legend: string}} The chart SVG and legend markup.
   */
  function buildLineChart() {
    var plottedIds = activeBusinessIds.filter(hasTrendPoints);
    var width = 696, height = 320;
    var leftPad = 46, rightPad = 16, topPad = 16, bottomPad = 46;
    var plotWidth = width - leftPad - rightPad;
    var plotHeight = height - topPad - bottomPad;

    var minTime = Infinity, maxTime = -Infinity;
    plottedIds.forEach(function (businessId) {
      trends[businessId].points.forEach(function (point) {
        if (point.time < minTime) { minTime = point.time; }
        if (point.time > maxTime) { maxTime = point.time; }
      });
    });
    if (!isFinite(minTime)) { minTime = Date.now() - MILLISECONDS_PER_DAY; maxTime = Date.now(); }
    if (minTime === maxTime) { minTime -= MILLISECONDS_PER_DAY; maxTime += MILLISECONDS_PER_DAY; }

    /** Map a timestamp to an x pixel within the plot area. */
    function xForTime(time) {
      return leftPad + plotWidth * ((time - minTime) / (maxTime - minTime));
    }
    /** Map a 0-5 rating to a y pixel within the plot area. */
    function yForRating(rating) {
      return topPad + plotHeight * (1 - rating / 5);
    }

    var svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" width="100%" preserveAspectRatio="xMidYMid meet">';
    for (var rating = 0; rating <= 5; rating++) {
      var gridY = yForRating(rating);
      svg += '<line x1="' + leftPad + '" y1="' + gridY + '" x2="' + (width - rightPad) + '" y2="' + gridY + '" stroke="#e3ebf3"/>';
      svg += '<text x="' + (leftPad - 8) + '" y="' + (gridY + 4) + '" text-anchor="end" font-size="11" fill="#7c8ea0">' + rating + '</text>';
    }
    var tickCount = 4;
    for (var tick = 0; tick <= tickCount; tick++) {
      var tickTime = minTime + (maxTime - minTime) * tick / tickCount;
      var tickX = xForTime(tickTime);
      svg += '<line x1="' + tickX + '" y1="' + topPad + '" x2="' + tickX + '" y2="' + (topPad + plotHeight) + '" stroke="#f0f4f9"/>';
      svg += '<text x="' + tickX + '" y="' + (height - bottomPad + 18) + '" text-anchor="middle" font-size="11" fill="#7c8ea0">' + formatDate(tickTime) + '</text>';
    }
    svg += '<text x="' + (leftPad + plotWidth / 2) + '" y="' + (height - 4) + '" text-anchor="middle" font-size="12" fill="#33597d" font-weight="700">Review Date</text>';
    svg += '<text transform="rotate(-90 14 ' + (topPad + plotHeight / 2) + ')" x="14" y="' + (topPad + plotHeight / 2) + '" text-anchor="middle" font-size="12" fill="#33597d" font-weight="700">Average Rating</text>';

    plottedIds.forEach(function (businessId, index) {
      var trend = trends[businessId];
      var color = colorForIndex(index);
      var linePoints = trend.points.map(function (point) {
        return xForTime(point.time) + ',' + yForRating(point.average);
      }).join(' ');
      svg += '<polyline fill="none" stroke="' + color + '" stroke-width="3" points="' + linePoints + '"/>';
      trend.points.forEach(function (point) {
        svg += '<circle cx="' + xForTime(point.time) + '" cy="' + yForRating(point.average) + '" r="4" fill="' + color + '"/>';
      });
    });
    svg += '</svg>';

    var legend = plottedIds.map(function (businessId, index) {
      return '<span class="legend__item"><span class="legend__swatch" style="background:' +
        colorForIndex(index) + '"></span>' + escapeText(trends[businessId].name) + '</span>';
    }).join('');

    return {
      svg: plottedIds.length ? svg : '<p class="cmp-empty">Add a business above to plot its rating trend.</p>',
      legend: plottedIds.length ? legend : ''
    };
  }

  // Populate the "Add business" dropdown with every business.
  var businessSelect = document.getElementById('cmp-select');
  businessOptions.forEach(function (option) {
    var optionElement = document.createElement('option');
    optionElement.value = option.id;
    optionElement.textContent = option.name;
    businessSelect.appendChild(optionElement);
  });
  document.getElementById('cmp-add').addEventListener('click', function () {
    var businessId = businessSelect.value;
    if (businessId && activeBusinessIds.indexOf(businessId) === -1 && hasTrendPoints(businessId)) {
      activeBusinessIds.push(businessId);
      renderComparison();
    }
  });

  /** Render a removable chip for each plotted business. */
  function renderChips() {
    var chipBox = document.getElementById('cmp-chips');
    chipBox.innerHTML = '';
    activeBusinessIds.forEach(function (businessId, index) {
      var trend = trends[businessId];
      if (!trend) { return; }
      var chip = document.createElement('span');
      chip.className = 'cmp-chip';
      chip.style.borderColor = colorForIndex(index);
      chip.style.color = colorForIndex(index);
      var nameLabel = document.createElement('span');
      nameLabel.textContent = trend.name;
      nameLabel.style.color = '#2c3e50';
      var removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.textContent = '×';
      removeButton.setAttribute('aria-label', 'Remove ' + trend.name);
      removeButton.addEventListener('click', function () {
        activeBusinessIds.splice(activeBusinessIds.indexOf(businessId), 1);
        renderComparison();
      });
      chip.appendChild(nameLabel);
      chip.appendChild(removeButton);
      chipBox.appendChild(chip);
    });
  }

  /** Redraw the chips, legend, and chart for the current selection. */
  function renderComparison() {
    renderChips();
    var chart = buildLineChart();
    document.getElementById('cmp-legend').innerHTML = chart.legend;
    document.getElementById('cmp-chart').innerHTML = chart.svg;
  }
  renderComparison();

  /** Assemble the print-ready PDF page and open it in a new browser tab. */
  function downloadPdf() {
    var chart = buildLineChart();
    var trendsSection =
      '<section class="section"><div class="section-head">' +
      '<span class="section-head__icon" aria-hidden="true">📈</span>' +
      '<h2 class="section-head__title">Rating Trends Over Time</h2>' +
      '<span class="section-head__rule"></span></div>' +
      '<div class="panel"><div class="legend">' + chart.legend + '</div>' + chart.svg + '</div></section>';
    var pdfDocument =
      '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>My Report — Local Lift</title>' + pdfBundle.styles + '</head><body>' +
      '<button class="fab no-print" type="button" onclick="window.print()">🖨️ Print / Save as PDF</button>' +
      '<div class="sheet"><div class="sheet__inner">' + pdfBundle.masthead +
      '<h1 class="report-title">My Report</h1>' +
      pdfBundle.favoritesSection + pdfBundle.recommendSection + pdfBundle.compareBarSection +
      trendsSection + pdfBundle.footer + '</div></div></body></html>';
    var pdfWindow = window.open('', '_blank');
    if (!pdfWindow) {
      alert('Please allow pop-ups to download your PDF report.');
      return;
    }
    pdfWindow.document.open();
    pdfWindow.document.write(pdfDocument);
    pdfWindow.document.close();
    pdfWindow.focus();
  }
  document.getElementById('download-pdf').addEventListener('click', downloadPdf);
})();
`;
  }

  /**
   * Build the interactive "My Report" page: the masthead, a reminder of what is
   * auto-included in the PDF, and the Compare Businesses tool. The page also
   * carries the data and pre-rendered sections the "Download PDF Report" button
   * needs to assemble the print-ready PDF.
   * @param {Array<Object>} favorites The user's favorite businesses.
   * @param {Array<Object>} recommendations The recommended businesses.
   * @param {Object} trends Per-business rating trends keyed by business id.
   * @returns {string} A complete HTML document as a string.
   */
  function buildReportPageHtml(favorites, recommendations, trends) {
    var backgroundUrl = window.location.origin + "/assets/report-bg.png";
    var styles = reportStyles(backgroundUrl);
    var masthead = buildReportMasthead();
    var footer =
      "<footer><span>Generated by <strong>Local Lift</strong></span>" +
      "<span>FBLA Coding &amp; Programming · 2025–2026</span></footer>";

    // Pre-render the PDF-only sections now and bundle them with the page so the
    // download button can build the PDF instantly, without re-reading data.
    var pdfBundle = {
      styles: styles,
      masthead: masthead,
      favoritesSection: buildReportFavoritesSection(favorites),
      recommendSection: buildReportRecommendationsSection(favorites, recommendations),
      compareBarSection: buildReportCompareBarSection(favorites),
      footer: footer,
    };

    var businessOptions = window.AppData.getAllBusinesses().map(function (business) {
      return { id: business.id, name: business.name };
    });
    var selectedIds = favorites.map(function (business) {
      return business.id;
    });

    // Escape "<" so the embedded JSON can never break out of the <script> tag.
    var reportDataJson = JSON.stringify({
      trends: trends || {},
      options: businessOptions,
      selected: selectedIds,
      pdf: pdfBundle,
    }).replace(/</g, "\\u003c");

    return (
      "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'>" +
      "<meta name='viewport' content='width=device-width, initial-scale=1'>" +
      "<title>My Report — Local Lift</title>" +
      styles +
      "</head><body>" +
      "<button class='fab no-print' type='button' id='download-pdf'>📄 Download PDF Report</button>" +
      "<div class='sheet'><div class='sheet__inner'>" +
      masthead +
      "<h1 class='report-title'>My Report</h1>" +
      "<div class='reminder'><span class='reminder__icon' aria-hidden='true'>✅</span>" +
      "<div>Your <b>Favorited Businesses</b>, <b>Recommended for You</b> picks, and the " +
      "<b>Compare Your Favorites</b> chart are added to your PDF report automatically. " +
      "Use the tool below to add a rating-trends comparison, then press " +
      "<strong>Download PDF Report</strong>.</div></div>" +
      "<section class='section'>" +
      buildReportSectionHead("📈", "Compare Businesses") +
      "<p class='cmp-intro'>Add businesses to compare how their average rating has " +
      "changed over time. Your favorites are plotted to start.</p>" +
      "<div class='cmp-controls'>" +
      "<label for='cmp-select'>Add business:</label>" +
      "<select id='cmp-select'></select>" +
      "<button type='button' id='cmp-add'>Add to Chart</button>" +
      "</div>" +
      "<div id='cmp-chips' class='cmp-chips'></div>" +
      "<div class='panel'><div id='cmp-legend' class='legend'></div><div id='cmp-chart'></div></div>" +
      "</section>" +
      "</div></div>" +
      "<script>window.__REPORT__=" + reportDataJson + ";</scr" + "ipt>" +
      "<script>" + buildReportScript() + "</scr" + "ipt>" +
      "</body></html>"
    );
  }

  /**
   * Open the interactive "My Report" page in a new tab. The page lets the user
   * build a rating-trends comparison and then download the print-ready PDF.
   * @returns {void}
   */
  function openReportWindow() {
    var favorites = getFavoriteBusinesses();
    if (favorites.length === 0) {
      window.AppUI.showToast("Add some favorites first.", "error");
      return;
    }
    var reportWindow = window.open("", "_blank");
    if (!reportWindow) {
      window.AppUI.showToast("Allow pop-ups to open your report.", "error");
      return;
    }
    reportWindow.document.write(
      "<!DOCTYPE html><body style='font-family:Arial;padding:48px;color:#33597d'>" +
      "Opening your report…</body>"
    );
    reportWindow.document.close();

    var recommendations = window.AppData.recommendBusinesses(favorites, 4);
    window.AppStorage.getAllReviews()
      .catch(function () {
        return [];
      })
      .then(function (allReviews) {
        var trends = buildRatingTrends(allReviews);
        var html = buildReportPageHtml(favorites, recommendations, trends);
        reportWindow.document.open();
        reportWindow.document.write(html);
        reportWindow.document.close();
        reportWindow.focus();
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
   * Open the interactive report (with the compare dropdown and rating-trend
   * chart). The user clicks "Download PDF Report" inside to save as PDF.
   * @returns {void}
   */
  function handlePdfReport() {
    openReportWindow();
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
