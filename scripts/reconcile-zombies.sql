-- Hotfix P0: limpar RUNNING zumbis no Supabase (cole no SQL Editor)
-- Print mostrou 4 RUNNING com dias em andamento (118/240 etc) — status nunca fechou

-- 1) Ver zumbis
SELECT id, status, "startedAt", "finishedAt", "profilesTotal", "profilesFinished", "currentActivity"
FROM "ScrapeRun"
WHERE status = 'running'
ORDER BY "startedAt" DESC;

-- 2) Marcar como failed os com >3h (threshold do app)
UPDATE "ScrapeRun"
SET status = 'failed',
    "finishedAt" = NOW(),
    "currentActivity" = 'Marcado como falha: timeout zumbi (>3h sem heartbeat, reconciliado manual)',
    "errorsJson" = COALESCE("errorsJson",'[]')::jsonb || '[{"errorCode":"zombie_timeout","error":"Run zumbi reconciliado manual - processo reiniciado"}]'::jsonb
WHERE status = 'running'
  AND "startedAt" < NOW() - INTERVAL '3 hours';

-- 3) Verificar
SELECT count(*) FROM "ScrapeRun" WHERE status = 'running';
