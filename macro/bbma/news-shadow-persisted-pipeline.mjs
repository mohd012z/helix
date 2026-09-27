import {runBbmaNewsShadow} from './news-shadow-pipeline.mjs';
import {persistShadowObservation} from './shadow-observation-ledger.mjs';

/** Executes the evidence-only shadow pipeline, then persists its immutable observation. */
export function runAndPersistBbmaNewsShadow(input,{ledgerPath,maxEntries}={}){
 const observation=runBbmaNewsShadow(input);
 const persisted=persistShadowObservation(observation,{ledgerPath,maxEntries});
 return Object.freeze({observation,persisted});
}
