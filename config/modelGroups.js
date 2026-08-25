// config/modelGroups.js
//
// Har "role" (planner, coder, tester, fixer, reporter) ke apne fallback models hain.
// Priority order top-to-bottom — pehla fail ho to agla try hoga.
//
// NOTE: Tune jo list di thi usme kuch models embedding/TTS/moderation ke the,
// wo yaha nahi liye kyunki wo chat-completion nahi karte:
//   - nvidia/nemotron-3-embed-1b, nvidia/llama-nemotron-embed-vl-1b-v2,
//     liquid/lfm-2.5-embedding-350m  -> embeddings, chat nahi
//   - nvidia/nemotron-3.5-content-safety -> moderation classifier
//   - fish-audio/s2.1-pro-free, deepgram/flux-tts -> text-to-speech
//   - openrouter/free -> aisa koi valid slug nahi mila
//
// Baaki saare valid free chat/coding models hain — role ke hisaab se group kiya hai.
// Reasoning-heavy models (bade, "ultra"/"super") -> Planner
// Code-focused models -> Coder
// Chhote/fast models -> Tester (jaldi jaldi check karne ke liye)
// Mid-size reliable -> Fixer
// Fast + concise -> Reporter

const MODEL_GROUPS = {
  planner: [
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "z-ai/glm-5.2:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "thinkingmachines/inkling:free",
  ],

  coder: [
    "poolside/laguna-s-2.1:free",
    "cohere/north-mini-code:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "poolside/laguna-xs-2.1:free",
  ],

  tester: [
    "nvidia/nemotron-3.5-lightning:free",
    "thinkingmachines/inkling-small:free",
    "google/gemma-4-26b-a4b-it:free",
    "liquid/lfm-2.5-2.6b:free",
  ],

  fixer: [
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "poolside/laguna-s-2.1:free",
    "z-ai/glm-5.2:free",
    "dots-studio/dots-3-note-preview:free",
  ],

  reporter: [
    "google/gemma-4-26b-a4b-it:free",
    "liquid/lfm-2.5-2.6b:free",
    "thinkingmachines/inkling-small:free",
    "nvidia/nemotron-3.5-lightning:free",
  ],
};

module.exports = { MODEL_GROUPS };
