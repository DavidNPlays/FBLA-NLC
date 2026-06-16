/*
  data.js — Business catalog: loading, searching, filtering, and sorting.
  Responsibility: own the in-memory list of businesses (loaded from
  data/businesses.json), expose query helpers, and compute average ratings by
  combining each business's seed rating with live review aggregates supplied by
  the controller. This file never reads or writes Firestore (that is storage.js).
*/

(function defineDataModule() {
  "use strict";

  /**
   * Internal list of all businesses, populated by loadBusinesses().
   * @type {Array<Object>}
   */
  var allBusinesses = [];

  /**
   * Live review aggregates keyed by business id, e.g. { sum: 18, count: 4 }.
   * Supplied by the controller after reading reviews from Firestore so that
   * average ratings reflect user-submitted reviews on top of seed data.
   * @type {Object<string, {sum: number, count: number}>}
   */
  var reviewStatsById = {};

  /**
   * Load the business catalog from data/businesses.json.
   * @returns {Promise<Array<Object>>} Resolves with the list of businesses.
   */
  function loadBusinesses() {
    return fetch("data/businesses.json")
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Failed to load businesses.json (" + response.status + ")");
        }
        return response.json();
      })
      .then(function (catalogJson) {
        allBusinesses = Array.isArray(catalogJson.businesses) ? catalogJson.businesses : [];
        return allBusinesses;
      });
  }

  /**
   * Get every business in the catalog.
   * @returns {Array<Object>} A shallow copy of all businesses.
   */
  function getAllBusinesses() {
    return allBusinesses.slice();
  }

  /**
   * Find a single business by its unique id.
   * @param {string} businessId The id to look up.
   * @returns {Object|null} The matching business, or null if not found.
   */
  function getBusinessById(businessId) {
    for (var index = 0; index < allBusinesses.length; index++) {
      if (allBusinesses[index].id === businessId) {
        return allBusinesses[index];
      }
    }
    return null;
  }

  /**
   * Get the unique list of categories present in the catalog, sorted A–Z.
   * @returns {Array<string>} Sorted, de-duplicated category names.
   */
  function getCategories() {
    var seen = {};
    var categories = [];
    allBusinesses.forEach(function (business) {
      if (!seen[business.category]) {
        seen[business.category] = true;
        categories.push(business.category);
      }
    });
    categories.sort();
    return categories;
  }

  /**
   * Replace the live review aggregate for a single business.
   * @param {string} businessId The business the stats belong to.
   * @param {{sum: number, count: number}} stats The summed rating and count.
   * @returns {void}
   */
  function setReviewStats(businessId, stats) {
    reviewStatsById[businessId] = stats;
  }

  /**
   * Total rating sum and count for a business, combining its seed rating with
   * any live review aggregate.
   * @param {Object} business The business to total.
   * @returns {{sum: number, count: number}} Combined sum and count.
   */
  function getCombinedRating(business) {
    var seed = business.seedRating || { sum: 0, count: 0 };
    var live = reviewStatsById[business.id] || { sum: 0, count: 0 };
    return {
      sum: seed.sum + live.sum,
      count: seed.count + live.count,
    };
  }

  /**
   * Average star rating for a business (0 when it has no ratings yet).
   * @param {Object} business The business to evaluate.
   * @returns {number} Average rating from 0 to 5.
   */
  function getAverageRating(business) {
    var combined = getCombinedRating(business);
    if (combined.count === 0) {
      return 0;
    }
    return combined.sum / combined.count;
  }

  /**
   * Number of ratings counted for a business (seed + live reviews).
   * @param {Object} business The business to evaluate.
   * @returns {number} Total number of ratings.
   */
  function getRatingCount(business) {
    return getCombinedRating(business).count;
  }

  /**
   * Test whether a business matches a free-text search term.
   * @param {Object} business The business to test.
   * @param {string} term Lower-cased search term.
   * @returns {boolean} True if the business matches the term.
   */
  function matchesSearch(business, term) {
    if (!term) {
      return true;
    }
    var haystack = [
      business.name,
      business.category,
      business.description,
      business.address,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.indexOf(term) !== -1;
  }

  /**
   * Filter and sort the catalog according to the current UI controls.
   * @param {{searchTerm?: string, category?: string, sortBy?: string}} options
   *   searchTerm: free text; category: "all" or a category name;
   *   sortBy: "featured" | "rating" | "name".
   * @returns {Array<Object>} The filtered and sorted list of businesses.
   */
  function query(options) {
    var settings = options || {};
    var term = (settings.searchTerm || "").trim().toLowerCase();
    var category = settings.category || "all";
    var sortBy = settings.sortBy || "featured";

    var results = allBusinesses.filter(function (business) {
      var categoryMatch = category === "all" || business.category === category;
      return categoryMatch && matchesSearch(business, term);
    });

    if (sortBy === "rating") {
      results.sort(function (first, second) {
        return getAverageRating(second) - getAverageRating(first);
      });
    } else if (sortBy === "name") {
      results.sort(function (first, second) {
        return first.name.localeCompare(second.name);
      });
    }

    return results;
  }

  /**
   * Public data module surface.
   * @namespace AppData
   */
  window.AppData = {
    loadBusinesses: loadBusinesses,
    getAllBusinesses: getAllBusinesses,
    getBusinessById: getBusinessById,
    getCategories: getCategories,
    setReviewStats: setReviewStats,
    getAverageRating: getAverageRating,
    getRatingCount: getRatingCount,
    query: query,
  };
})();
