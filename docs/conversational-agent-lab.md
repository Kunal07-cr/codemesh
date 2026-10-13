# Codaventra Conversational Agent Lab

This is a synthetic, transcript-based customer demo-booking prototype for
practicing conversational product analysis. It is not a production voicebot.
Open Engineering > Systems > Conversational Agent Lab, or use
`/projects/project-sample-taskpilot/engineering?tab=systems&view=conversation`.

## Workflow

Collect need -> list synthetic slots -> choose a slot -> explicit confirmation
-> local booking draft. A human-handoff request closes the synthetic session;
interruptions preserve the current state. Calendar failure can be explicitly
simulated. Tools are local allowlisted functions, not arbitrary shell commands
or real scheduling integrations. No external calendar, CRM, phone or SMS changes.

The configured LLM can classify intent using versioned zero-shot, few-shot,
role-conditioned or persona-conditioned prompts. JSON decisions are validated
with Zod before the application routes them. Application guards require an
existing selected slot and explicit affirmative text before a draft is confirmed;
model text cannot waive that requirement. Responses use short controlled
English/Hinglish templates, not unvalidated free-form model claims. Retrieved
transcript instruction attacks abstain before generation. Provider failures
produce an explicit model-fallback trace and a clarifying response.

Default scripted mode is free and deterministic. Configured-model mode requires
the existing LLM/Gemini configuration and explicit consent to send synthetic
transcripts. No keys are created or copied to the browser. Only use synthetic
transcripts; session data can be stored and sent to a model when consented.

## Product Analysis And Evaluation

Each retained creator-owned session records prompt version/hash, provider mode,
language, typed state transitions, allowlisted tool result, observed latency,
failure flags and user feedback category. Sessions are limited to 20 turns and
50 retained runs per instance. Project role checks, CSRF and optimistic turn
versions protect the API; no other user's private session is returned.

The authored regression suite contains nine conditions across four prompt
modes (36 scripted cases): completion, code-mixed input, clarification, noisy
transcripts, interruption, tool failure, confirmation guard, instruction
boundary and extended dialogue. It checks expected final state, tool selection,
reply length and confirmation-boundary compliance. These are reproducible
workflow checks, not general conversational accuracy or LLM prompt-quality scores.
The same scripted classifier is used across prompt modes; actual model/prompt
comparisons require configured-model sessions and separately scored outcomes.

Run the export and Python SQL analysis from the repository root:

```powershell
npm.cmd run evaluate:conversations --silent > conversation-report.json
python scripts/analyze-conversations.py conversation-report.json
python scripts/analyze-conversations.py conversation-report.json --database conversation-metrics.sqlite
```

Python validates the export, inserts cases through parameterized SQL and computes
condition, prompt-mode and language breakdowns with SQLite. The PostgreSQL query
in `docs/conversation-analytics.sql` reads retained session/turn metrics from the
existing JSONB state table using project/user parameters. Do not expose that
application state table to public clients. PostgreSQL execution depends on a
configured database and is not implied by the SQLite smoke test.

## What Is Not Implemented

No speech-to-text, text-to-speech, real audio interruptions, live calls, WER/MOS
measurement, customer-conversion metric, production CRM connector or real
booking. Hinglish fixtures use Roman-script Hindi mixed with English, not a
Hindi speech-recognition evaluation. The model adapter and refusal/error paths
are tested with mocks; live model quality requires actual configured-provider
testing. Real customer transcripts require a separate privacy/retention review.

Technical references: [OpenAI prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering),
[structured-output validation](https://developers.openai.com/api/docs/guides/structured-outputs).
