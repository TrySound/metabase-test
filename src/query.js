import { useState, useRef, useEffect } from "react";

const getData = async (searchTerm) => {
  const response = await fetch(`/search?term=${searchTerm}`);
  if (!response.ok) {
    throw new Error(`${response.statusText}`);
  } else {
    return await response.json();
  }
};

class Cache {
  #expireAfter;
  #cache = new Map();
  constructor({ expireAfter }) {
    this.#expireAfter = expireAfter;
  }
  set(key, data) {
    this.#cache.set(key, { data, time: Date.now() });
  }
  get(key) {
    const entry = this.#cache.get(key);
    // cleanup the entry when stored longer then "expireAfter"
    const isExpired = (entry?.time ?? 0) + this.#expireAfter < Date.now();
    if (entry && (entry.locked || !isExpired)) {
      return entry.data;
    } else {
      this.#cache.delete(key);
    }
  }
  /**
   * lock keys to not expire while other data is loaded
   */
  lock(key) {
    const entry = this.#cache.get(key);
    if (entry) {
      this.#cache.set(key, { ...entry, locked: true });
    }
  }
  /**
   * reset expiry time to keep cache entry fresh
   */
  unlock(key) {
    const entry = this.#cache.get(key);
    if (entry) {
      this.#cache.set(key, { ...entry, time: Date.now(), locked: false });
    }
  }
}

const sleep = (time, data) => {
  return new Promise((resolve) => {
    setTimeout(resolve, time, data);
  });
};

const retry = async (fn) => {
  let lastError;
  try {
    await fn();
  } catch {
    for (const time of [1000, 2000, 4000]) {
      lastError = undefined;
      await sleep(time);
      try {
        await fn();
        break;
      } catch (error) {
        lastError = error;
      }
    }
  }
  if (lastError) {
    throw lastError;
  }
};

class Query {
  cache;
  #debounceTimeoutId;
  #requestDebounceTime;
  #loadingDelay;
  #pendingRequests = new Map();

  constructor({ requestDebounceTime, loadingDelay, cacheExpireAfter }) {
    this.#requestDebounceTime = requestDebounceTime;
    this.#loadingDelay = loadingDelay;
    this.cache = new Cache({ expireAfter: cacheExpireAfter });
  }

  #scheduleDataRequest(term) {
    if (this.#pendingRequests.has(term)) {
      return;
    }
    const lastPendingRequest = Promise.resolve(
      Array.from(this.#pendingRequests.values()).at(-1),
    );
    // store requested promise to access later
    // and update cache once request is completed
    this.#pendingRequests.set(
      term,
      lastPendingRequest.then(async () => {
        // schedule request 150ms after the latest one to mitigate server throttling
        await sleep(150);
        try {
          // retry 3 times with increasing delay until completed
          await retry(async () => {
            const data = await getData(term);
            this.cache.set(term, data);
          });
        } catch (error) {
          console.error(error);
        }
        // clear both successful and failed requests
        this.#pendingRequests.delete(term);
      }),
    );
  }

  fetch({ keys, signal, onLoadingStart, onData }) {
    // cancel latest debounced request
    this.cancel();

    // show cached data immediately when everything is present
    if (keys.every((term) => this.cache.get(term))) {
      onData();
      return;
    }

    // debounce request
    this.#debounceTimeoutId = setTimeout(async () => {
      for (const term of keys) {
        // keep existing cache entries fresh while other data is loading
        if (this.cache.get(term)) {
          this.cache.lock(term);
        } else {
          this.#scheduleDataRequest(term);
        }
      }

      // retrieve cached data after request is completed
      // and populated cache store
      const finishedPromise = Promise.all(
        keys.map((term) => this.#pendingRequests.get(term)),
      );

      // fire loading start if requests are not finished within "loading delay"
      const status = await Promise.race([
        sleep(this.#loadingDelay, "loading"),
        finishedPromise,
      ]);
      if (status === "loading") {
        onLoadingStart();
        await finishedPromise;
      }

      // reset existing cache entries lock
      for (const term of keys) {
        this.cache.unlock(term);
      }
      if (!signal.aborted) {
        onData();
      }
    }, this.#requestDebounceTime);
  }

  cancel() {
    clearTimeout(this.#debounceTimeoutId);
  }
}

export const useQuery = ({
  keys,
  requestDebounceTime,
  cacheExpireAfter,
  loadingDelay,
}) => {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const query = useRef();
  if (!query.current) {
    query.current = new Query({
      requestDebounceTime,
      cacheExpireAfter,
      loadingDelay,
    });
  }

  useEffect(() => {
    const controller = new AbortController();
    query.current.fetch({
      keys,
      signal: controller.signal,
      onLoadingStart() {
        setIsLoading(true);
      },
      onData() {
        const dataByName = new Map();
        for (const term of keys) {
          const data = query.current.cache.get(term);
          if (data) {
            for (const item of data) {
              dataByName.set(item.name, item);
            }
          }
        }
        setData(Array.from(dataByName.values()));
        setIsLoading(false);
      },
    });
    return () => {
      controller.abort();
    };
  }, [keys]);

  // cleanup
  useEffect(() => {
    return () => {
      query.current.cancel();
    };
  }, []);

  return {
    data,
    isLoading,
  };
};
