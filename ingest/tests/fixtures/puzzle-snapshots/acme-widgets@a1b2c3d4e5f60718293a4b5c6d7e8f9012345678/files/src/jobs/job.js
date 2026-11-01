class Job {
  run() { return this.step(); }
  step() { return this.finish(); }
  finish() { return true; }
}
