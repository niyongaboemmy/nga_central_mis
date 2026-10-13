import type { BrowserKind } from "./languages";

/**
 * Web code runs in a sandboxed frame on this page: `sandbox="allow-scripts allow-modals"`
 * without allow-same-origin, so it gets an opaque origin — no MIS cookies, storage or
 * DOM, and it can't navigate the page. Its console (and errors) come back by
 * postMessage, tagged with the run's id so an older run's late output is ignored.
 */

export interface ConsoleEntry {
  level: "log" | "info" | "warn" | "error" | "result";
  text: string;
}

export interface WebFiles {
  html: string;
  css: string;
  js: string;
}

const REACT = "https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js";
const REACT_DOM = "https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js";
const BABEL = "https://cdn.jsdelivr.net/npm/@babel/standalone@7.26.10/babel.min.js";

/** `</script>` inside user code would end our script tag early. */
const scriptSafe = (code: string) => code.replace(/<\/(script)/gi, "<\\/$1");

/** Console capture + prompt() fed from the Input panel, injected before the user's code. */
function bridge(runId: string, stdin: string): string {
  return `<script>(function(){
var RUN=${JSON.stringify(runId)};var lines=${JSON.stringify(stdin ? stdin.replace(/\n$/, "").split("\n") : [])};var at=0;
function fmt(v,d){d=d||0;try{if(typeof v==="string")return d?JSON.stringify(v):v;if(typeof v==="function")return "[Function "+(v.name||"anonymous")+"]";if(v instanceof Error)return v.name+": "+v.message;if(typeof v==="undefined")return "undefined";if(typeof v==="symbol"||typeof v==="bigint")return String(v);if(v&&typeof v==="object"){if(d>3)return Array.isArray(v)?"[Array]":"[Object]";if(Array.isArray(v))return "["+v.map(function(x){return fmt(x,d+1)}).join(", ")+"]";if(typeof Node!=="undefined"&&v instanceof Node)return "<"+(v.nodeName||"node").toLowerCase()+">";var ks=Object.keys(v);return (v.constructor&&v.constructor.name&&v.constructor.name!=="Object"?v.constructor.name+" ":"")+"{ "+ks.map(function(k){return k+": "+fmt(v[k],d+1)}).join(", ")+(ks.length?" ":"")+"}";}return String(v);}catch(e){return String(v);}}
function send(level,args){try{parent.postMessage({__ngaPlayground:RUN,level:level,text:Array.prototype.map.call(args,function(a){return fmt(a,0)}).join(" ")},"*");}catch(e){}}
["log","info","warn","error","debug"].forEach(function(k){var o=console[k];console[k]=function(){send(k==="debug"?"log":k,arguments);try{o&&o.apply(console,arguments);}catch(e){}};});
console.table=function(d){send("log",[d]);};
window.prompt=function(q){var v=at<lines.length?lines[at++]:null;send("info",[(q?q+" ":"")+"\\u21b3 "+(v===null?"(no more input)":v)]);return v;};
window.alert=function(m){send("info",["alert: "+fmt(m)]);};
window.confirm=function(m){send("info",["confirm: "+fmt(m)+" \\u21b3 OK"]);return true;};
window.addEventListener("error",function(e){send("error",[(e.error&&e.error.name?e.error.name+": ":"")+(e.message||"Error").replace(/^Uncaught /,"")+(e.lineno?" (line "+e.lineno+")":"")]);});
window.addEventListener("unhandledrejection",function(e){send("error",["Unhandled promise rejection: "+fmt(e.reason)]);});
window.__ngaDone=function(){setTimeout(function(){parent.postMessage({__ngaPlayground:RUN,done:true},"*");},0);};
})();</script>`;
}

const BASE_STYLE = `<style>html{color-scheme:light}body{font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;margin:16px;line-height:1.5;color:#1f2328}</style>`;

