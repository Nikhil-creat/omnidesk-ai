CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE accounts(id bigserial PRIMARY KEY, name text NOT NULL);
CREATE TABLE document_chunks(id bigserial PRIMARY KEY, account_id bigint NOT NULL REFERENCES accounts(id), body text, embedding vector(1536), tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', body)) STORED, metadata jsonb DEFAULT '{}');
CREATE INDEX ON document_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON document_chunks USING gin (tsv);
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY; ALTER TABLE document_chunks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON document_chunks USING (account_id = current_setting('app.account_id')::bigint);
