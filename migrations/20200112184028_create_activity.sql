CREATE TABLE raw_events.events (
    -- declared autoincrement to prevent id reuse for synchronization (otherwise sqlite will reuse old ids on e.g. vacuum)
    insertion_sequence integer PRIMARY KEY AUTOINCREMENT,
    -- for captured events, the id is generated randomly (uuidv4)
    -- for imported events, the id must be an id taken based on
    -- a combination of data_type and something from the import
    -- such that it is unique but repeated imports will not cause
    -- duplicate entries
    id text NOT NULL UNIQUE,
    timestamp text NOT NULL, -- ISO8601
    data_type text NOT NULL, -- "{name}_v{version}"
    sampler text NOT NULL, -- JSON
    sampler_sequence_id text NOT NULL, -- UUID
    data text NOT NULL -- JSON
);

CREATE INDEX raw_events.events_timestamp_idx ON events (timestamp);
