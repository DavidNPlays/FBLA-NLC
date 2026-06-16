/*
  auth.js — Google Sign-In and authentication state.
  Responsibility: the ONLY module that calls Firebase Auth. It signs users in
  with their Google account (which carries Google's own 2-step verification),
  signs them out, exposes the current user, and notifies subscribers when the
  auth state changes. All write-gating elsewhere relies on getCurrentUser().
*/

(function defineAuthModule() {
  "use strict";

  /** Convenience handle to the shared Firebase Auth instance (may be null). */
  var auth = window.AppFirebase ? window.AppFirebase.auth : null;

  /** The currently signed-in Firebase user, or null when signed out. */
  var currentUser = null;

  /**
   * Sign in using a Google account via a popup. Google enforces the user's own
   * 2-step verification during this flow.
   * @returns {Promise<Object>} Resolves with the signed-in user.
   */
  function signInWithGoogle() {
    if (!auth) {
      return Promise.reject(new Error("Firebase is not configured yet."));
    }
    var provider = new firebase.auth.GoogleAuthProvider();
    return auth.signInWithPopup(provider).then(function (result) {
      return result.user;
    });
  }

  /**
   * Sign the current user out.
   * @returns {Promise<void>} Resolves once sign-out completes.
   */
  function signOutUser() {
    if (!auth) {
      return Promise.resolve();
    }
    return auth.signOut();
  }

  /**
   * Subscribe to authentication state changes.
   * @param {function(Object|null):void} callback Called with the user or null.
   * @returns {void}
   */
  function onAuthChange(callback) {
    if (!auth) {
      // No Firebase configured: report a signed-out state once.
      callback(null);
      return;
    }
    auth.onAuthStateChanged(function (user) {
      currentUser = user;
      callback(user);
    });
  }

  /**
   * Get the currently signed-in user.
   * @returns {Object|null} The Firebase user, or null when signed out.
   */
  function getCurrentUser() {
    return currentUser;
  }

  /**
   * Public auth module surface.
   * @namespace AppAuth
   */
  window.AppAuth = {
    signInWithGoogle: signInWithGoogle,
    signOutUser: signOutUser,
    onAuthChange: onAuthChange,
    getCurrentUser: getCurrentUser,
  };
})();
