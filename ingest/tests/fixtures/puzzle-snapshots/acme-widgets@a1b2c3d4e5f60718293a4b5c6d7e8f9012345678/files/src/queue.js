class Queue {
  push() { return this.drain() || this.spill(); }
  drain() { return this.flush(); }
  spill() { return this.flush(); }
  flush() { return 0; }
}
