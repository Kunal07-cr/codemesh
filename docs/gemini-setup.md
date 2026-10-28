# AI Provider Setup

The filename is retained for existing links. Codaventra supports a deterministic local provider, an OpenAI-compatible chat endpoint, and Gemini generation.

## Default Local Mode

With model variables unset, the assistant retrieves repository evidence and returns deterministic local answers and bounded edit instructions. It does not call a hosted model. Source citations and graph context remain available, but local mode is not a substitute for free-form LLM generation.

The bundled synthetic assistant dataset is separate from a project's source evidence. Benchmark reference solutions remain evaluator-only.

## Compatible Chat Endpoint

Export these in the environment of the API process:

~~~text
LLM_BASE_URL=<provider's compatible API base URL>
LLM_MODEL=<model identifier supported by that endpoint>
LLM_API_KEY=<server-side key if the provider requires one>
LLM_TEMPERATURE=0.3
MAX_CONTEXT_MESSAGES=30
~~~

Use the endpoint's API base, not its web chat page. The adapter appends its chat-completions path; verify the expected base with your chosen provider.

`LLM_BASE_URL` plus `LLM_MODEL` takes priority over Gemini. Optional `LLM_SYSTEM_PROMPT` and `LLM_MAX_PROMPT_CHARS` control server-side instructions/context bounds. Keep keys out of the web bundle.

## Gemini

~~~text
GEMINI_API_KEY=<server-side key>
GEMINI_MODEL=<model available to your account>
~~~

Set both values. The adapter calls Gemini's `generateContent` endpoint with retrieved evidence. If a compatible endpoint is also configured, it takes precedence.

These provider settings control generation. They do not install a vector database, automatically train a model, or replace the project's bounded repository retrieval with hosted semantic embeddings.

## Loading Settings

The API reads process environment variables. Root npm start/dev scripts do not automatically load `.env`. Set variables in your shell, container, or deployment host before starting the API. [.env.example](../.env.example) is a reference with optional local infrastructure settings; loading it unchanged can also select a database/cache/object-storage service.

Restart the API after configuration changes. Inspect `/api/health` for the selected `aiProvider` and the assistant's actual provider/error state.

## Evaluate What Runs

~~~bash
npm run build
npm run evaluate:accuracy
npm run evaluate:conversations --silent
~~~

The default evaluation is local. `npm run evaluate:accuracy -- --live` requires configured credentials, sends public benchmark fixtures to that provider, and may incur provider charges; invoke it only when intended.

Conversational Agent Lab configured-model sessions require explicit consent to send synthetic transcripts. The default 36-case suite is scripted and deterministic. It does not establish live model accuracy or compare prompt quality through real voice calls.

Provider output is untrusted. Review citations, diffs, and actual verification evidence before applying or publishing changes.
