const fs = require('node:fs/promises');
const path = require('node:path');
const {createRequire} = require('node:module');
const esbuild = require('esbuild');
// Node-backed resolver avoids native directory scans outside this build folder.
esbuild.build({
 stdin: {contents: "export {default} from '@owlbear-rodeo/sdk'; export * from '@owlbear-rodeo/sdk';", sourcefile:'entry.js'},
 bundle:true, platform:'browser', format:'esm', minify:true, write:false,
 define:{'process.env.NODE_ENV':'"production"'},
 plugins:[{name:'local-packages',setup(build){
   build.onResolve({filter:/.*/},args=>{
     if(args.path==='uuid') return {path:path.join(__dirname,'node_modules/uuid/dist/esm-browser/index.js'),namespace:'local'};
     const req=createRequire(args.importer && path.isAbsolute(args.importer)?args.importer:path.join(__dirname,'entry.js'));
     const spec=args.path==='events'?'events/':args.path;
     return {path:req.resolve(spec),namespace:'local'};
   });
   build.onLoad({filter:/.*/,namespace:'local'},async args=>({contents:await fs.readFile(args.path,'utf8'),loader:args.path.endsWith('.json')?'json':'js'}));
 }}]
}).then(async result=>{
 const dir=path.join(__dirname,'../../src/vendor');
 await fs.mkdir(dir,{recursive:true});
 await fs.writeFile(path.join(dir,'owlbear-sdk.js'),result.outputFiles[0].contents);
 await fs.copyFile(path.join(__dirname,'node_modules/@owlbear-rodeo/sdk/LICENSE'),path.join(dir,'SDK-LICENSE.txt'));
 for (const [pkg, file] of [['events','LICENSE'],['immer','LICENSE'],['uuid','LICENSE.md'],['js-base64','LICENSE.md']]) {
   await fs.copyFile(path.join(__dirname,'node_modules',pkg,file),path.join(dir,pkg+'-LICENSE.txt'));
 }
 console.log('Local SDK bundle:',result.outputFiles[0].contents.length,'bytes');
}).catch(error=>{console.error(error);process.exitCode=1});
