// URL polyfill specifically for Firebase compatibility

class URLPolyfill {
  constructor(url, base) {
    this.href = url;
    this._parse();
  }

  _parse() {
    // Basic URL parsing for Firebase needs
    const match = this.href.match(/^([^:]+):(\/\/)?(.*)$/);
    if (match) {
      this.protocol = match[1] + ':';
      const rest = match[3] || '';
      
      if (match[2]) { // has '//'
        const parts = rest.split('/');
        this.host = parts[0] || '';
        this.hostname = this.host.split(':')[0] || '';
        this.pathname = '/' + parts.slice(1).join('/');
      } else {
        this.pathname = rest;
        this.host = '';
        this.hostname = '';
      }
    } else {
      this.protocol = '';
      this.pathname = this.href;
      this.host = '';
      this.hostname = '';
    }
    
    this.search = '';
    this.hash = '';
  }

  toString() {
    return this.href;
  }
}

// Export for use as url module replacement
module.exports = {
  URL: URLPolyfill,
  URLSearchParams: class URLSearchParams {
    constructor(init) {
      this.params = new Map();
    }
    
    get(name) { return this.params.get(name); }
    set(name, value) { this.params.set(name, value); }
    has(name) { return this.params.has(name); }
    toString() { return ''; }
  }
};