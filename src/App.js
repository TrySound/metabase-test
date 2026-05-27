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
    if (entry && entry.time + this.#expireAfter >= Date.now()) {
      return entry.data;
    } else {
      this.#cache.delete(key);
    }
  }
}

class Query {
  #cache;
  #debounceTimeoutId;
  #pendingRequests = new Map();
  #requestDebounceTime;
  #loadingDelay;

  constructor({ requestDebounceTime, loadingDelay, cacheExpireAfter }) {
    this.#requestDebounceTime = requestDebounceTime;
    this.#loadingDelay = loadingDelay;
    this.#cache = new Cache({ expireAfter: cacheExpireAfter });
  }

  fetch({ term, signal, onLoadingStart, onData }) {
    // cancel latest debounced request
    this.cancel();

    // show cached data immediately
    const cachedData = this.#cache.get(term);
    if (cachedData) {
      onData(this.#cache.get(term));
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

      // store requested promise to access later
      // and update cache once request is completed
      if (!this.#pendingRequests.has(term)) {
        this.#pendingRequests.set(
          term,
          getData(term)
            .then((data) => {
              this.#cache.set(term, data);
              this.#pendingRequests.delete(term);
            })
            .catch((error) => console.error(error)),
        );
      }

      // retrieve cached data after request is completed
      // and populated cache store
      this.#pendingRequests.get(term)?.then(() => {
        clearTimeout(loadingTimeoutId);
        if (!signal.aborted) {
          onData(this.#cache.get(term));
        }
      });
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
  term,
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
      term,
      signal: controller.signal,
      onLoadingStart() {
        setIsLoading(true);
      },
      onData(data) {
        setData(data);
        setIsLoading(false);
      },
    });
    return () => {
      controller.abort();
    };
  }, [term]);

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

function Row({ item, term }) {
  const termStart = item.name.toLowerCase().indexOf(term.toLowerCase());
  let name = item.name;
  // render highlighted parts
  if (termStart > -1) {
    const termEnd = termStart + term.length;
    const prefix = item.name.slice(0, termStart);
    const highlighted = item.name.slice(termStart, termEnd);
    const suffix = item.name.slice(termEnd);
    name = (
      <>
        {prefix}
        <strong>{highlighted}</strong>
        {suffix}
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
  // load initial data and limit it when search
  const { data = [], isLoading } = useQuery({
    term,
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
            <Row key={index} item={item} term={term} />
          ))}
        </tbody>
      </table>
    </>
  );
}
