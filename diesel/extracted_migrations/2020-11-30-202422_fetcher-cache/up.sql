-- Your SQL goes here
CREATE TABLE fetcher_cache (
    key text NOT NULL PRIMARY KEY,
    timestamp text NOT NULL,
    value text NOT NULL
);
