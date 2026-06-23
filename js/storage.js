/*
  storage.js — All Firestore reads and writes.
  Responsibility: the ONLY module that reads from or writes to Firestore. It
  stores and retrieves reviews, bookmarks, and deal claims. Every write first
  confirms a user is signed in (defense-in-depth alongside the security rules in
  firestore.rules). Reads resolve to empty values when Firebase is unconfigured
  so the catalog still works in browse-only mode.

  Collections:
    reviews    — { businessId, userId, userName, rating, text, createdAt }
    bookmarks  — doc id "{userId}_{businessId}": { userId, businessId, createdAt }
    dealClaims — doc id "{userId}_{businessId}": { userId, businessId, code, claimedAt }
*/

(function defineStorageModule() {
  "use strict";

  /** Shared Firestore instance (null until Firebase is configured). */
  var db = window.AppFirebase ? window.AppFirebase.db : null;

  /**
   * Get the signed-in user, or throw if none — used to gate writes.
   * @returns {Object} The current Firebase user.
   * @throws {Error} If no user is signed in.
   */
  function requireUser() {
    var user = window.AppAuth ? window.AppAuth.getCurrentUser() : null;
    if (!user) {
      throw new Error("You must be signed in to do that.");
    }
    return user;
  }

  /**
   * Build the deterministic document id for a per-user, per-business record.
   * @param {string} userId The user's uid.
   * @param {string} businessId The business id.
   * @returns {string} The composite document id.
   */
  function userBusinessDocId(userId, businessId) {
    return userId + "_" + businessId;
  }

  /**
   * Convert a Firestore timestamp to a JavaScript Date (or null).
   * @param {Object} timestamp A Firestore Timestamp, or null.
   * @returns {Date|null} The equivalent Date, or null.
   */
  function toDate(timestamp) {
    return timestamp && typeof timestamp.toDate === "function" ? timestamp.toDate() : null;
  }

  /**
   * Add a review for a business. Requires the user to be signed in.
   * @param {string} businessId The business being reviewed.
   * @param {number} rating Star rating from 1 to 5.
   * @param {string} text The review text.
   * @returns {Promise<Object>} Resolves with the new review's Firestore document reference.
   */
  function addReview(businessId, rating, text) {
    var user;
    try {
      user = requireUser();
    } catch (error) {
      return Promise.reject(error);
    }
    return db.collection("reviews").add({
      businessId: businessId,
      userId: user.uid,
      userName: user.displayName || "Anonymous",
      rating: rating,
      text: text,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  /**
   * Get all reviews for a single business, newest first.
   * @param {string} businessId The business to fetch reviews for.
   * @returns {Promise<Array<Object>>} Reviews with createdAt as Date.
   */
  function getReviewsForBusiness(businessId) {
    if (!db) {
      return Promise.resolve([]);
    }
    return db
      .collection("reviews")
      .where("businessId", "==", businessId)
      .get()
      .then(function (snapshot) {
        var reviews = snapshot.docs.map(function (doc) {
          var reviewData = doc.data();
          return {
            userName: reviewData.userName,
            rating: reviewData.rating,
            text: reviewData.text,
            createdAt: toDate(reviewData.createdAt),
          };
        });
        // Sort newest first in memory (avoids needing a composite index).
        reviews.sort(function (first, second) {
          var firstTime = first.createdAt ? first.createdAt.getTime() : 0;
          var secondTime = second.createdAt ? second.createdAt.getTime() : 0;
          return secondTime - firstTime;
        });
        return reviews;
      });
  }

  /**
   * Get every review across all businesses, used to chart each business's
   * cumulative rating trend in the report. Public read is allowed on reviews.
   * @returns {Promise<Array<Object>>} Reviews as {businessId, rating, createdAt}.
   */
  function getAllReviews() {
    if (!db) {
      return Promise.resolve([]);
    }
    return db
      .collection("reviews")
      .get()
      .then(function (snapshot) {
        return snapshot.docs.map(function (doc) {
          var reviewData = doc.data();
          return {
            businessId: reviewData.businessId,
            rating: reviewData.rating,
            createdAt: toDate(reviewData.createdAt),
          };
        });
      });
  }

  /**
   * Aggregate every review into per-business rating totals.
   * @returns {Promise<Object<string, {sum: number, count: number}>>} Stats by id.
   */
  function getReviewStats() {
    if (!db) {
      return Promise.resolve({});
    }
    return db
      .collection("reviews")
      .get()
      .then(function (snapshot) {
        var stats = {};
        snapshot.forEach(function (doc) {
          var reviewData = doc.data();
          if (!stats[reviewData.businessId]) {
            stats[reviewData.businessId] = { sum: 0, count: 0 };
          }
          stats[reviewData.businessId].sum += reviewData.rating;
          stats[reviewData.businessId].count += 1;
        });
        return stats;
      });
  }

  /**
   * Add a bookmark for the signed-in user.
   * @param {string} businessId The business to bookmark.
   * @returns {Promise<void>} Resolves once the bookmark is written.
   */
  function addBookmark(businessId) {
    var user;
    try {
      user = requireUser();
    } catch (error) {
      return Promise.reject(error);
    }
    return db
      .collection("bookmarks")
      .doc(userBusinessDocId(user.uid, businessId))
      .set({
        userId: user.uid,
        businessId: businessId,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
  }

  /**
   * Remove a bookmark for the signed-in user.
   * @param {string} businessId The business to un-bookmark.
   * @returns {Promise<void>} Resolves once the bookmark is removed.
   */
  function removeBookmark(businessId) {
    var user;
    try {
      user = requireUser();
    } catch (error) {
      return Promise.reject(error);
    }
    return db
      .collection("bookmarks")
      .doc(userBusinessDocId(user.uid, businessId))
      .delete();
  }

  /**
   * Get the ids of all businesses the signed-in user has bookmarked.
   * @returns {Promise<Array<string>>} Bookmarked business ids (empty if signed out).
   */
  function getBookmarkIds() {
    var user = window.AppAuth ? window.AppAuth.getCurrentUser() : null;
    if (!db || !user) {
      return Promise.resolve([]);
    }
    return db
      .collection("bookmarks")
      .where("userId", "==", user.uid)
      .get()
      .then(function (snapshot) {
        return snapshot.docs.map(function (doc) {
          return doc.data().businessId;
        });
      });
  }

  /**
   * Record that the signed-in user claimed a business's deal.
   * @param {string} businessId The business whose deal is claimed.
   * @param {string} code The deal code being claimed.
   * @returns {Promise<void>} Resolves once the claim is written.
   */
  function claimDeal(businessId, code) {
    var user;
    try {
      user = requireUser();
    } catch (error) {
      return Promise.reject(error);
    }
    return db
      .collection("dealClaims")
      .doc(userBusinessDocId(user.uid, businessId))
      .set({
        userId: user.uid,
        businessId: businessId,
        code: code,
        claimedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
  }

  /**
   * Get the ids of all businesses whose deals the signed-in user has claimed.
   * @returns {Promise<Array<string>>} Claimed business ids (empty if signed out).
   */
  function getClaimedDealIds() {
    var user = window.AppAuth ? window.AppAuth.getCurrentUser() : null;
    if (!db || !user) {
      return Promise.resolve([]);
    }
    return db
      .collection("dealClaims")
      .where("userId", "==", user.uid)
      .get()
      .then(function (snapshot) {
        return snapshot.docs.map(function (doc) {
          return doc.data().businessId;
        });
      });
  }

  /**
   * Save a 1–5 star rating of the chatbot assistant. Requires the user to be
   * signed in; the record is stamped with their uid so the security rules can
   * verify ownership.
   * @param {number} rating The chosen rating from 1 to 5.
   * @returns {Promise<Object>} Resolves with the new rating's document reference.
   */
  function addChatRating(rating) {
    if (!db) {
      return Promise.resolve(null);
    }
    var user;
    try {
      user = requireUser();
    } catch (error) {
      return Promise.reject(error);
    }
    return db.collection("chatRatings").add({
      userId: user.uid,
      userName: user.displayName || "Anonymous",
      rating: rating,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  /**
   * Public storage module surface.
   * @namespace AppStorage
   */
  window.AppStorage = {
    addReview: addReview,
    getReviewsForBusiness: getReviewsForBusiness,
    getReviewStats: getReviewStats,
    getAllReviews: getAllReviews,
    addBookmark: addBookmark,
    removeBookmark: removeBookmark,
    getBookmarkIds: getBookmarkIds,
    claimDeal: claimDeal,
    getClaimedDealIds: getClaimedDealIds,
    addChatRating: addChatRating,
  };
})();
