// ============================================================
// poc-analyzer — Neo4j Schema Migration 001
// Step 4: GraphRAG CI/CD Pipeline
// ============================================================
// Principios de diseño:
//   - Immutability: nodos nunca se mutan (event sourcing)
//   - Content-addressable: id = SHA256(content) donde aplique
//   - Full lineage: todo trazado a Repo → PR → Commit → Timestamp
//   - Multi-tenant: soporta N repos y N orgs desde el día 1
// ============================================================

// ─── Constraints de unicidad (content-addressable nodes) ───

CREATE CONSTRAINT org_id IF NOT EXISTS
  FOR (n:Org) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT repo_id IF NOT EXISTS
  FOR (n:Repo) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT pr_id IF NOT EXISTS
  FOR (n:PullRequest) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT ast_chunk_id IF NOT EXISTS
  FOR (n:ASTChunk) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT spec_chunk_id IF NOT EXISTS
  FOR (n:SpecChunk) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT jsx_change_id IF NOT EXISTS
  FOR (n:JSXChange) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT component_id IF NOT EXISTS
  FOR (n:Component) REQUIRE n.id IS UNIQUE;

// ─── Vector indices (Neo4j 5.x) ───────────────────────────
// Dimensiones: 768 (nomic-embed-text)
// Función de similitud: cosine

CREATE VECTOR INDEX spec_embeddings IF NOT EXISTS
  FOR (n:SpecChunk) ON n.embedding
  OPTIONS {
    indexConfig: {
      `vector.dimensions`: 768,
      `vector.similarity_function`: 'cosine'
    }
  };

CREATE VECTOR INDEX ast_embeddings IF NOT EXISTS
  FOR (n:ASTChunk) ON n.embedding
  OPTIONS {
    indexConfig: {
      `vector.dimensions`: 768,
      `vector.similarity_function`: 'cosine'
    }
  };

// ─── Índices de búsqueda rápida ───────────────────────────

CREATE INDEX analysis_run_created IF NOT EXISTS
  FOR (n:AnalysisRun) ON (n.createdAt);

CREATE INDEX spec_chunk_type IF NOT EXISTS
  FOR (n:SpecChunk) ON (n.type, n.filename);

CREATE INDEX test_prediction_status IF NOT EXISTS
  FOR (n:TestPrediction) ON (n.status);

CREATE INDEX component_risk IF NOT EXISTS
  FOR (n:Component) ON (n.riskScore);

CREATE INDEX pr_number IF NOT EXISTS
  FOR (n:PullRequest) ON (n.prNumber);

CREATE INDEX ci_result_created IF NOT EXISTS
  FOR (n:CIResult) ON (n.createdAt);

// ─── Verificación (mostrar índices creados) ───────────────
// Ejecutar manualmente para confirmar:
//   SHOW INDEXES YIELD name, type, state WHERE state = 'ONLINE';
