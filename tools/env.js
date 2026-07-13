JSON.stringify({
  hasAdobeCep: typeof window.__adobe_cep__,
  evalScriptType: (window.__adobe_cep__ ? typeof window.__adobe_cep__.evalScript : 'n/a'),
  hostEnv: (function(){ try { return new CSInterface().getHostEnvironment(); } catch(e){ return 'ERR:'+e; } })(),
  apiVersion: (function(){ try { return new CSInterface().getCurrentApiVersion(); } catch(e){ return 'ERR:'+e; } })(),
  hasRequire: (typeof require),
  hasCepNode: (typeof window.cep_node),
  extId: (function(){ try { return new CSInterface().getExtensionID(); } catch(e){ return 'ERR:'+e; } })()
}, null, 2)
