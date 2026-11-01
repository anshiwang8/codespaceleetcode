// scip-python crashes on load on Windows: it runs `new RegExp(path.sep, 'g')`, and a lone backslash
// isn't a valid pattern. Preloaded with `node --require`, this makes that one call mean what it
// intended. The pattern is otherwise a SyntaxError, so no working regex can change meaning.
const NativeRegExp = RegExp;

function PatchedRegExp(pattern, flags) {
  const fixed = pattern === '\\' ? '\\\\' : pattern;
  return new.target ? new NativeRegExp(fixed, flags) : NativeRegExp(fixed, flags);
}
PatchedRegExp.prototype = NativeRegExp.prototype;
Object.setPrototypeOf(PatchedRegExp, NativeRegExp);
globalThis.RegExp = PatchedRegExp;
