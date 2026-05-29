import { useState, useMemo } from "react";
import { useQuery } from "./query";

const getPartsFromMatches = (input, terms) => {
  const matchedRanges = [];
  for (const term of terms) {
    const matchIndex = input.toLowerCase().indexOf(term.toLowerCase());
    if (matchIndex > -1) {
      matchedRanges.push([matchIndex, matchIndex + term.length]);
    }
  }
  // sort by start to guarantee intersection detection with last range
  matchedRanges.sort((a, b) => a[0] - b[0]);
  // merge ranges
  const ranges = [];
  for (const [start, end] of matchedRanges) {
    let lastRange = ranges.at(-1);
    if (lastRange && start <= lastRange[1]) {
      lastRange[1] = Math.max(lastRange[1], end);
    } else {
      ranges.push([start, end]);
    }
  }
  // compute string parts
  const parts = [];
  let prevPartEnd = 0;
  for (const [start, end] of ranges) {
    // previous non highlighted part
    parts.push(input.slice(prevPartEnd, start));
    // highlighted part
    parts.push(input.slice(start, end));
    prevPartEnd = end;
  }
  // last non highlighted part
  parts.push(input.slice(prevPartEnd));
  return parts;
};

function Row({ item, terms }) {
  let name = item.name;
  // render highlighted parts
  const parts = getPartsFromMatches(name, terms);
  return (
    <tr>
      <td>
        {parts.map((part, index) =>
          index % 2 === 0 ? part : <strong key={index}>{part}</strong>,
        )}
      </td>
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
