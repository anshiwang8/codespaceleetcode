class App {
  listen() { return this.handle(); }
  handle() { return this.router.handle(); }
  shortcut() { return this.layer.handle(); }
  render() { return "app"; }
}
module.exports = App;
