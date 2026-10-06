(function () {
  const DATABASE_NAME = "fieldnote-local";
  const DATABASE_VERSION = 1;
  const STORE_NAME = "farm-data";
  const RECORD_KEY = "current-farm";
  const LEGACY_KEY = "fieldnote-farm-data-v1";

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB is not available in this browser."));
        return;
      }
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open local storage."));
      request.onblocked = () => reject(new Error("Local storage upgrade is blocked by another tab."));
    });
  }

  function readRecord(database) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(RECORD_KEY);
      request.onsuccess = () => resolve(request.result?.payload || null);
      request.onerror = () => reject(request.error || new Error("Could not read local farm data."));
      transaction.onabort = () => reject(transaction.error || new Error("Reading local farm data was interrupted."));
    });
  }

  function writeRecord(database, payload) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put({
        key: RECORD_KEY,
        payload,
        savedAt: new Date().toISOString()
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Could not save local farm data."));
      transaction.onabort = () => reject(transaction.error || new Error("Saving local farm data was interrupted."));
    });
  }

  async function read() {
    let database;
    try {
      database = await openDatabase();
      const current = await readRecord(database);
      if (current) return { payload: current, backend: "indexeddb" };

      const legacy = localStorage.getItem(LEGACY_KEY);
      if (!legacy) return { payload: null, backend: "indexeddb" };
      await writeRecord(database, legacy);
      localStorage.removeItem(LEGACY_KEY);
      return { payload: legacy, backend: "indexeddb" };
    } catch (error) {
      console.error("IndexedDB could not be used; trying existing browser storage.", error);
      try {
        const legacy = localStorage.getItem(LEGACY_KEY);
        return { payload: legacy, backend: "localstorage" };
      } catch (storageError) {
        console.error("Could not read browser storage.", storageError);
        throw storageError;
      }
    } finally {
      database?.close();
    }
  }

  async function write(payload) {
    let database;
    try {
      database = await openDatabase();
      await writeRecord(database, payload);
      try {
        localStorage.removeItem(LEGACY_KEY);
      } catch (error) {
        console.warn("Could not clear the migrated local-storage copy.", error);
      }
      return "indexeddb";
    } catch (error) {
      console.error("IndexedDB save failed; trying browser local storage.", error);
      try {
        localStorage.setItem(LEGACY_KEY, payload);
        return "localstorage";
      } catch (storageError) {
        console.error("Could not save farm data in browser storage.", storageError);
        throw storageError;
      }
    } finally {
      database?.close();
    }
  }

  async function requestPersistentStorage() {
    if (!navigator.storage?.persist) return false;
    try {
      return await navigator.storage.persist();
    } catch (error) {
      console.warn("Persistent browser storage could not be requested.", error);
      return false;
    }
  }

  async function estimateStorage() {
    if (!navigator.storage?.estimate) return null;
    try {
      return await navigator.storage.estimate();
    } catch (error) {
      console.warn("Browser storage usage could not be checked.", error);
      return null;
    }
  }

  window.FieldnoteStorage = { read, write, requestPersistentStorage, estimateStorage };
})();
