-- PostgreSQL analysis of the existing application JSONB store.
-- Apply authenticated project/user parameters in the database client; never
-- expose this state table to untrusted analysts or public endpoints.
WITH sessions AS (
  SELECT session
  FROM codemesh_state,
       LATERAL jsonb_array_elements(COALESCE(payload->'conversationRuns', '[]'::jsonb)) AS session
  WHERE id = 'primary'
    AND session->>'projectId' = $1
    AND session->>'createdBy' = $2
), turns AS (
  SELECT session->'settings'->>'promptMode' AS prompt_mode,
         session->'settings'->>'providerMode' AS provider_mode,
         session->'settings'->>'language' AS language,
         turn->>'intent' AS intent,
         turn->>'toolStatus' AS tool_status,
         (turn->>'latencyMs')::numeric AS latency_ms
  FROM sessions,
       LATERAL jsonb_array_elements(session->'turns') AS turn
)
SELECT prompt_mode, provider_mode, language, COUNT(*) AS turns,
       ROUND(AVG(latency_ms), 2) AS mean_latency_ms,
       COUNT(*) FILTER (WHERE tool_status = 'FAIL') AS tool_failures,
       COUNT(*) FILTER (WHERE intent = 'clarify') AS clarification_turns
FROM turns
GROUP BY prompt_mode, provider_mode, language;

-- Session-level outcomes and feedback; unrated sessions are excluded from the
-- useful-feedback denominator, rather than counted as negative responses.
WITH sessions AS (
  SELECT session
  FROM codemesh_state,
       LATERAL jsonb_array_elements(COALESCE(payload->'conversationRuns', '[]'::jsonb)) AS session
  WHERE id = 'primary'
    AND session->>'projectId' = $1
    AND session->>'createdBy' = $2
)
SELECT session->'settings'->>'providerMode' AS provider_mode,
       session->'settings'->>'language' AS language,
       COUNT(*) AS retained_sessions,
       COUNT(*) FILTER (WHERE session->>'state' = 'completed') AS completed_drafts,
       COUNT(*) FILTER (WHERE session->>'state' = 'handed-off') AS handoffs,
       COUNT(*) FILTER (WHERE session->'feedback'->>'rating' IS NOT NULL) AS rated_sessions,
       ROUND(
         COUNT(*) FILTER (WHERE session->'feedback'->>'rating' = 'useful')::numeric /
         NULLIF(COUNT(*) FILTER (WHERE session->'feedback'->>'rating' IS NOT NULL), 0), 3
       ) AS useful_feedback_rate
FROM sessions
GROUP BY provider_mode, language;

WITH sessions AS (
  SELECT session
  FROM codemesh_state,
       LATERAL jsonb_array_elements(COALESCE(payload->'conversationRuns', '[]'::jsonb)) AS session
  WHERE id = 'primary'
    AND session->>'projectId' = $1
    AND session->>'createdBy' = $2
)
SELECT session->'feedback'->>'category' AS category,
       COUNT(*) AS feedback_count,
       COUNT(*) FILTER (WHERE session->'feedback'->>'rating' = 'needs-work') AS needs_work
FROM sessions
WHERE session->'feedback'->>'rating' IS NOT NULL
GROUP BY category;
