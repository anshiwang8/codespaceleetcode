class Layer {
  match(path) { return path.endsWith('/'); }
  handle() { return 'done'; }
}
