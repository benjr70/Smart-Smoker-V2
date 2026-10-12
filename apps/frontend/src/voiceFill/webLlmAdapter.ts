/**
 * The WebLLM adapter: a model behind the extractor port, run by WebLLM on the
 * phone's GPU.
 *
 * Everything that touches the runtime is here and nowhere else, and this
 * module is only ever imported lazily (see `webLlmModels.ts`), so the runtime
 * stays out of the main bundle. What is done with the runtime — the one answer
 * a Ramble is read from, the download, the test-load — is in
 * `webLlmExtractor.ts`, which is tested against a runtime that runs no model.
 *
 * This module has no unit test: it needs the real model, and a WebGPU adapter
 * to run it on. It is proven on a real phone.
 */
import { MLCEngine, deleteModelAllInfoInCache, hasModelInCache } from '@mlc-ai/web-llm';
import { CannotRunHereError, createWebLlmModel } from './webLlmExtractor';

/**
 * The most tokens an answer may run to: every field of the longest screen and
 * its Notes, with room over. An answer that reaches it was not going to end.
 */
const MAX_ANSWER_TOKENS = 1024;

/**
 * What WebLLM names the errors of a phone whose GPU cannot run a model at all.
 * It does not export their classes, so they are known by name.
 */
const CANNOT_RUN_HERE = [
  'WebGPUNotAvailableError',
  'WebGPUNotFoundError',
  'FeatureSupportError',
  'ShaderF16SupportError',
];

const cannotRunHere = (error: unknown): error is Error =>
  error instanceof Error && CANNOT_RUN_HERE.includes(error.name);

const stopped = (): DOMException => new DOMException('The load was stopped.', 'AbortError');

export const { download, testLoad, has, remove, createExtractor } = createWebLlmModel({
  createEngine: async (modelId, { onProgress, signal } = {}) => {
    const engine = new MLCEngine({
      initProgressCallback: report => onProgress?.(report.progress),
    });
    // Letting the engine go is what stops a load part-way; what it had fetched stays.
    const stop = (): void => {
      engine.unload().catch(() => undefined);
    };
    signal?.addEventListener('abort', stop);
    try {
      if (signal?.aborted) {
        throw stopped();
      }
      await engine.reload(modelId);
      // A load that was stopped does not fail: it returns with nothing loaded.
      if (signal?.aborted) {
        throw stopped();
      }
    } catch (error) {
      // Whatever a load that failed had put on the GPU is not left there.
      await engine.unload().catch(() => undefined);
      throw cannotRunHere(error) ? new CannotRunHereError(error.message) : error;
    } finally {
      signal?.removeEventListener('abort', stop);
    }
    return {
      complete: async request => {
        try {
          const reply = await engine.chat.completions.create({
            ...request,
            // The same Ramble is read the same way each time.
            temperature: 0,
            max_tokens: MAX_ANSWER_TOKENS,
            // Qwen3 thinks aloud before it answers unless told not to, and
            // there is neither the time nor the room for it. The reply then
            // opens with the empty block it would have thought in, which
            // the extractor reads past.
            extra_body: { enable_thinking: false },
          });
          return reply.choices[0]?.message.content ?? '';
        } finally {
          // The engine holds its memory of the Ramble; none is kept.
          await engine.resetChat().catch(() => undefined);
        }
      },
      unload: () => engine.unload(),
    };
  },
  has: modelId => hasModelInCache(modelId),
  remove: modelId => deleteModelAllInfoInCache(modelId),
});
