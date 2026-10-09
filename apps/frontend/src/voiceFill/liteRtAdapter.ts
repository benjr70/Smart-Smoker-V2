/**
 * The LiteRT-LM adapter: a model behind the extractor port, run by LiteRT-LM
 * JS on the phone's GPU.
 *
 * Everything that touches the runtime is here and nowhere else, and this
 * module is only ever imported lazily (see `gemmaModel.ts`), so the runtime
 * stays out of the main bundle. What is done with the runtime — the one tool
 * call a Ramble is answered by, the download, the test-load — is in
 * `liteRtExtractor.ts`, which is tested against a runtime that runs no model.
 *
 * This module has no unit test: it needs the real model, and a WebGPU adapter
 * to run it on. It is proven on a real phone.
 */
import type { ConversationConfig } from '@litert-lm/core';
import { Engine, getOrLoadGlobalLiteRtLm } from '@litert-lm/core';
import { createLiteRtModel } from './liteRtExtractor';

/**
 * The most tokens a conversation may hold: the screen's tool, the Ramble and
 * the answer. The smoke screen's tool is the longest of the three, and fits
 * with room for a long Ramble.
 */
const MAX_TOKENS = 4096;

export const { download, testLoad, createExtractor } = createLiteRtModel({
  // The same load `Engine.create` starts where nothing has: from the path the
  // package fetches its runtime from by default, and held by the page after.
  fetchRuntime: () => getOrLoadGlobalLiteRtLm().then(() => undefined),
  createEngine: async model => {
    const engine = await Engine.create({
      model,
      mainExecutorSettings: { maxNumTokens: MAX_TOKENS },
    });
    return {
      // The tool is a JSON Schema in the subset LiteRT-LM declares; only the
      // names of the two types differ.
      createConversation: config => engine.createConversation(config as ConversationConfig),
      delete: () => engine.delete(),
    };
  },
});
