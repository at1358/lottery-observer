import test from 'node:test';import assert from 'node:assert/strict';
import {transientSourceError,sourceHttpError} from '../lib/source-transport.mjs';
test('temporary DNS/socket failures and DOM timeouts are retryable, certificate and identity failures are not',()=>{
 for(const code of ['ENOTFOUND','EAI_AGAIN','ECONNRESET','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET'])assert.equal(transientSourceError(Object.assign(Error('fetch failed'),{cause:{code}})),true);
 assert.equal(transientSourceError(new DOMException('operation timed out','TimeoutError')),true);assert.equal(transientSourceError(new DOMException('operation aborted','AbortError')),true);
 for(const error of [Object.assign(Error('fetch failed'),{cause:{code:'CERT_HAS_EXPIRED'}}),Object.assign(Error('fetch failed'),{cause:{code:'UNABLE_TO_VERIFY_LEAF_SIGNATURE'}}),Object.assign(Error('fetch failed'),{code:'UNSAFE_SOURCE_URL'}),Object.assign(Error('fetch failed'),{code:'UNRELATED_REDIRECT'}),Error('栏目身份不一致'),Error('没有完整资料')])assert.equal(transientSourceError(error),false);
});
test('temporary HTTP errors carry source status without changing our API status or retrying access denials',()=>{
 for(const status of [408,500,502,503,504]){const e=sourceHttpError(status);assert.equal(e.httpStatus,status);assert.equal(e.status,undefined);assert.equal(transientSourceError(e),true);assert.match(e.message,new RegExp('HTTP '+status));}
 for(const status of [400,401,403,404,410,429,501,505])assert.equal(transientSourceError(sourceHttpError(status)),false);
 assert.equal(transientSourceError(Object.assign(sourceHttpError(503),{cause:{code:'CERT_HAS_EXPIRED'}})),false);
});