/** Sample page for a CSS-only snippet, so the rules have something to style. */
export const CSS_SAMPLE_HTML = `<h1>Heading</h1>
<p>A paragraph of text with a <a href="#">link</a> and <strong>bold words</strong>.</p>
<button class="btn">Button</button>
<div class="card">
    <h2>Card title</h2>
    <p>Some text inside a card.</p>
</div>
<ul>
    <li>First item</li>
    <li>Second item</li>
</ul>
`;

/** The whole page for one run. */
export function buildDocument(kind: BrowserKind, files: WebFiles, runId: string, stdin: string): string {
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${BASE_STYLE}${bridge(runId, stdin)}`;
  if (kind === "react") {
    return `<!doctype html><html><head>${head}<style>${files.css}</style></head><body><div id="root"></div>
<script src="${REACT}"></script><script src="${REACT_DOM}"></script><script src="${BABEL}"></script>
<script>
(function(){
if(!window.Babel||!window.React){console.error("React could not be loaded — check the internet connection.");return __ngaDone();}
var src=${JSON.stringify(files.js)};
var hasRender=/ReactDOM\\.(createRoot|render)\\s*\\(/.test(src);
var named=/(function|class|const|let|var)\\s+App\\b/.test(src);
src=src.replace(/^\\s*import\\s[^;\\n]*;?\\s*$/gm,"").replace(/^\\s*export\\s+default\\s+function\\s+/m,"function ").replace(/^\\s*export\\s+default\\s+[A-Za-z_$][\\w$]*;?\\s*$/m,"").replace(/^\\s*export\\s+/gm,"");
if(!hasRender&&named)src+="\\nReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));";
try{var out=Babel.transform(src,{presets:[["react",{runtime:"classic"}]],filename:"App.jsx"}).code;
var s=document.createElement("script");s.textContent="const {useState,useEffect,useRef,useMemo,useCallback,useReducer,useContext,createContext,Fragment}=React;\\n"+out;document.body.appendChild(s);}
catch(e){console.error(String(e.message||e).split("\\n").slice(0,6).join("\\n"));}
__ngaDone();
})();
</script></body></html>`;
  }
  if (kind === "js") {
    return `<!doctype html><html><head>${head}</head><body><script>
try{${"\n"}${scriptSafe(files.js)}${"\n"}}catch(e){console.error((e&&e.name?e.name+": ":"")+(e&&e.message||e));}
</script><script>__ngaDone()</script></body></html>`;
  }
  // A page: the user's HTML (a full document or a fragment) with the CSS and JS tabs added.
  const html = files.html.trim();
  const style = files.css.trim() ? `<style>${files.css}</style>` : "";
  const script = files.js.trim() ? `<script>${scriptSafe(files.js)}</script>` : "";
  const done = `<script>window.addEventListener("load",function(){__ngaDone()})</script>`;
  if (/<html[\s>]/i.test(html)) {
    let doc = html.replace(/<head([^>]*)>/i, `<head$1>${head}${style}`);
    if (doc === html) doc = html.replace(/<html([^>]*)>/i, `<html$1><head>${head}${style}</head>`);
    return /<\/body>/i.test(doc) ? doc.replace(/<\/body>/i, `${script}${done}</body>`) : doc + script + done;
  }
  return `<!doctype html><html><head>${head}${style}</head><body>${html}${script}${done}</body></html>`;
}

/** Listen for one run's console output. Returns the unsubscribe. */
export function listenToRun(runId: string, onEntry: (e: ConsoleEntry) => void, onDone: () => void): () => void {
  const handler = (ev: MessageEvent) => {
    const d = ev.data;
    if (!d || typeof d !== "object" || d.__ngaPlayground !== runId) return;
    if (d.done) return onDone();
    const level = ["log", "info", "warn", "error"].includes(d.level) ? d.level : "log";
    onEntry({ level, text: String(d.text ?? "").slice(0, 20000) });
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}

export const newRunId = () => `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
