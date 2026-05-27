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

const useQuery = ({ term, cacheExpireAfter }) => {
  const [data, setData] = useState([]);

  const cache = useRef();
  if (!cache.current) {
    cache.current = new Cache({ expireAfter: cacheExpireAfter });
  }

  const pending = useRef();
  if (!pending.current) {
    pending.current = new Map();
  }

  useEffect(() => {
    // show cached data immediately
    const cachedData = cache.current.get(term);
    if (cachedData) {
      setData(cachedData);
      return;
    }

    // store requested promise to access later
    // and update cache once request is completed
    if (!pending.current.has(term)) {
      pending.current.set(
        term,
        getData(term)
          .then((data) => {
            console.log(data);
            cache.current.set(term, data);
            pending.current.delete(term);
          })
          .catch((error) => console.error(error)),
      );
    }

    // retrieve cached data after request is completed
    // and populated cache store
    const controller = new AbortController();
    pending.current.get(term)?.then(() => {
      if (!controller.signal.aborted) {
        setData(cache.current.get(term));
      }
    });
    return () => controller.abort();
  }, [term]);

  return {
    data,
  };
};

export default function App() {
  const [term, setTerm] = useState("");
  const [requestedTerm, setRequestedTerm] = useState("");
  // load initial data and limit it when search
  const { data = [] } = useQuery({
    term: requestedTerm,
    cacheExpireAfter: 5 * 1000,
  });
  const handleSubmit = (event) => {
    event.preventDefault();
    setRequestedTerm(term);
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
        <button>Search</button>
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
            <tr key={index}>
              <td>{item.name}</td>
              <td>{item.phone}</td>
              <td>{item.address}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
