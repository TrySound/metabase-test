import { useState, useRef, useEffect, useMemo } from "react";

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

const sleep = (time) => {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
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
          const data = await getData(term);
          this.cache.set(term, data);
          this.#pendingRequests.delete(term);
        } catch (error) {
          console.error(error);
        }
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

    let loadingTimeoutId;
    // debounce request
    this.#debounceTimeoutId = setTimeout(() => {
      // schedule showing loading state
      loadingTimeoutId = setTimeout(() => {
        if (!signal.aborted) {
          onLoadingStart();
        }
      }, this.#loadingDelay);

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
      Promise.all(keys.map((term) => this.#pendingRequests.get(term))).then(
        () => {
          // reset existing cache entries lock
          for (const term of keys) {
            this.cache.unlock(term);
          }
          clearTimeout(loadingTimeoutId);
          if (!signal.aborted) {
            onData();
          }
        },
      );
    }, this.#requestDebounceTime);

    signal?.addEventListener("abort", () => {
      clearTimeout(loadingTimeoutId);
    });
  }

  cancel() {
    clearTimeout(this.#debounceTimeoutId);
  }
}

const useQuery = ({
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

function Row({ item, terms }) {
  let name = item.name;
  const ranges = [];
  for (const term of terms) {
    const matchIndex = name.toLowerCase().indexOf(term.toLowerCase());
    if (matchIndex > -1) {
      ranges.push([matchIndex, matchIndex + term.length]);
    }
  }
  if (ranges.length > 0) {
    console.log(item.name, terms, ranges);
  }
  // render highlighted parts
  if (ranges.length > 0) {
    ranges.sort(([a], [b]) => a - b);
    const parts = [];
    let prevPartEnd = 0;
    for (let index = 0; index < ranges.length; index += 1) {
      const [start, end] = ranges[index];
      parts.push(name.slice(prevPartEnd, start));
      parts.push(name.slice(start, end));
      prevPartEnd = end;
    }
    parts.push(name.slice(prevPartEnd));
    name = (
      <>
        {parts.map((part, index) =>
          index % 2 === 0 ? part : <strong key={index}>{part}</strong>,
        )}
      </>
    );
  }
  return (
    <tr>
      <td>{name}</td>
      <td>{item.phone}</td>
      <td>{item.address}</td>
    </tr>
  );
}

export default function App() {
  const [term, setTerm] = useState("");
  const queryKeys = useMemo(() => {
    const terms = term.split(/\s+/).filter((term) => term);
    return terms.length ? terms : [""];
  }, [term]);

  // load initial data and limit it when search
  const { data, isLoading } = useQuery({
    keys: queryKeys,
    requestDebounceTime: 300,
    cacheExpireAfter: 5 * 1000,
    loadingDelay: 500,
  });
  const handleSubmit = (event) => {
    event.preventDefault();
  };
  return (
    <>
      <form onSubmit={handleSubmit}>
        <input
          placeholder="Search by name"
          name="term"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />
        <div
          className="spinner"
          style={{ visibility: isLoading ? "visible" : "hidden" }}
        ></div>
      </form>
      <table hidden={data.length === 0}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Phone</th>
            <th>Address</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item, index) => (
            <Row key={index} item={item} terms={queryKeys} />
          ))}
        </tbody>
      </table>
    </>
  );
}
