# mobx-architecture-002: Who constructs a Reaction

**Answer:**

- `packages/mobx/src/api/autorun.ts#autorun`
- `packages/mobx/src/api/autorun.ts#reaction`
- `packages/mobx-react/src/observerClass.ts#createReaction`
- `packages/mobx-react-lite/src/useObserver.ts#createReaction`

## How to get there

1. Search for `new Reaction` across `packages/*/src`. There are five expressions: two inside `autorun` (the sync and the scheduled variant) and one inside `reaction`, all in `packages/mobx/src/api/autorun.ts`; one in `createReaction` in `packages/mobx-react/src/observerClass.ts` (class components); and one in `createReaction` in `packages/mobx-react-lite/src/useObserver.ts` (function components).
2. Group by enclosing function. The two sites in `autorun` collapse into one function, which gives 4.

## Why other functions are wrong

- `when` and `_when` in `api/when.ts` are built on `autorun`, so they do not construct a `Reaction` themselves.
- `useObserver` and `createReactiveRender` call these `createReaction` helpers, but the `new Reaction` expression is in the helper.
- `Reaction.getDisposer_` and the `Reaction` class itself live in `core/reaction.ts`. They do not call `new Reaction`.
- Test files also construct reactions, but the prompt excludes them.
