import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Search } from "lucide-react";
import { useApp } from "../context/AppContext";
import { Modal, SearchInput } from "./ui";
import { searchWorkspace } from "../lib/workspace";

export function WorkspaceSearch() {
  const { data, user } = useApp();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() =>
      searchRef.current?.querySelector("input")?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [open]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k" &&
        !document.querySelector('[role="dialog"]')
      ) {
        event.preventDefault();
        setQuery("");
        setOpen(true);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  const results = open ? searchWorkspace(data, user?.role, query) : [];
  return (
    <>
      <button
        className="workspace-search-trigger"
        onClick={() => {
          setQuery("");
          setOpen(true);
        }}
        aria-label="Search workspace"
        aria-haspopup="dialog"
      >
        <Search size={17} />
        <span>Find a farm, task or tool</span>
        <kbd>Ctrl K</kbd>
      </button>
      {open && (
        <Modal
          title="Find your next step"
          description="Search your farms, tasks and workspace tools."
          onClose={() => setOpen(false)}
        >
          <div className="workspace-search" ref={searchRef}>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search farms, tasks and tools"
            />
            <p className="search-result-count" role="status">
              {query
                ? `${results.length}${results.length === 30 ? "+" : ""} result${results.length === 1 ? "" : "s"}`
                : "Jump to a workspace tool"}
            </p>
            <div className="workspace-search-results">
              {results.map((result) => (
                <Link
                  key={result.key}
                  to={result.to}
                  onClick={() => setOpen(false)}
                >
                  <span>
                    <small>{result.kind}</small>
                    <strong>{result.title}</strong>
                    <span>{result.detail}</span>
                  </span>
                  <ArrowUpRight size={18} />
                </Link>
              ))}
              {!results.length && (
                <p className="search-empty">
                  No matches. Try a farm name, crop or task title.
                </p>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
