-- 0005_uploads_index: speed orphan cleanup scans (Phase 5).
create index if not exists idx_files_pending
  on uploaded_files (status, created_at);
create index if not exists idx_files_submission
  on uploaded_files (submission_id);
