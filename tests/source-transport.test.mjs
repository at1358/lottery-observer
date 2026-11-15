import test from 'node:test';import assert from 'node:assert/strict';
import {transientSourceError} from '../lib/source-transport.mjs';
test('temporary DNS/socket failures and DOM timeouts are retryable, certificate and identity failures are not',()=>{
 for(const code of ['ENOTFOUND','EAI_AGAIN','ECONNRESET','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET'])assert.equal(transientSourceError(Object.assign(Error('fetch failed'),{cause:{code}})),true);
 assert.equal(transientSourceError(new DOMException('operation timed out','TimeoutError')),true);assert.equal(transientSourceError(new DOMException('operation aborted','AbortError')),true);
 for(const error of [Object.assign(Error('fetch failed'),{cause:{code:'CERT_HAS_EXPIRED'}}),Object.assign(Error('fetch failed'),{cause:{code:'UNABLE_TO_VERIFY_LEAF_SIGNATURE'}}),Object.assign(Error('fetch failed'),{code:'UNSAFE_SOURCE_URL'}),Object.assign(Error('fetch failed'),{code:'UNRELATED_REDIRECT'}),Error('栏目身份不一致'),Error('没有完整资料')])assert.equal(transientSourceError(error),false);
});
