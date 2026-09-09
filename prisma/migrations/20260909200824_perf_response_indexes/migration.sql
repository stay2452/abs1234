-- Otimizacao de tempo de resposta: indices para filtros/ordenacoes quentes.
-- Post.publishedAt: ranking de posts filtra por data real de publicacao.
-- ScrapeRun.startedAt: auditoria ordena por startedAt desc (take 100).
CREATE INDEX "Post_publishedAt_idx" ON "public"."Post"("publishedAt");
CREATE INDEX "ScrapeRun_startedAt_idx" ON "public"."ScrapeRun"("startedAt");
