/* Quran recitation recognizer running on the phone itself (Whisper fine-tuned on recitation by Tarteel AI).
   Runs in its own thread so the page stays responsive. The model files are downloaded once from
   Hugging Face and kept in the browser cache. Messages:
     in : {type:'load', model}            -> out: {type:'progress', file, loaded, total} ... {type:'ready', model}
     in : {type:'asr', id, model, audio}  -> out: {type:'text', id, text}
     any failure                          -> out: {type:'error', id?, msg}                                    */
import {pipeline, env} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js';

env.allowLocalModels = false;

var pipe = null, pipeModel = null, loading = null;

function load(model) {
  if (pipe && pipeModel === model) return Promise.resolve(pipe);
  if (loading && loading.model === model) return loading.p;
  var p = pipeline('automatic-speech-recognition', model, {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: function (e) {
      if (e && e.status === 'progress') postMessage({type: 'progress', file: e.file, loaded: e.loaded, total: e.total});
    }
  }).then(function (pp) {
    pipe = pp; pipeModel = model; loading = null;
    return pp;
  }, function (err) { loading = null; throw err; });
  loading = {model: model, p: p};
  return p;
}

async function transcribe(model, audio) {
  var p = await load(model);
  var opts = {language: 'arabic', task: 'transcribe'};
  if (audio.length > 16000 * 30) { opts.chunk_length_s = 30; opts.stride_length_s = 5; }
  var out;
  try { out = await p(audio, opts); }
  catch (e) { out = await p(audio); } /* some fine-tunes reject the language/task tokens */
  return (out && out.text) || '';
}

/* one job at a time: the model is a single session */
var chain = Promise.resolve();
onmessage = function (ev) {
  var m = ev.data;
  chain = chain.then(async function () {
    try {
      if (m.type === 'load') { await load(m.model); postMessage({type: 'ready', model: m.model}); }
      else if (m.type === 'asr') postMessage({type: 'text', id: m.id, text: await transcribe(m.model, m.audio)});
    } catch (err) {
      postMessage({type: 'error', id: m.id, msg: String((err && err.message) || err)});
    }
  });
};
