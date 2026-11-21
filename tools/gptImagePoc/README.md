# Toonflow GPT Image POC

Run locally from the repository root with `./tools/gptImagePoc/start.ps1` or `bun run tools/gptImagePoc/server.ts`.

The POC binds only to `127.0.0.1:3301` and uses `localhost:1455/auth/callback`. Credentials, reference uploads, generated images, and request logs are isolated under `%TEMP%\toonflow-gpt-image-poc`. It never reads Codex CLI/Desktop credential paths and never reads or sets `OPENAI_API_KEY`.

Generation requests use the selected model and quality values exactly as shown. Errors are returned as errors; there is no model fallback. The model selector exposes only `gpt-image-2.6-flare`, the fixed ChatGPT subscription model documented by the current `dsh-image-gen` reference implementation. The endpoint does not echo a model identifier, so this does not prove which model actually served a request. The top-level response `quality` value is retained as provider metadata; its semantics are undocumented and it is not treated as proof of delivered image quality. Actual dimensions are read from the returned image bytes.
