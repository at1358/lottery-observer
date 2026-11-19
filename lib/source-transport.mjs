// Retry only transient transport/server failures. Certificate errors, unsafe URLs and rejected
// content remain failures; no TLS or source-identity checks are relaxed.
export function sourceHttpError(status){
 return Object.assign(Error(`来源网站返回 HTTP ${status}`),{code:'SOURCE_HTTP_ERROR',httpStatus:status});
}
export function transientSourceError(error){
 if(!error||['UNSAFE_SOURCE_URL','UNRELATED_REDIRECT','ENTRY_HUMAN_VERIFICATION'].includes(error.code))return false;
 if(['TimeoutError','AbortError'].includes(error.name))return true;
 const code=error.cause?.code||error.code;
 if(code==='SOURCE_HTTP_ERROR')return [408,500,502,503,504].includes(error.httpStatus);
 if(code)return ['ENOTFOUND','EAI_AGAIN','ECONNRESET','ECONNREFUSED','ETIMEDOUT','EHOSTUNREACH','ENETUNREACH','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_SOCKET'].includes(code);
 return /^(?:fetch failed|network error|socket hang up)$/i.test(error.message||'');
}
