/*
  firebase.js — Firebase initialization and configuration.
  Responsibility: hold the Firebase project config, initialize the Firebase app,
  and expose ready-to-use Auth and Firestore handles through a single global,
  window.AppFirebase. No other file should call firebase.initializeApp().

  SETUP: replace the placeholder values in `firebaseConfig` below with the config
  from your Firebase project (Project settings → Your apps → SDK setup). Until
  then, the app runs in browse-only mode (search/filter/sort work; sign-in,
  reviews, bookmarks, and deal claims are disabled).
*/

(function initializeFirebase() {
  "use strict";

  /**
   * Firebase project configuration. Replace every "REPLACE_WITH_*" placeholder
   * with the matching value from your Firebase console.
   * @type {{apiKey: string, authDomain: string, projectId: string,
   *   storageBucket: string, messagingSenderId: string, appId: string}}
   */
  var firebaseConfig = {
    apiKey: "REPLACE_WITH_API_KEY",
    authDomain: "REPLACE_WITH_PROJECT_ID.firebaseapp.com",
    projectId: "REPLACE_WITH_PROJECT_ID",
    storageBucket: "REPLACE_WITH_PROJECT_ID.appspot.com",
    messagingSenderId: "REPLACE_WITH_SENDER_ID",
    appId: "REPLACE_WITH_APP_ID",
  };

  /**
   * Determine whether the config still contains placeholder values.
   * @param {Object} config The Firebase config object to inspect.
   * @returns {boolean} True if the config has been filled in with real values.
   */
  function configHasRealValues(config) {
    return (
      typeof config.apiKey === "string" &&
      config.apiKey.indexOf("REPLACE_WITH") === -1 &&
      config.projectId.indexOf("REPLACE_WITH") === -1
    );
  }

  var isConfigured = configHasRealValues(firebaseConfig);
  var auth = null;
  var db = null;

  // Only initialize Firebase when real config is present and the SDK loaded.
  // This lets the catalog (browse/search/filter/sort) work even before setup.
  if (isConfigured && typeof firebase !== "undefined") {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
  }

  /**
   * Public Firebase service surface used by auth.js and storage.js.
   * @namespace AppFirebase
   * @property {boolean} isConfigured Whether real config was supplied.
   * @property {Object|null} auth The Firebase Auth instance (null until configured).
   * @property {Object|null} db The Firestore instance (null until configured).
   */
  window.AppFirebase = {
    isConfigured: isConfigured,
    auth: auth,
    db: db,
  };
})();
