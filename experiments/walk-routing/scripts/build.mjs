import {readFile,writeFile} from 'node:fs/promises';
import {compileOSM,BOUNDS} from './compiler.mjs';
const [inFile,outFile]=process.argv.slice(2);
if(!inFile||!outFile)throw new Error('Usage: node scripts/build.mjs extract.json data/walk-graph.json');
const doc=JSON.parse(await readFile(inFile,'utf8'));
const graph=compileOSM(doc,BOUNDS);
await writeFile(outFile,JSON.stringify(graph)+'\n');
console.log(JSON.stringify({source:graph.source,nodes:graph.nodes.length,edges:graph.edges.length}));
