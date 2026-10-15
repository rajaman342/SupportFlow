/**
 * Migration 0006: Knowledge Base (indexing configs, documents, versions, chunks)
 */
export async function up(pgm) {
  // 1. indexing_configs
  pgm.createTable('indexing_configs', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    name: {
      type: 'text',
      notNull: true,
      unique: true
    },
    provider: {
      type: 'text',
      notNull: true
    },
    model: {
      type: 'text',
      notNull: true
    },
    dimensions: {
      type: 'integer',
      notNull: true,
      check: 'dimensions >= 1 AND dimensions <= 4000'
    },
    distance_metric: {
      type: 'text',
      notNull: true,
      default: 'cosine',
      check: "distance_metric IN ('cosine')"
    },
    normalize: {
      type: 'boolean',
      notNull: true,
      default: true
    },
    chunk_size_chars: {
      type: 'integer',
      notNull: true
    },
    chunk_overlap_chars: {
      type: 'integer',
      notNull: true,
      check: 'chunk_overlap_chars < chunk_size_chars'
    },
    status: {
      type: 'text',
      notNull: true,
      check: "status IN ('staged', 'active', 'retired')"
    },
    verified_at: {
      type: 'timestamptz',
      notNull: false
    },
    verification_note: {
      type: 'text',
      notNull: false
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()')
    }
  });

  // Target of composite foreign key for chunk dimensions enforcement
  pgm.addConstraint('indexing_configs', 'indexing_configs_id_dimensions_key', {
    unique: ['id', 'dimensions']
  });

  // Partial unique index ensuring exactly one active config
  pgm.sql("CREATE UNIQUE INDEX indexing_configs_single_active_idx ON indexing_configs ((true)) WHERE status = 'active';");

  // Seed default active mock indexing config (384 dimensions)
  pgm.sql(`
    INSERT INTO indexing_configs (
      id, name, provider, model, dimensions, distance_metric, normalize,
      chunk_size_chars, chunk_overlap_chars, status, verification_note
    ) VALUES (
      '00000000-0000-0000-0000-000000000384',
      'mock-hash-v1-384',
      'mock',
      'mock-hash-v1',
      384,
      'cosine',
      true,
      800,
      120,
      'active',
      'Default deterministic mock embedding provider for development and testing'
    ) ON CONFLICT (name) DO NOTHING;
  `);

  // 2. knowledge_documents
  pgm.createTable('knowledge_documents', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    organization_id: {
      type: 'uuid',
      notNull: true,
      references: 'organizations',
      onDelete: 'RESTRICT'
    },
    created_by: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'RESTRICT'
    },
    title: {
      type: 'text',
      notNull: true,
      check: 'char_length(title) >= 1 AND char_length(title) <= 200'
    },
    active_version_id: {
      type: 'uuid',
      notNull: false
    },
    deleted_at: {
      type: 'timestamptz',
      notNull: false
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()')
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()')
    }
  });

  pgm.createIndex('knowledge_documents', ['organization_id'], {
    name: 'knowledge_documents_org_active_idx',
    where: 'deleted_at IS NULL'
  });

  // 3. knowledge_document_versions
  pgm.createTable('knowledge_document_versions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    document_id: {
      type: 'uuid',
      notNull: true,
      references: 'knowledge_documents',
      onDelete: 'CASCADE'
    },
    organization_id: {
      type: 'uuid',
      notNull: true,
      references: 'organizations',
      onDelete: 'RESTRICT'
    },
    version_number: {
      type: 'integer',
      notNull: true,
      check: 'version_number >= 1'
    },
    origin: {
      type: 'text',
      notNull: true,
      check: "origin IN ('upload', 'replace', 'reindex')"
    },
    uploaded_by: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'RESTRICT'
    },
    original_filename: {
      type: 'text',
      notNull: true
    },
    mime_type: {
      type: 'text',
      notNull: true,
      check: "mime_type = 'application/pdf'"
    },
    size_bytes: {
      type: 'bigint',
      notNull: true,
      check: 'size_bytes > 0'
    },
    sha256: {
      type: 'char(64)',
      notNull: true
    },
    storage_provider: {
      type: 'text',
      notNull: true,
      check: "storage_provider IN ('local', 'cloudinary')"
    },
    storage_key: {
      type: 'text',
      notNull: true
    },
    status: {
      type: 'text',
      notNull: true,
      check: "status IN ('uploaded', 'processing', 'indexed', 'failed', 'superseded')"
    },
    page_count: {
      type: 'integer',
      notNull: false
    },
    attempt_count: {
      type: 'integer',
      notNull: true,
      default: 0
    },
    error_code: {
      type: 'text',
      notNull: false
    },
    error_message: {
      type: 'text',
      notNull: false
    },
    processing_started_at: {
      type: 'timestamptz',
      notNull: false
    },
    indexed_at: {
      type: 'timestamptz',
      notNull: false
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()')
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()')
    }
  });

  pgm.addConstraint('knowledge_document_versions', 'knowledge_doc_versions_doc_ver_unique', {
    unique: ['document_id', 'version_number']
  });

  pgm.createIndex('knowledge_document_versions', ['document_id', { name: 'version_number', sort: 'DESC' }], {
    name: 'knowledge_doc_versions_doc_ver_idx'
  });

  pgm.createIndex('knowledge_document_versions', ['organization_id', 'sha256'], {
    name: 'knowledge_doc_versions_org_sha_idx'
  });

  pgm.createIndex('knowledge_document_versions', ['status', 'updated_at'], {
    name: 'knowledge_doc_versions_status_reconciler_idx'
  });

  // Circular reference foreign key: knowledge_documents.active_version_id -> knowledge_document_versions.id
  pgm.sql(`
    ALTER TABLE knowledge_documents
    ADD CONSTRAINT fk_knowledge_docs_active_version
    FOREIGN KEY (active_version_id)
    REFERENCES knowledge_document_versions (id)
    DEFERRABLE INITIALLY DEFERRED;
  `);

  // 4. document_chunks
  pgm.createTable('document_chunks', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    organization_id: {
      type: 'uuid',
      notNull: true,
      references: 'organizations',
      onDelete: 'RESTRICT'
    },
    document_id: {
      type: 'uuid',
      notNull: true,
      references: 'knowledge_documents',
      onDelete: 'CASCADE'
    },
    document_version_id: {
      type: 'uuid',
      notNull: true,
      references: 'knowledge_document_versions',
      onDelete: 'CASCADE'
    },
    indexing_config_id: {
      type: 'uuid',
      notNull: true
    },
    embedding_dimensions: {
      type: 'integer',
      notNull: true
    },
    chunk_index: {
      type: 'integer',
      notNull: true,
      check: 'chunk_index >= 0'
    },
    page_number: {
      type: 'integer',
      notNull: true,
      check: 'page_number >= 1'
    },
    content: {
      type: 'text',
      notNull: true
    },
    content_sha256: {
      type: 'char(64)',
      notNull: true
    },
    char_count: {
      type: 'integer',
      notNull: true
    },
    embedding: {
      type: 'vector',
      notNull: true
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()')
    }
  });

  // Idempotency constraint: each version + config has unique chunk indices
  pgm.addConstraint('document_chunks', 'document_chunks_version_config_idx_unique', {
    unique: ['document_version_id', 'indexing_config_id', 'chunk_index']
  });

  // Composite foreign key enforcing chunk dimensions match the indexing config
  pgm.addConstraint('document_chunks', 'document_chunks_config_dims_fk', {
    foreignKeys: {
      columns: ['indexing_config_id', 'embedding_dimensions'],
      references: 'indexing_configs(id, dimensions)',
      onDelete: 'RESTRICT'
    }
  });

  // Enforce vector dimension strictly matches embedding_dimensions column
  pgm.addConstraint('document_chunks', 'document_chunks_vector_dims_check', {
    check: 'vector_dims(embedding) = embedding_dimensions'
  });

  pgm.createIndex('document_chunks', ['organization_id'], {
    name: 'document_chunks_org_idx'
  });

  pgm.createIndex('document_chunks', ['document_version_id', 'indexing_config_id'], {
    name: 'document_chunks_version_config_idx'
  });
}

export async function down(pgm) {
  pgm.dropTable('document_chunks', { cascade: true });
  pgm.sql('ALTER TABLE knowledge_documents DROP CONSTRAINT IF EXISTS fk_knowledge_docs_active_version;');
  pgm.dropTable('knowledge_document_versions', { cascade: true });
  pgm.dropTable('knowledge_documents', { cascade: true });
  pgm.dropTable('indexing_configs', { cascade: true });
}
