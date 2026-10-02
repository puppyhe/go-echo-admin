// Node 18/19 do not expose the browser File constructor globally.  The
// browser-facing upload tests only need its standard Blob behaviour plus the
// metadata fields, so provide a small compatible shim for local/CI runners.
if (typeof globalThis.File === 'undefined' && typeof globalThis.Blob !== 'undefined') {
  globalThis.File = class File extends Blob {
    name;
    lastModified;

    constructor(parts, name, options = {}) {
      super(parts, options);
      this.name = String(name);
      this.lastModified = Number(options.lastModified ?? Date.now());
    }
  };
}
