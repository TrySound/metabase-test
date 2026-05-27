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
  // merge ranges
  const ranges = [];
  for (let index = 0; index < input.length; index += 1) {
    const isHighlighted = matchedRanges.some(
      ([start, end]) => start <= index && index <= end,
    );
    if (!isHighlighted) {
      continue;
    }
    let lastRange = ranges.at(-1);
    if (!lastRange || lastRange[1] + 1 !== index) {
      lastRange = [index, index];
      ranges.push(lastRange);
    }
    lastRange[1] = index;
  }
  // compute string parts
  const parts = [];
  let prevPartEnd = 0;
  for (let index = 0; index < ranges.length; index += 1) {
    const [start, end] = ranges[index];
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
