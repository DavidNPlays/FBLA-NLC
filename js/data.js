/*
  data.js — Business catalog: loading, searching, filtering, and sorting.
  Responsibility: own the in-memory list of businesses (loaded from
  data/businesses.json), generate each business's preloaded sample reviews,
  expose query helpers, compute average ratings (preloaded + live reviews), and
  recommend businesses from a user's favorites. This file never reads or writes
  Firestore (that is storage.js).
*/

(function defineDataModule() {
  "use strict";

  /**
   * Names of the three preloaded reviewers seeded onto every business. Their
   * randomized ratings (kept between 3 and 5) replace any hard-coded rating.
   * @type {Array<string>}
   */
  var SEED_REVIEWERS = ["David", "Hari", "Akhil"];

  /**
   * Review text used for each seeded review, chosen by its star rating so the
   * wording matches how positive the rating is.
   * @type {Object<number, string>}
   */
  var SEED_REVIEW_TEXT = {
    3: "Solid local spot. A couple of small things could be better, but I'd still recommend giving it a try.",
    4: "Really good experience — friendly service and dependable quality. I'll definitely be back.",
    5: "Outstanding from start to finish. Easily one of my favorite local spots in Lake Forest.",
  };

  /**
   * How many days ago each seeded reviewer left their review, so the preloaded
   * dates look natural and varied.
   * @type {Array<number>}
   */
  var SEED_REVIEW_DAY_OFFSETS = [6, 13, 25];

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
   * Build three preloaded reviews (one each from David, Hari, and Akhil) for a
   * business, with a randomized star rating between 3 and 5 for each reviewer.
   * @param {Object} business The business to seed reviews for.
   * @returns {Array<Object>} Three review records ({userName, rating, text, createdAt, isSeed}).
   */
  function buildSeedReviews(business) {
    return SEED_REVIEWERS.map(function (reviewerName, index) {
      var rating = 3 + Math.floor(Math.random() * 3);
      var created = new Date();
      created.setDate(created.getDate() - SEED_REVIEW_DAY_OFFSETS[index]);
      return {
        userName: reviewerName,
        rating: rating,
        text: SEED_REVIEW_TEXT[rating],
        createdAt: created,
        isSeed: true,
      };
    });
  }

  /**
   * Load the business catalog from data/businesses.json and attach the
   * preloaded sample reviews used for each business's starting rating.
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
        allBusinesses.forEach(function (business) {
          business.seedReviews = buildSeedReviews(business);
        });
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
   * Get the preloaded sample reviews seeded onto a business.
   * @param {Object} business The business to read seed reviews from.
   * @returns {Array<Object>} The seeded reviews (empty if none).
   */
  function getSeedReviews(business) {
    return (business && business.seedReviews) ? business.seedReviews.slice() : [];
  }

  /**
   * Sum and count of a business's preloaded seed reviews.
   * @param {Object} business The business to total.
   * @returns {{sum: number, count: number}} Seed rating sum and count.
   */
  function getSeedRating(business) {
    var sum = 0;
    getSeedReviews(business).forEach(function (review) {
      sum += review.rating;
    });
    return { sum: sum, count: getSeedReviews(business).length };
  }

  /**
   * Total rating sum and count for a business, combining its preloaded seed
   * reviews with any live review aggregate from Firestore.
   * @param {Object} business The business to total.
   * @returns {{sum: number, count: number}} Combined sum and count.
   */
  function getCombinedRating(business) {
    var seed = getSeedRating(business);
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
   * @param {{searchTerm?: string, category?: string, sortBy?: string, minRating?: number}} options
   *   searchTerm: free text; category: "all" or a category name;
   *   sortBy: "featured" | "rating" | "name"; minRating: minimum average stars
   *   a business must have to appear (0 means no minimum).
   * @returns {Array<Object>} The filtered and sorted list of businesses.
   */
  function query(options) {
    var settings = options || {};
    var term = (settings.searchTerm || "").trim().toLowerCase();
    var category = settings.category || "all";
    var sortBy = settings.sortBy || "featured";
    var minRating = settings.minRating || 0;

    var results = allBusinesses.filter(function (business) {
      var categoryMatch = category === "all" || business.category === category;
      var ratingMatch = minRating === 0 || getAverageRating(business) >= minRating;
      return categoryMatch && ratingMatch && matchesSearch(business, term);
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
   * Recommend businesses for a user based on the categories of their favorites.
   * Non-favorited businesses are ranked by how many favorites share their
   * category, then by average rating. Returns an empty list until the user has
   * favorited at least two businesses.
   * @param {Array<Object>} favorites The user's favorite businesses.
   * @param {number} [limit] Maximum number of recommendations (default 3).
   * @returns {Array<Object>} The recommended businesses, best match first.
   */
  function recommendBusinesses(favorites, limit) {
    var maximum = limit || 3;
    if (!favorites || favorites.length < 2) {
      return [];
    }

    var favoriteIds = {};
    var categoryWeight = {};
    favorites.forEach(function (favorite) {
      favoriteIds[favorite.id] = true;
      categoryWeight[favorite.category] = (categoryWeight[favorite.category] || 0) + 1;
    });

    return allBusinesses
      .filter(function (business) {
        return !favoriteIds[business.id];
      })
      .map(function (business) {
        return {
          business: business,
          score: categoryWeight[business.category] || 0,
          rating: getAverageRating(business),
        };
      })
      .sort(function (first, second) {
        if (second.score !== first.score) {
          return second.score - first.score;
        }
        return second.rating - first.rating;
      })
      .slice(0, maximum)
      .map(function (entry) {
        return entry.business;
      });
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
    getSeedReviews: getSeedReviews,
    getAverageRating: getAverageRating,
    getRatingCount: getRatingCount,
    query: query,
    recommendBusinesses: recommendBusinesses,
  };
})();
