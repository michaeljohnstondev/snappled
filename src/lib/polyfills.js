// Apply URL polyfill immediately in global scope
console.log('[Polyfill] Checking URL implementation...');

// Force replace URL with our polyfill to ensure protocol property
global.URL = class URL {
  constructor(url, base) {
    this.href = url;
    
    // Parse protocol - this is what Firebase needs
    const protocolMatch = this.href.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
    this.protocol = protocolMatch ? protocolMatch[1] + ':' : '';
    
    // Parse other parts for completeness
    const match = this.href.match(/^(?:([^:/?#]+):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/);
    if (match) {
      this.protocol = match[1] ? match[1] + ':' : '';
      this.host = match[2] || '';
      this.hostname = this.host.split(':')[0] || '';
      this.pathname = match[3] || '/';
      this.search = match[4] ? '?' + match[4] : '';
      this.hash = match[5] ? '#' + match[5] : '';
    } else {
      this.host = '';
      this.hostname = '';
      this.pathname = this.href;
      this.search = '';
      this.hash = '';
    }
  }
  
  toString() {
    return this.href;
  }
  
  toJSON() {
    return this.href;
  }
};

// Add URLSearchParams too
global.URLSearchParams = class URLSearchParams {
  constructor(init = '') {
    this.params = new Map();
    if (typeof init === 'string') {
      const pairs = init.replace(/^\?/, '').split('&').filter(Boolean);
      pairs.forEach(pair => {
        const [key, value = ''] = pair.split('=');
        if (key) {
          this.params.set(decodeURIComponent(key), decodeURIComponent(value));
        }
      });
    }
  }
  
  get(name) { return this.params.get(name) || null; }
  set(name, value) { this.params.set(name, value); }
  has(name) { return this.params.has(name); }
  delete(name) { this.params.delete(name); }
  
  toString() {
    const pairs = [];
    this.params.forEach((value, key) => {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    });
    return pairs.join('&');
  }
};

console.log('[Polyfill] URL polyfill applied - protocol property available:', typeof (new global.URL('https://example.com')).protocol);